import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Mock session log data for thesis evaluation
    const log = Array.from({ length: limit }).map((_, i) => ({
      timestamp: Date.now() - i * 60000,
      nodeId: `node-${Math.random().toString(36).substring(2, 8)}`,
      action: i % 3 === 0 ? 'USER_JOIN' : i % 3 === 1 ? 'SYNC_CHECKIN' : 'CONFLICT_RESOLVE',
      detail: `Action ${i} recorded`
    }));

    return NextResponse.json({ log }, { status: 200, headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
