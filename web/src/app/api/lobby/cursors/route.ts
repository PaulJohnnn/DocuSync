import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { readCursors, rememberCursorNode, CURSOR_TTL_SECONDS } from '@/lib/roomCursors';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const dynamic = 'force-dynamic';

/**
 * POST /api/lobby/cursors
 * Body: { otp, nodeId, displayName, color, from, to, fileId, docKey }
 * Stores the cursor position in Redis with a 15-second TTL.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, nodeId, displayName, color, from, to, fileId, docKey } = body;

    if (!otp || !nodeId) {
      return NextResponse.json({ error: 'Missing otp or nodeId' }, { status: 400, headers: corsHeaders });
    }

    const cursor = {
      nodeId,
      displayName: displayName || 'Connecting…',
      color: color || '#4f7df8',
      from: Number(from) || 0,
      to: Number(to) || 0,
      // Which version of the document that position was measured against.
      //
      // A position is only meaningful against one specific text. Without
      // this a peer drew the number against whatever it happened to be
      // holding, and for the second or so before the edit arrived the
      // caret landed somewhere else -- in prose a few characters out and
      // invisible, inside a table one cell over and obvious.
      docKey: typeof docKey === 'string' ? docKey : null,
      fileId: Number(fileId) || 0,
      ts: Date.now(),
    };

    // 15-second TTL: if a user stops sending heartbeats, their cursor vanishes.
    // The roster entry alongside it is what lets a reader find this caret
    // without scanning the keyspace for it.
    await Promise.all([
      redis.set(`cursor:${otp}:${nodeId}`, cursor, { ex: CURSOR_TTL_SECONDS }),
      rememberCursorNode(otp, nodeId),
    ]);

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

  return NextResponse.json(
    { cursors: await readCursors(otp, myNodeId, fileId) },
    { headers: corsHeaders },
  );
}
