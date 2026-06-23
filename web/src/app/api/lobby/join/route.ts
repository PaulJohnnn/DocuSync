import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies } from '../store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    cleanupLobbies();
    const body = await request.json();
    const { otp } = body;

    if (!otp) {
      return NextResponse.json({ error: 'Missing OTP' }, { status: 400, headers: corsHeaders });
    }

    const lobby = activeLobbies.get(otp);
    if (!lobby) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 404, headers: corsHeaders });
    }

    if (lobby.peersJoined >= 15) {
      return NextResponse.json({ error: 'Room is full (max 15 peers)' }, { status: 403, headers: corsHeaders });
    }

    // Increment joined count, do NOT delete the OTP so others can still join.
    // The OTP will naturally expire after 30 minutes via cleanupLobbies.
    lobby.peersJoined += 1;
    activeLobbies.set(otp, lobby);

    return NextResponse.json({
      ip: lobby.ip,
      port: lobby.port,
      nodeId: lobby.nodeId,
      roomName: lobby.roomName
    }, { status: 200, headers: corsHeaders });

  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
