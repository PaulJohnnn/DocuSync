import { NextResponse } from 'next/server';
// @ts-ignore
import { runBenchmark } from '../../../../../../desktop/src/benchmark/engine-benchmark';

export async function GET() {
  try {
    const results100 = [];
    for (const count of [2, 5, 10, 15]) {
       results100.push(await runBenchmark(count, 'sync-100', 5));
    }
    const resultsMixed = [];
    for (const count of [2, 5, 10, 15]) {
       resultsMixed.push(await runBenchmark(count, 'sync-mixed', 5));
    }
    const resultsOffline = [];
    for (const count of [2, 5, 10, 15]) {
       resultsOffline.push(await runBenchmark(count, 'offline', 5));
    }
    return NextResponse.json({ success: true, results100, resultsMixed, resultsOffline });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}
