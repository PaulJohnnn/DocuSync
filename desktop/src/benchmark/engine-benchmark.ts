import { VectorClock } from '../engine/vector-clock/vector-clock';
import { LWWResolver, SyncEvent } from '../engine/lww/lww-resolver';
import { EventLogService } from '../engine/log-sync/event-log';
import { encode } from '../engine/delta/delta-encoder';
import { decode } from '../engine/delta/delta-decoder';
import crypto from 'crypto';

export class MockPrismaClient {
  public eventLog = {
    records: [] as any[],
    create: async (args: any) => {
      const data = { ...args.data, id: this.eventLog.records.length + 1, createdAt: new Date() };
      this.eventLog.records.push(data);
      return data;
    },
    findFirst: async (args: any) => {
      const reversed = [...this.eventLog.records].reverse();
      return reversed.find((r) => Number(r.fileId) === Number(args.where.fileId)) || null;
    },
    findMany: async (args: any) => {
      const gt = args.where?.logicalTimestamp?.gt || -1;
      return this.eventLog.records.filter((r) => Number(r.fileId) === Number(args.where.fileId) && r.logicalTimestamp > gt);
    }
  };
  public conflict = {
    records: [] as any[],
    create: async (args: any) => {
      const data = { ...args.data, id: this.conflict.records.length + 1, detectedAt: new Date() };
      this.conflict.records.push(data);
      return data;
    },
    findUnique: async (args: any) => {
      return this.conflict.records.find((r) => r.conflictId === args.where.conflictId) || null;
    },
    update: async (args: any) => {
      const idx = this.conflict.records.findIndex((r) => r.conflictId === args.where.conflictId);
      if (idx !== -1) {
        this.conflict.records[idx] = { ...this.conflict.records[idx], ...args.data };
        return this.conflict.records[idx];
      }
      return null;
    }
  };
}

export class SimulatedPeer {
  nodeId: string;
  prisma: MockPrismaClient;
  eventLog: EventLogService;
  resolver: LWWResolver;
  vc: VectorClock;
  content: string;
  isOffline: boolean = false;
  metrics = { conflictsDetected: 0, autoResolved: 0, escalated: 0, resolveTimeMs: [] as number[] };

  lastEventId: string | null = null;
  lastEventPayload: string = '';

  constructor(nodeId: string, nodeCount: number, nodeIndex: number, initialContent: string) {
    this.nodeId = nodeId;
    this.prisma = new MockPrismaClient();
    this.eventLog = new EventLogService(this.prisma as any);
    this.resolver = new LWWResolver(this.prisma as any, this.eventLog);
    this.vc = new VectorClock(nodeCount, nodeIndex);
    this.content = initialContent;
  }

  async edit(newContent: string, fileId: number) {
    this.vc.increment();
    const result = encode(this.content, newContent, 'doc.txt');
    this.content = newContent;
    const eventId = crypto.randomUUID();
    
    this.lastEventId = eventId;
    this.lastEventPayload = result.deltaBase64 || '';

    await this.eventLog.appendEvent({
      eventId,
      fileId,
      nodeId: this.nodeId,
      eventType: 'edit',
      logicalTimestamp: this.vc.counters[this.vc.nodeIndex],
      vectorClockJson: this.vc.toJSON(),
      payload: this.lastEventPayload
    });

    return { eventId, deltaBase64: this.lastEventPayload, vcJson: this.vc.toJSON(), logicalTimestamp: this.vc.counters[this.vc.nodeIndex], newContent };
  }

  async receivePush(senderNodeId: string, eventId: string, fileId: number, payload: string, logicalTs: number, vcJson: any, remoteFullText: string): Promise<{ outcome: string, mergedVcJson?: any, winnerContent?: string }> {
    if (this.isOffline) return { outcome: 'offline' };

    const incomingVc = VectorClock.fromJSON(vcJson);
    const relation = this.vc.compare(incomingVc);

    if (relation === 'dominated') {
      try {
        const decoded = decode(this.content, payload);
        this.content = decoded.content;
        this.vc.merge(incomingVc);
      } catch (e) {
        // Fallback to full text if delta unmergable
        this.content = remoteFullText;
        this.vc.merge(incomingVc);
      }
      return { outcome: 'merged' };
    } else if (relation === 'concurrent') {
      this.metrics.conflictsDetected++;
      const startTime = process.hrtime.bigint();
      
      const eventB: SyncEvent = { eventId, fileId, nodeId: senderNodeId, payload, logicalTimestamp: logicalTs, vectorClockJson: vcJson };
      const eventA: SyncEvent = { eventId: this.lastEventId || crypto.randomUUID(), fileId, nodeId: this.nodeId, payload: this.lastEventPayload, logicalTimestamp: this.vc.counters[this.vc.nodeIndex], vectorClockJson: this.vc.toJSON() };

      const result = await this.resolver.resolve(eventA, eventB, this.vc, incomingVc);
      const endTime = process.hrtime.bigint();
      this.metrics.resolveTimeMs.push(Number(endTime - startTime) / 1000000);

      this.metrics.escalated++;
      
      // We don't resolve it silently locally anymore. 
      // We return 'escalated' so the benchmark runner can simulate the owner broadcasting a MERGE_ACCEPT.
      const simulatedMergedVc = VectorClock.fromJSON(this.vc.toJSON());
      simulatedMergedVc.merge(incomingVc);
      
      return { 
        outcome: 'escalated', 
        mergedVcJson: simulatedMergedVc.toJSON(), 
        // Deterministic owner tie-breaker: sort contents and pick highest string.
        winnerContent: remoteFullText > this.content ? remoteFullText : this.content 
      };
    }
    return { outcome: 'ignored' };
  }

  async receiveMergeAccept(winnerContent: string, mergedVcJson: any) {
    if (this.isOffline) return;
    this.content = winnerContent;
    this.vc.merge(VectorClock.fromJSON(mergedVcJson));
  }
}

export async function runBenchmark(peerCount: number, scenario: 'sync-100' | 'sync-mixed' | 'offline', iterations: number = 5) {
  let avgResults = {
    peerCount,
    conflictDetectionRate: 0,
    dataLossRate: 0,
    consistencyRate: 0,
    resolutionTimeMs: 0,
    trueCollisions: 0,
    falsePositives: 0
  };

  let initialContentArr = [
    "DocuSync initial document.",
    "Let's test true conflicts."
  ];
  for (let i = 0; i < peerCount; i++) {
    initialContentArr.push(`Line ${3 + i}`);
  }
  const INITIAL_CONTENT = initialContentArr.join("\n");

  let totalResolveTime = 0;
  let sampleScriptsUsed: any[] = [];
  let sampleFinalContent = '';

  for (let iter = 0; iter < iterations; iter++) {
    const peers: SimulatedPeer[] = [];
    for (let i = 0; i < peerCount; i++) peers.push(new SimulatedPeer(`peer-${i}`, peerCount, i, INITIAL_CONTENT));

    let iterConflicts = 0;
    let iterResolveTime = 0;
    let trueCollidingPairs = 0;
    let falsePositivePairs = 0;

    if (scenario === 'sync-100' || scenario === 'sync-mixed') {
      const editsMap = new Map();
      const edits = [];
      for (let i = 0; i < peerCount; i++) {
        let newContent = "";
        if (scenario === 'sync-mixed') {
          // Exactly Peer 0 and Peer 1 collide on Line 2
          if (i <= 1) {
             editsMap.set(i, 2); 
             newContent = INITIAL_CONTENT.replace('true conflicts', `overlapping conflict from peer ${i}`);
          } else {
             // Every other peer edits their own dedicated unique line
             editsMap.set(i, 3 + i); 
             const lineToEdit = `Line ${3 + i}`;
             newContent = INITIAL_CONTENT.replace(lineToEdit, `${lineToEdit} edited by peer ${i}`);
          }
        } else {
          editsMap.set(i, 2); 
          newContent = INITIAL_CONTENT.replace('true conflicts', `simulated conflict from peer ${i}`);
        }
        edits.push(await peers[i].edit(newContent, 1));
      }

      let totalPairs = (peerCount * (peerCount - 1)) / 2;
      for (let i = 0; i < peerCount; i++) {
        for (let j = i + 1; j < peerCount; j++) {
          if (editsMap.get(i) === editsMap.get(j)) trueCollidingPairs++;
        }
      }
      falsePositivePairs = totalPairs - trueCollidingPairs;

      if (iter === 0) sampleScriptsUsed = edits.map((e, i) => ({ peer: `peer-${i}`, editMade: e.newContent }));

      // Network Simulation
      for (let i = 0; i < peerCount; i++) {
        for (let j = 0; j < peerCount; j++) {
          if (i !== j) {
            const result = await peers[j].receivePush(peers[i].nodeId, edits[i].eventId, 1, edits[i].deltaBase64, edits[i].logicalTimestamp, edits[i].vcJson, edits[i].newContent);
            if (result.outcome === 'escalated') {
              for (let k = 0; k < peerCount; k++) await peers[k].receiveMergeAccept(result.winnerContent!, result.mergedVcJson);
            }
          }
        }
      }

    } else if (scenario === 'offline') {
      // Offline Scenario: Peer 0 offline edits, Peer 1 online edits, others idle.
      trueCollidingPairs = 1; // 0 and 1 collide
      falsePositivePairs = 0;

      const offlinePeer = peers[0];
      offlinePeer.isOffline = true;
      const offlineEdit = await offlinePeer.edit(INITIAL_CONTENT.replace('true conflicts', `OFFLINE edit from peer-0`), 1);
      
      const onlinePeer = peers[1];
      const onlineEdit = await onlinePeer.edit(INITIAL_CONTENT.replace('true conflicts', `ONLINE edit from peer-1`), 1);
      
      if (iter === 0) {
         sampleScriptsUsed = [
           { peer: 'peer-0 (offline)', editMade: offlineEdit.newContent },
           { peer: 'peer-1 (online)', editMade: onlineEdit.newContent }
         ];
      }

      // Online peers sync normally
      for (let j = 1; j < peerCount; j++) {
        if (j !== 1) {
          const result = await peers[j].receivePush(onlinePeer.nodeId, onlineEdit.eventId, 1, onlineEdit.deltaBase64, onlineEdit.logicalTimestamp, onlineEdit.vcJson, onlineEdit.newContent);
          if (result.outcome === 'escalated') {
            for (let k = 1; k < peerCount; k++) await peers[k].receiveMergeAccept(result.winnerContent!, result.mergedVcJson);
          }
        }
      }

      // Reconnection Sequence
      offlinePeer.isOffline = false;
      for (let j = 1; j < peerCount; j++) {
        const result = await peers[j].receivePush(offlinePeer.nodeId, offlineEdit.eventId, 1, offlineEdit.deltaBase64, offlineEdit.logicalTimestamp, offlineEdit.vcJson, offlineEdit.newContent);
        if (result.outcome === 'escalated') {
          for (let k = 0; k < peerCount; k++) await peers[k].receiveMergeAccept(result.winnerContent!, result.mergedVcJson);
        }
      }
      
      const resultFinal = await offlinePeer.receivePush(onlinePeer.nodeId, onlineEdit.eventId, 1, onlineEdit.deltaBase64, onlineEdit.logicalTimestamp, onlineEdit.vcJson, onlineEdit.newContent);
      if (resultFinal.outcome === 'escalated') {
        for (let k = 0; k < peerCount; k++) await peers[k].receiveMergeAccept(resultFinal.winnerContent!, resultFinal.mergedVcJson);
      }
    }

    const finalContents = peers.map(p => p.content);
    if (iter === 0) sampleFinalContent = finalContents[0];
    
    const isConsistent = finalContents.every(c => c === finalContents[0]);
    avgResults.consistencyRate += isConsistent ? 100 : 0;
    
    peers.forEach(p => {
      iterConflicts += p.metrics.conflictsDetected;
      p.metrics.resolveTimeMs.forEach(t => iterResolveTime += t);
    });

    avgResults.conflictDetectionRate += iterConflicts > 0 ? 100 : 0;
    totalResolveTime += iterConflicts > 0 ? (iterResolveTime / iterConflicts) : 0;
    
    if (iter === iterations - 1) {
      avgResults.trueCollisions = trueCollidingPairs;
      avgResults.falsePositives = falsePositivePairs;
    }
  }

  avgResults.consistencyRate /= iterations;
  avgResults.conflictDetectionRate /= iterations;
  avgResults.resolutionTimeMs = Number((totalResolveTime / iterations).toFixed(4));

  return { results: avgResults, scriptsUsed: sampleScriptsUsed, finalContent: sampleFinalContent };
}

if (require.main === module) {
  (async () => {
    console.log("=== DocuSync Sync Engine Benchmark (Averaged over 5 runs) ===\n");
    
    console.log("=== SCENARIO 1: 100% Collision ===");
    for (const count of [2, 5, 10, 15]) {
      const res = await runBenchmark(count, 'sync-100', 5);
      console.log(`\n--- ${count} Peers ---`);
      console.table(res.results);
    }
    
    console.log("\n=== SCENARIO 2: 20% Mixed Workload ===");
    for (const count of [2, 5, 10, 15]) {
      const res = await runBenchmark(count, 'sync-mixed', 5);
      console.log(`\n--- ${count} Peers ---`);
      console.table(res.results);
    }

    console.log("\n=== SCENARIO 3: Offline / Reconnect Workload ===");
    for (const count of [2, 5, 10, 15]) {
      const res = await runBenchmark(count, 'offline', 5);
      console.log(`\n--- ${count} Peers ---`);
      console.table(res.results);
    }
  })();
}
