import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { isRoomOwner, type LobbyEntry } from '../store';
import { mintJoinCode, setJoinCodeAlias, JOIN_CODE_TTL_MS } from '@/lib/joinCode';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DAY_SECONDS = 60 * 60 * 24;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Replace a room's join code, now, because the owner asked.
 *
 * The code already rotated on its own once it lapsed, which covers the
 * code going stale with time. It did not cover the reason people
 * actually want a new one: the old one has got out. Somebody forwarded
 * it, it is on a whiteboard, a person who left still has it. That wants
 * a button, not a timer.
 *
 * The room itself is untouched -- its id, documents, history and members
 * all stay exactly as they are. Only the door's code changes, and the
 * previous one stops working the moment this returns.
 */
export async function POST(request: Request) {
  try {
    const { otp, nodeId, accountId } = await request.json();

    if (!otp || !nodeId) {
      return NextResponse.json(
        { error: 'Missing otp or nodeId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    if (!lobby) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404, headers: corsHeaders });
    }

    // Ownership follows the account, not one device. The room records it
    // when it is created; the presence lookup is only there for rooms
    // made before it did, and it lapses once that browser is closed.
    const hostPresence = (!accountId || lobby.hostNodeId === nodeId)
      ? null
      : ((await redis.get(`user:${lobby.hostNodeId}`)) as { accountId?: string } | null);
    const isOwner = isRoomOwner(lobby, nodeId, accountId, hostPresence);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Only the owner of this room can change its code.' },
        { status: 403, headers: corsHeaders }
      );
    }

    const previous = lobby.joinCode || lobby.otp;
    const next = await mintJoinCode();

    await setJoinCodeAlias(next, lobby.otp);
    // Retire the old one, including when it is the room's own id -- that
    // is the first code every room hands out, and leaving it standing
    // would mean the code most people are holding is the one that never
    // stops working.
    await redis.del(`joincode:${previous}`);

    lobby.joinCode = next;
    lobby.joinCodeExpiresAt = Date.now() + JOIN_CODE_TTL_MS;
    await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });

    return NextResponse.json(
      { success: true, joinCode: next, previousCode: previous },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500, headers: corsHeaders }
    );
  }
}
