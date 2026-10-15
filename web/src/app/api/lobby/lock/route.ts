import { NextResponse } from 'next/server';
import { LobbyEntry, FileLock, canEditFile, canOpenFile } from '../store';
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
  const openPermissions: Record<string, boolean> = {};
  for (const key of Object.keys(fileLocks)) {
    permissions[key] = canEditFile(lobby, key, nodeId);
    openPermissions[key] = canOpenFile(lobby, key, nodeId);
  }

  return NextResponse.json(
    {
      success: true,
      isLocked: !!lobby.isLocked,
      fileLocks,
      permissions,
      openPermissions,
      hostNodeId: lobby.hostNodeId ?? null,
      isHost: !!nodeId && nodeId === lobby.hostNodeId,
    },
    { headers: corsHeaders }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      otp, nodeId, isLocked, fileId, locked, allowedNodeIds, grant, revoke, restricted,
      openRestricted, grantOpen, revokeOpen, accountId,
    } = body;

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

    // Ownership follows the ACCOUNT, not one device.
    //
    // Checking the node id alone meant the owner signed in on a second
    // machine was refused control of their own room -- and, on the other
    // side of the same mistake, their second session was listed as an
    // ordinary member who had to be granted access to their own files.
    let isOwner = lobby.hostNodeId === nodeId;
    if (!isOwner && accountId) {
      const hostPresence = (await redis.get(`user:${lobby.hostNodeId}`)) as { accountId?: string } | null;
      if (hostPresence?.accountId && hostPresence.accountId === String(accountId)) isOwner = true;
    }
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Only the owner of this room can change who may open or edit its files.' },
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

    const existing = lobby.fileLocks[key];
    let allowed: string[] = Array.isArray(allowedNodeIds)
      ? Array.from(new Set(allowedNodeIds.map(String).filter(Boolean)))
      : (existing?.allowedNodeIds ?? []);
    let nextRestricted = restricted !== undefined ? !!restricted
      : locked !== undefined ? !!locked
      : !!existing?.locked;

    // One person's role, changed on its own.
    //
    // The caller used to have to send the whole allowed list back, which
    // meant reading it, editing it locally and writing it again -- two
    // owners (or one owner in two tabs) acting at once would each
    // overwrite the other's change with their own stale copy. Naming the
    // single person to grant or revoke lets the server do the edit against
    // what is actually stored.
    if (grant) {
      const id = String(grant);
      if (!allowed.includes(id)) allowed = allowed.concat([id]);
    }
    if (revoke) {
      const id = String(revoke);
      allowed = allowed.filter((x) => x !== id);
      // Making somebody view-only has to mean something. While the file is
      // open to everyone the role list is inert, so revoking implies the
      // file becomes restricted -- otherwise the owner sets "view only",
      // nothing happens, and the control looks broken.
      if (restricted === undefined && locked === undefined) nextRestricted = true;
    }

    // Who may OPEN it, which is a separate question from who may type.
    let openIds: string[] = Array.isArray(existing?.openNodeIds) ? existing!.openNodeIds!.slice() : [];
    let nextOpenRestricted = openRestricted !== undefined ? !!openRestricted : !!existing?.openRestricted;
    if (grantOpen) {
      const id = String(grantOpen);
      if (!openIds.includes(id)) openIds = openIds.concat([id]);
    }
    if (revokeOpen) {
      const id = String(revokeOpen);
      openIds = openIds.filter((x) => x !== id);
      // Same reasoning as revoking an editor: taking somebody off the
      // list has to mean something, and while the file is open to the
      // whole room the list is inert.
      if (openRestricted === undefined) nextOpenRestricted = true;
    }

    const nextLock: FileLock = {
      locked: nextRestricted,
      allowedNodeIds: allowed,
      openRestricted: nextOpenRestricted,
      openNodeIds: openIds,
      lockedBy: nodeId,
      lockedAt: Date.now(),
    };

    if (!nextLock.locked && allowed.length === 0 && !nextLock.openRestricted && openIds.length === 0) {
      // An unlocked file with nobody named is just an ordinary file. Dropping
      // the record keeps the room object from accumulating a dead entry per
      // file ever locked, which would eventually bloat every lobby read.
      delete lobby.fileLocks[key];
    } else {
      lobby.fileLocks[key] = nextLock;
    }

    await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });

    return NextResponse.json(
      {
        success: true,
        scope: 'file',
        fileId: key,
        lock: lobby.fileLocks[key] ?? null,
        // Echoed so the owner's own screen can settle immediately rather
        // than waiting for the next poll to tell it what it just did.
        restricted: nextLock.locked,
        editorNodeIds: nextLock.allowedNodeIds,
        openRestricted: nextLock.openRestricted,
        openNodeIds: nextLock.openNodeIds,
      },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500, headers: corsHeaders }
    );
  }
}
