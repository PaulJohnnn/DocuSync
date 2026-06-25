import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies } from '../store';

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
    cleanupLobbies();
    const body = await request.json();
    const { otp, clientNodeId } = body;

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing OTP' },
        { status: 400, headers: corsHeaders }
      );
    }

    const lobby = activeLobbies.get(otp);

    if (!lobby) {
      return NextResponse.json(
        { error: `Room not found. No active room with OTP "${otp}". Ask the host to generate a new code.` },
        { status: 404, headers: corsHeaders }
      );
    }

    if (Date.now() > lobby.expiresAt) {
      activeLobbies.delete(otp);
      return NextResponse.json(
        { error: 'This OTP has expired. Ask the host to generate a new one.' },
        { status: 410, headers: corsHeaders }
      );
    }

    if (lobby.members.length >= 15) {
      return NextResponse.json(
        { error: 'Room is full (max 15 peers).' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Register member
    if (clientNodeId && !lobby.members.includes(clientNodeId)) {
      lobby.members.push(clientNodeId);
    }
    lobby.peersJoined += 1;
    activeLobbies.set(otp, lobby);

    console.log(`[Lobby] Client joined OTP=${otp} → ${lobby.hostIp}:${lobby.hostPort} total_members=${lobby.members.length}`);

    return NextResponse.json(
      {
        success: true,
        otp: lobby.otp,
        roomName: lobby.roomName,
        hostNodeId: lobby.hostNodeId,
        hostIp: lobby.hostIp,
        hostPort: lobby.hostPort,
        hostType: lobby.hostType || 'desktop',
        memberCount: lobby.members.length,
        // Legacy compat fields
        ip: lobby.hostIp,
        port: lobby.hostPort,
        nodeId: lobby.hostNodeId,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Lobby] Join error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
