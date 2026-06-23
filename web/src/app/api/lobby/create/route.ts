import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies, Lobby } from '../store';

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
    const { nodeId, ip, port, roomName } = body;

    if (!nodeId || !ip || !port) {
      return NextResponse.json({ error: 'Missing nodeId, ip, or port' }, { status: 400, headers: corsHeaders });
    }

    // Generate random 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();

    const newLobby: Lobby = {
      otp,
      ip,
      port: Number(port),
      nodeId,
      roomName,
      createdAt: Date.now(),
    };

    activeLobbies.set(otp, newLobby);

    return NextResponse.json({ otp }, { status: 201, headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
