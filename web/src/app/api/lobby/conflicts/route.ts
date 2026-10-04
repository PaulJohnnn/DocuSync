import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/lobby/conflicts?otp=XXXXX
 *
 * Returns all active offline conflicts for a room.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing otp' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `conflicts:${otp}`;
    const rawConflicts = await redis.get(key) as any[];
    const conflicts = Array.isArray(rawConflicts) ? rawConflicts : [];

    return NextResponse.json({ conflicts }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Conflicts GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * DELETE /api/lobby/conflicts?otp=XXXXX&conflictId=YYYY
 * 
 * Removes a conflict from the room's conflict list once resolved.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');
    const conflictId = url.searchParams.get('conflictId');

    if (!otp || !conflictId) {
      return NextResponse.json(
        { error: 'Missing otp or conflictId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `conflicts:${otp}`;
    const rawConflicts = await redis.get(key) as any[];
    if (Array.isArray(rawConflicts)) {
      const updatedList = rawConflicts.filter(c => c.conflictId !== conflictId);
      await redis.set(key, updatedList, { ex: 86400 });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Conflicts DELETE] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/lobby/conflicts
 * 
 * Adds a new conflict to the room's conflict list.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, fileId, localContent, serverContent, mergedContent, conflictId } = body;

    if (!otp || !fileId || !conflictId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `conflicts:${otp}`;
    const rawConflicts = await redis.get(key) as any[];
    let conflicts = Array.isArray(rawConflicts) ? rawConflicts : [];

    // The client mints a fresh conflictId on every call, so a conflictId
    // check never catches a repeat. Matching on BOTH sides' content doesn't
    // either: the editor re-detects the same unresolved divergence on every
    // poll tick, and the local side has drifted by whatever the user typed
    // in between, so one divergence against one server state was filed as a
    // new conflict per keystroke — the stack of identical-looking merge
    // notifications a reviewer actually sees.
    //
    // What identifies a conflict is the point the document diverged from:
    // the same file, still unresolved against the same server state, is the
    // same conflict no matter how far the local draft has moved since. The
    // open record is refreshed in place so it shows the latest local text.
    const existingIdx = conflicts.findIndex(c =>
      String(c.fileId) === String(fileId) &&
      c.serverContent === serverContent
    );

    const newConflict = {
      conflictId: existingIdx >= 0 ? conflicts[existingIdx].conflictId : conflictId,
      fileId,
      localContent,
      serverContent,
      mergedContent,
      // Server time, so every device shows one divergence at one moment
      // rather than at whatever each peer's clock happened to read. The
      // first sighting is what's kept — a conflict is dated from when it
      // arose, not from the last time someone's editor noticed it again.
      timestamp: existingIdx >= 0
        ? conflicts[existingIdx].timestamp
        : Date.now(),
    };

    if (existingIdx >= 0) {
      conflicts[existingIdx] = newConflict;
    } else {
      conflicts.unshift(newConflict);
      // Keep only latest 50 conflicts
      conflicts = conflicts.slice(0, 50);
    }
    await redis.set(key, conflicts, { ex: 86400 });

    return NextResponse.json({ success: true, conflict: newConflict }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Conflicts POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
