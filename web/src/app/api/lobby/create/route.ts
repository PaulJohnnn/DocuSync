import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies, Lobby, ipRateLimits } from '../store';

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

    // IP Rate Limit (max 3 rooms per IP/hour)
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || ip;
    const now = Date.now();
    const timestamps = ipRateLimits.get(clientIp) || [];
    const validTimestamps = timestamps.filter(t => now - t < 60 * 60 * 1000);
    if (validTimestamps.length >= 3) {
      return NextResponse.json({ error: 'Rate limit exceeded: Maximum 3 rooms per IP per hour.' }, { status: 429, headers: corsHeaders });
    }
    validTimestamps.push(now);
    ipRateLimits.set(clientIp, validTimestamps);

    // Generate random 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();

    const newLobby: Lobby = {
      otp,
      ip,
      port: Number(port),
      nodeId,
      roomName,
      createdAt: now,
      peersJoined: 0,
    };

    activeLobbies.set(otp, newLobby);

    return NextResponse.json({ otp }, { status: 201, headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
