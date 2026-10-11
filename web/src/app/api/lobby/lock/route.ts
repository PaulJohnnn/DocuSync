import { NextResponse } from 'next/server';
import { LobbyEntry, FileLock, canEditFile } from '../store';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DAY_SECONDS = 60 * 60 * 24;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Read the lock state of every file in a room. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');
  const nodeId = searchParams.get('nodeId');

  if (!otp) {
    return NextResponse.json({ error: 'Missing otp' }, { status: 400, headers: corsHeaders });
  }

  const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
  if (!lobby) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404, headers: corsHeaders });
  }

  const fileLocks = lobby.fileLocks || {};
  // Answered per file so the caller does not have to re-implement the rule
  // and drift from it.
  const permissions: Record<string, boolean> = {};
  for (const key of Object.keys(fileLocks)) {
    permissions[key] = canEditFile(lobby, key, nodeId);
  }

  return NextResponse.json(
    {
      success: true,
      isLocked: !!lobby.isLocked,
      fileLocks,
      permissions,
      isHost: !!nodeId && nodeId === lobby.hostNodeId,
    },
    { headers: corsHeaders }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, nodeId, isLocked, fileId, locked, allowedNodeIds } = body;

    if (!otp || !nodeId) {
      return NextResponse.json(
        { error: 'Missing otp or nodeId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;

    if (!lobby) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (lobby.hostNodeId !== nodeId) {
      return NextResponse.json(
        { error: 'Forbidden: Only the host of this room can change locks.' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Two different locks share this route because they share the one
    // authorisation rule. Without `fileId` this is the original ROOM lock,
    // which stops new people joining. With `fileId` it is a lock on one
    // DOCUMENT, naming who may still type in it — Panel 1 #4 and Panel 2 #5.
    if (fileId === undefined || fileId === null || fileId === '') {
      lobby.isLocked = !!isLocked;
      await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });
      return NextResponse.json(
        { success: true, scope: 'room', isLocked: lobby.isLocked },
        { headers: corsHeaders }
      );
    }

    const key = String(fileId);
    if (!lobby.fileLocks) lobby.fileLocks = {};

    const allowed: string[] = Array.isArray(allowedNodeIds)
      ? Array.from(new Set(allowedNodeIds.map(String).filter(Boolean)))
      : (lobby.fileLocks[key]?.allowedNodeIds ?? []);

    const nextLock: FileLock = {
      locked: !!locked,
      allowedNodeIds: allowed,
      lockedBy: nodeId,
      lockedAt: Date.now(),
    };

    if (!nextLock.locked && allowed.length === 0) {
      // An unlocked file with nobody named is just an ordinary file. Dropping
      // the record keeps the room object from accumulating a dead entry per
      // file ever locked, which would eventually bloat every lobby read.
      delete lobby.fileLocks[key];
    } else {
      lobby.fileLocks[key] = nextLock;
    }

    await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });

    return NextResponse.json(
      { success: true, scope: 'file', fileId: key, lock: lobby.fileLocks[key] ?? null },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500, headers: corsHeaders }
    );
  }
}
