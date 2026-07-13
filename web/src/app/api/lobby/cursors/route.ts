import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/lobby/cursors
 * Body: { otp, nodeId, displayName, color, from, to, fileId }
 * Stores the cursor position in Redis with a 15-second TTL.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, nodeId, displayName, color, from, to, fileId } = body;

    if (!otp || !nodeId) {
      return NextResponse.json({ error: 'Missing otp or nodeId' }, { status: 400, headers: corsHeaders });
    }

    const cursor = {
      nodeId,
      displayName: displayName || nodeId.slice(0, 8),
      color: color || '#4f7df8',
      from: Number(from) || 0,
      to: Number(to) || 0,
      fileId: Number(fileId) || 0,
      ts: Date.now(),
    };

    // 15-second TTL: if a user stops sending heartbeats, their cursor vanishes
    await redis.set(`cursor:${otp}:${nodeId}`, cursor, { ex: 15 });

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: corsHeaders });
  }
}

/**
 * GET /api/lobby/cursors?otp=XXXXX&nodeId=MYID&fileId=1
 * Returns all OTHER users' cursor positions in this room+file.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const otp = url.searchParams.get('otp');
  const myNodeId = url.searchParams.get('nodeId');
  const fileId = Number(url.searchParams.get('fileId') || '0');

  if (!otp) {
    return NextResponse.json({ cursors: [] }, { headers: corsHeaders });
  }

  // Scan for all cursor keys in this room
  const keys = await redis.keys(`cursor:${otp}:*`);

  if (keys.length === 0) {
    return NextResponse.json({ cursors: [] }, { headers: corsHeaders });
  }

  type CursorEntry = {
    nodeId: string;
    displayName: string;
    color: string;
    from: number;
    to: number;
    fileId: number;
    ts: number;
  };

  const allCursors = (await redis.mget(...keys)) as CursorEntry[];

  const result = allCursors
    .filter((c): c is CursorEntry => c !== null)
    .filter(c => c.nodeId !== myNodeId)   // skip self
    .filter(c => c.fileId === fileId);    // same file only

  return NextResponse.json({ cursors: result }, { headers: corsHeaders });
}
