import { NextResponse } from 'next/server';
import { LobbyEntry } from '../store';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Simple rate limiter: max 5 requests per minute per IP
async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `ratelimit:join:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count <= 5;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const isAllowed = await checkRateLimit(ip);
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

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;

    if (!lobby) {
      return NextResponse.json(
        { error: `Room not found. No active room with OTP "${otp}". Ask the host to generate a new code.` },
        { status: 404, headers: corsHeaders }
      );
    }

    if (Date.now() > lobby.expiresAt) {
      await redis.del(`lobby:${otp}`);
      return NextResponse.json(
        { error: 'This OTP has expired. Ask the host to generate a new one.' },
        { status: 410, headers: corsHeaders }
      );
    }

    if (memberNodeId && !lobby.members.includes(memberNodeId)) {
      if (lobby.members.length >= 14) {
        return NextResponse.json(
          { error: 'Room is full. Maximum concurrent editors (15) reached.' },
          { status: 403, headers: corsHeaders }
        );
      }
      lobby.members.push(memberNodeId);
      lobby.peersJoined++;
      // We must write it back if we mutate
      await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });
    }

    return NextResponse.json(
      {
        success: true,
        otp: lobby.otp,
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
