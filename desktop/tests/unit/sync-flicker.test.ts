import { runBenchmark, SimulatedPeer, MockPrismaClient } from '@/benchmark/engine-benchmark';
import { VectorClock } from '@/engine/vector-clock/vector-clock';
import { EventLogService } from '@/engine/log-sync/event-log';
import { LWWResolver } from '@/engine/lww/lww-resolver';

describe('Sync Flicker Scenario Benchmark', () => {
  it('should run deterministic sync-flicker scenario and verify no duplicates or data loss', async () => {
    console.log("=== SCENARIO 5: Rapid Offline -> Online -> Offline Flicker Workload ===");
    for (const count of [2, 5]) {
      const res = await runBenchmark(count, 'sync-flicker', 5);
      console.log(`\n--- ${count} Peers ---`);
      console.table(res.results);
      console.log("\n[Verification] Flicker Steps & Duplicate Vector Clock Checks:");
      console.table(res.scriptsUsed);
      expect(res.results.consistencyRate).toBe(100);
    }
  });

  /**
   * Targeted regression test for the per-slot dedup bug specifically with 3 peers.
   *
   * Scenario:
   *   - Peer0 = Desktop (host, nodeIndex=0)
   *   - Peer1 = Web     (nodeIndex=1, the flickering peer)
   *   - Peer2 = Mobile  (nodeIndex=2)
   *
   * While Peer1 is offline, Peer2 makes an edit. The server's global clock
   * now has Peer2's slot advanced. Peer1 then reconnects and resends its
   * original push with an UNCHANGED clock — if dedup is whole-vector, this
   * will look 'concurrent' (not 'equal') and be wrongly escalated as a conflict.
   * With the per-slot fix it must be deduplicated cleanly.
   */
  it('per-slot dedup guard: 3-peer flicker should NOT produce false conflict when Mobile edits while Web is offline', async () => {
    const INITIAL = "DocuSync baseline.\nShared thesis doc.";

    const desktop = new SimulatedPeer('desktop', 3, 0, INITIAL);
    const web     = new SimulatedPeer('web',     3, 1, INITIAL);
    const mobile  = new SimulatedPeer('mobile',  3, 2, INITIAL);

    // Step 1: Web makes an edit while online — server acknowledges
    web.isOffline = false;
    const edit1 = await web.edit(INITIAL + "\n[Web Edit 1]", 1);

    // Server (Desktop) receives Web's edit normally
    const push1Result = await desktop.receivePush(
      web.nodeId, edit1.eventId, 1, edit1.deltaBase64,
      edit1.logicalTimestamp, edit1.vcJson, edit1.newContent
    );
    console.log(`\n[Dedup Test] Step 1 - Push Edit 1: outcome=${push1Result.outcome}`);
    expect(push1Result.outcome).toBe('merged');

    // Capture the server clock state BEFORE Web goes offline
    const serverClockBeforeMobileEdit = JSON.stringify(desktop.vc.toJSON());

    // Step 2: Web goes offline BEFORE getting the ack — Web's local VC does NOT update
    web.isOffline = true;

    // Step 3: Mobile makes an unrelated edit — advances server's Mobile slot
    mobile.isOffline = false;
    const mobileEdit = await mobile.edit(INITIAL + "\n[Mobile Edit — concurrent]", 1);
    const mobilePushResult = await desktop.receivePush(
      mobile.nodeId, mobileEdit.eventId, 1, mobileEdit.deltaBase64,
      mobileEdit.logicalTimestamp, mobileEdit.vcJson, mobileEdit.newContent
    );
    console.log(`[Dedup Test] Step 2 - Mobile Edit on server: outcome=${mobilePushResult.outcome}`);

    // Apply the merge result so the server's global clock actually advances.
    // In the real server peer-manager.ts the VC is merged before escalating.
    // In the SimulatedPeer harness the merged VC is returned in mergedVcJson — apply it.
    if (mobilePushResult.mergedVcJson) {
      await desktop.receiveMergeAccept(mobileEdit.newContent, mobilePushResult.mergedVcJson);
    }

    const serverClockAfterMobileEdit = JSON.stringify(desktop.vc.toJSON());
    console.log(`[Dedup Test] Server clock BEFORE mobile edit: ${serverClockBeforeMobileEdit}`);
    console.log(`[Dedup Test] Server clock AFTER  mobile edit: ${serverClockAfterMobileEdit}`);
    expect(serverClockBeforeMobileEdit).not.toBe(serverClockAfterMobileEdit); // Mobile DID change global clock

    // Step 4: Web comes back online and resends Edit 1 with ITS STALE clock (Web slot unchanged)
    web.isOffline = false;
    const resendResult = await desktop.receivePush(
      web.nodeId, edit1.eventId, 1, edit1.deltaBase64,
      edit1.logicalTimestamp, edit1.vcJson, edit1.newContent
    );
    console.log(`[Dedup Test] Step 3 - Resend of Edit 1 (stale clock, Mobile moved global clock): outcome=${resendResult.outcome}`);

    // CRITICAL ASSERTION: Must NOT be 'escalated'.
    // With whole-vector compare it would be 'concurrent' because Mobile advanced the server's clock.
    // With per-slot dedup fix it must be 'ignored'/'upToDate'.
    expect(resendResult.outcome).not.toBe('escalated');
    console.log(`[Dedup Test] PASS — resend correctly deduplicated as '${resendResult.outcome}', not 'escalated'.`);
  });
});
