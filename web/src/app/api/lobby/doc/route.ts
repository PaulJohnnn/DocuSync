import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');
  const fileId = searchParams.get('fileId');
  const since = searchParams.get('since') || '0';

  if (!otp || !fileId) {
    return NextResponse.json({ error: 'Missing otp or fileId' }, { status: 400, headers: corsHeaders });
  }

  try {
    const key = `doc_snapshot:${otp}:${fileId}`;
    const snapshot = await redis.get(key) as any;

    if (!snapshot) {
      return NextResponse.json({ upToDate: true, snapshot: null }, { headers: corsHeaders });
    }

    const clientSince = parseInt(since, 10);
    const isUpToDate = clientSince >= (snapshot.committedAt || 0) && clientSince > 0;

    return NextResponse.json({
      upToDate: isUpToDate,
      snapshot: isUpToDate ? null : snapshot,
      content: isUpToDate ? null : snapshot.content,
      authorNodeId: snapshot.authorNodeId,
    }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, fileId, content, authorNodeId, vectorClock, seq, committedAt } = body;

    if (!otp || !fileId || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const key = `doc_snapshot:${otp}:${fileId}`;
    
    // Get existing to prevent backwards time travel
    const existing = await redis.get(key) as any;
    const now = Date.now();
    const incomingCommittedAt = committedAt || now;
    
    if (existing && existing.committedAt && existing.committedAt > incomingCommittedAt) {
      // Don't overwrite newer data with older data
      return NextResponse.json({ success: true, ignored: true }, { headers: corsHeaders });
    }

    const snapshot = {
      content,
      authorNodeId,
      vectorClock: vectorClock || null,
      seq: seq || existing?.seq || 0,
      committedAt: incomingCommittedAt,
    };

    // Store for 24 hours
    await redis.set(key, snapshot, { ex: 60 * 60 * 24 });

    return NextResponse.json({ success: true, snapshot }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
