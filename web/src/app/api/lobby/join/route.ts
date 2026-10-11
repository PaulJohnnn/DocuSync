import { NextResponse } from 'next/server';
import { LobbyEntry } from '../store';
import { redis } from '@/lib/redis';
import { resolveJoinCode } from '@/lib/joinCode';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Join rate limiting, keyed on the device first and the network second.
 *
 * This used to allow five joins a minute per IP address, which is the
 * wrong unit on the network this system is built for. Page 8 scopes
 * DocuSync to the campus, where every device shares one public address
 * through NAT -- so five devices joining a room exhausted the allowance
 * for everyone behind that router, and the sixth person was told "too
 * many join attempts" for something they had not done. A room of fifteen
 * concurrent users is the stated target on page 6; the limit made that
 * impossible from a single campus network.
 *
 * The per-device allowance is what actually stops a client hammering the
 * route, so it stays tight. The per-network allowance exists only to stop
 * genuine abuse, so it is raised to a figure a classroom cannot reach by
 * working normally but a script would cross immediately.
 */
const JOINS_PER_DEVICE_PER_MINUTE = 10;
const JOINS_PER_NETWORK_PER_MINUTE = 60;

async function bump(key: string, windowSeconds: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}

async function checkRateLimit(ip: string, nodeId: string | undefined): Promise<boolean> {
  // A device identifies itself, so retries from one client are bounded
  // without the people beside it paying for them.
  if (nodeId) {
    const perDevice = await bump(`ratelimit:join:dev:${ip}:${nodeId}`, 60);
    if (perDevice > JOINS_PER_DEVICE_PER_MINUTE) return false;
  }
  const perNetwork = await bump(`ratelimit:join:net:${ip}`, 60);
  return perNetwork <= JOINS_PER_NETWORK_PER_MINUTE;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    // Read before the limiter so the allowance can be charged to the
    // device rather than to everyone sharing its router.
    const peeked = await request.clone().json().catch(() => null);
    const isAllowed = await checkRateLimit(ip, peeked?.memberNodeId ? String(peeked.memberNodeId) : undefined);
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Too many join attempts. Please try again in a minute.' },
        { status: 429, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { otp, memberNodeId } = body;

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing required field: otp' },
        { status: 400, headers: corsHeaders }
      );
    }

    // What the user typed is a join CODE, which is not necessarily the
    // room's id: a code that has been rotated points at the same room under
    // a new name. Resolving first is what lets an expired code be replaced
    // without the room losing its documents. See lib/joinCode.ts.
    const roomId = await resolveJoinCode(String(otp));
    const lobby = roomId
      ? ((await redis.get(`lobby:${roomId}`)) as LobbyEntry | null)
      : null;

    if (!lobby) {
      return NextResponse.json(
        { error: `Room not found. No active room with OTP "${otp}". Ask the host to generate a new code.` },
        { status: 404, headers: corsHeaders }
      );
    }

    if (Date.now() > lobby.expiresAt) {
      await redis.del(`lobby:${lobby.otp}`);
      return NextResponse.json(
        { error: 'This OTP has expired. Ask the host to generate a new one.' },
        { status: 410, headers: corsHeaders }
      );
    }

    if (memberNodeId && !lobby.members.includes(memberNodeId)) {
      if (lobby.isLocked) {
        return NextResponse.json(
          { error: 'This room has been locked by the owner. Joining is disabled.' },
          { status: 403, headers: corsHeaders }
        );
      }
      if (lobby.members.length >= 14) {
        return NextResponse.json(
          { error: 'Room is full. Maximum concurrent editors (15) reached.' },
          { status: 403, headers: corsHeaders }
        );
      }
      lobby.members.push(memberNodeId);
      lobby.peersJoined++;
      // We must write it back if we mutate
      await redis.set(`lobby:${lobby.otp}`, lobby, { ex: 60 * 60 * 24 });
    }

    return NextResponse.json(
      {
        success: true,
        // `otp` is the room's internal id, which every document key is
        // built from, so this is what the client must keep using. The code
        // to pass on to other people is `joinCode`, which may differ after
        // a rotation.
        otp: lobby.otp,
        joinCode: lobby.joinCode || lobby.otp,
        roomName: lobby.roomName,
        hostNodeId: lobby.hostNodeId,
        hostIp: lobby.hostIp,
        hostPort: lobby.hostPort,
        hostType: lobby.hostType || 'desktop',
        algorithm: lobby.algorithm || 'lww',
        memberCount: lobby.members.length + 1,
        members: [lobby.hostNodeId, ...lobby.members].map((id) => ({ nodeId: id })),
        ip: lobby.hostIp,
        port: lobby.hostPort,
        nodeId: lobby.hostNodeId,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
