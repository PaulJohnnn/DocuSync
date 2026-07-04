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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, memberNodeId } = body;

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing required field: otp' },
        { status: 400, headers: corsHeaders }
      );
    }

    const lobby = await redis.get<LobbyEntry>(`lobby:${otp}`);

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
      lobby.members.push(memberNodeId);
      lobby.peersJoined++;
      // We must write it back if we mutate
      await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 });
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
        memberCount: lobby.members.length + 1,
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
