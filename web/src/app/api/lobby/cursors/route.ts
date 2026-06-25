import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Cursor position store — keyed by `roomOtp:nodeId`.
 * Stored in global so it survives Next.js HMR.
 */
const g = global as typeof globalThis & {
  _docusyncCursors?: Map<string, { nodeId: string; displayName: string; color: string; from: number; to: number; fileId: number; ts: number }>;
};
if (!g._docusyncCursors) {
  g._docusyncCursors = new Map();
}
const cursors = g._docusyncCursors!;

/** Remove cursors older than 10 seconds (inactive users) */
function cleanCursors() {
  const stale = Date.now() - 10_000;
  for (const [key, c] of cursors.entries()) {
    if (c.ts < stale) cursors.delete(key);
  }
}

/**
 * POST /api/lobby/cursors
 * Body: { otp, nodeId, displayName, color, from, to, fileId }
 * Stores the cursor position for this node.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, nodeId, displayName, color, from, to, fileId } = body;
    if (!otp || !nodeId) {
      return NextResponse.json({ error: 'Missing otp or nodeId' }, { status: 400, headers: corsHeaders });
    }
    cleanCursors();
    cursors.set(`${otp}:${nodeId}`, {
      nodeId,
      displayName: displayName || nodeId.slice(0, 8),
      color: color || '#4f7df8',
      from: Number(from) || 0,
      to: Number(to) || 0,
      fileId: Number(fileId) || 0,
      ts: Date.now(),
    });
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
  cleanCursors();
  const url = new URL(request.url);
  const otp = url.searchParams.get('otp');
  const myNodeId = url.searchParams.get('nodeId');
  const fileId = Number(url.searchParams.get('fileId') || '0');

  if (!otp) {
    return NextResponse.json({ cursors: [] }, { headers: corsHeaders });
  }

  const result = [];
  for (const [key, c] of cursors.entries()) {
    if (!key.startsWith(`${otp}:`)) continue;
    if (c.nodeId === myNodeId) continue;        // skip self
    if (c.fileId !== fileId) continue;          // skip different files
    result.push(c);
  }

  return NextResponse.json({ cursors: result }, { headers: corsHeaders });
}
