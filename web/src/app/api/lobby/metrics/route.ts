import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/lobby/metrics?otp=XXXXX
 *
 * Turns the raw counters written by `/api/lobby/doc` on every real push
 * into the exact named metrics the thesis defines (see Chapter III,
 * "Technical Reliability Score"):
 *
 *   - Throughput            T   = N_updates / t_total
 *   - Conflict Resolution   CRT = t_resolved - t_detected   (avg, ms)
 *   - Data Loss Rate        DLR = (D_lost / D_total) * 100
 *   - Consistency Success   CSR = (S_consistent / S_total) * 100
 *   - System Scalability    SS  = (T_N / T_baseline) * 100
 *
 * Every number below comes from a counter incremented by an actual
 * request that actually happened this session — there is no fallback to
 * a fabricated constant. Where a metric has no data yet (e.g. no conflict
 * has occurred, or no solo-session baseline exists), the field is `null`
 * and `insufficientData` explains why, instead of a placeholder like
 * "100%" that would be indistinguishable from a real perfect score.
 *
 * Synchronization Latency (L = t_ack - t_dispatch) is measured entirely
 * client-side (the round trip from THIS device's own dispatch to its own
 * ack) and is intentionally not duplicated here — see
 * `web_session_latency_samples` in localStorage, read directly by the
 * dashboard.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');

  if (!otp) {
    return NextResponse.json({ error: 'Missing otp' }, { status: 400, headers: corsHeaders });
  }

  try {
    const stats = ((await redis.get(`doc_stats:${otp}`)) as any) || null;
    const unresolvedRaw = (await redis.get(`conflicts:${otp}`)) as any[];
    const unresolvedConflicts = Array.isArray(unresolvedRaw) ? unresolvedRaw.length : 0;

    if (!stats || stats.totalPushes === 0) {
      return NextResponse.json({
        success: true,
        hasData: false,
        unresolvedConflicts,
      }, { headers: corsHeaders });
    }

    const sessionSeconds = Math.max(1, (Date.now() - stats.sessionStartedAt) / 1000);
    const throughputPerSec = stats.totalPushes / sessionSeconds;

    const conflictResolutionTimeMs = stats.totalConflicts > 0
      ? Math.round(stats.totalMergeMs / stats.totalConflicts)
      : null;

    const dataLossRatePct = stats.totalChars > 0
      ? Math.round((stats.totalLostChars / stats.totalChars) * 10000) / 100
      : 0;

    const consistencySuccessRatePct = stats.totalPushes > 0
      ? Math.round((stats.successfulPushes / stats.totalPushes) * 10000) / 100
      : null;

    const conflictDetectionRatePct = stats.mergeAttempts > 0
      ? Math.round((stats.totalConflicts / stats.mergeAttempts) * 10000) / 100
      : null;

    const resolutionAccuracyPct = stats.totalConflicts > 0
      ? Math.round(((stats.totalConflicts - stats.mergeErrors) / stats.totalConflicts) * 10000) / 100
      : null;

    // A throughput "rate" from just 2 samples is noise, not a measurement
    // — e.g. two solo pushes that happen to land 30 seconds apart (one at
    // session start, one much later) understate solo throughput just
    // because of the gap between them, not because the system is slow.
    // Require a real sample size per bucket (5+) AND a minimum observed
    // span before trusting the resulting percentage; otherwise report
    // "insufficient data" honestly rather than a number that LOOKS
    // precise (e.g. "4333.69%") but isn't statistically meaningful.
    const MIN_SAMPLES = 5;
    const MIN_SPAN_MS = 1000;
    const soloSpanMs = stats.soloLastAt - stats.soloFirstAt;
    const multiSpanMs = stats.multiLastAt - stats.multiFirstAt;
    const hasScalabilityData = stats.soloPushes >= MIN_SAMPLES && stats.multiPushes >= MIN_SAMPLES
      && soloSpanMs >= MIN_SPAN_MS && multiSpanMs >= MIN_SPAN_MS;

    let systemScalabilityPct: number | null = null;
    if (hasScalabilityData) {
      const soloThroughput = stats.soloPushes / (soloSpanMs / 1000);
      const multiThroughput = stats.multiPushes / (multiSpanMs / 1000);
      systemScalabilityPct = Math.round((multiThroughput / soloThroughput) * 10000) / 100;
    }

    return NextResponse.json({
      success: true,
      hasData: true,
      raw: stats,
      metrics: {
        totalPushes: stats.totalPushes,
        totalConflicts: stats.totalConflicts,
        unresolvedConflicts,
        throughputPerSec: Math.round(throughputPerSec * 100) / 100,
        throughputPerMin: Math.round(throughputPerSec * 60 * 100) / 100,
        conflictResolutionTimeMs,
        dataLossRatePct,
        consistencySuccessRatePct,
        conflictDetectionRatePct,
        resolutionAccuracyPct,
        systemScalabilityPct,
        scalabilityInsufficientData: !hasScalabilityData,
      },
    }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
