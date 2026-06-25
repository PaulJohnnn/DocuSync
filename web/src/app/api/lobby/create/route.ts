import { NextResponse } from 'next/server';
import { activeLobbies, ipRateLimits, cleanupLobbies, LobbyEntry } from '../store';

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

    // Accept both old shape ({ nodeId, ip, port, roomName })
    // and new shape ({ hostNodeId, hostIp, hostPort, roomName })
    const hostNodeId: string = body.hostNodeId || body.nodeId;
    const hostIp: string     = body.hostIp     || body.ip;
    const hostPort: number   = Number(body.hostPort ?? body.port ?? 9000);
    const roomName: string   = body.roomName   || 'Unnamed Room';
    const hostType: 'desktop' | 'web' | 'mobile' = body.hostType || 'desktop';

    if (!hostNodeId || !hostIp) {
      return NextResponse.json(
        { error: 'Missing required fields: hostNodeId (or nodeId), hostIp (or ip)' },
        { status: 400, headers: corsHeaders }
      );
    }

    // IP rate limit: max 1000 rooms per IP per hour (effectively unlimited for testing)
    const clientIp = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || hostIp;
    const now = Date.now();
    const prevTimestamps = ipRateLimits.get(clientIp) || [];
    const validTs = prevTimestamps.filter(t => now - t < 60 * 60 * 1000);
    if (validTs.length >= 1000) {
      return NextResponse.json(
        { error: 'Rate limit exceeded.' },
        { status: 429, headers: corsHeaders }
      );
    }
    validTs.push(now);
    ipRateLimits.set(clientIp, validTs);

    // Generate 5-digit OTP — retry on collision (extremely rare)
    let otp: string;
    let attempts = 0;
    do {
      otp = Math.floor(10000 + Math.random() * 90000).toString();
      attempts++;
    } while (activeLobbies.has(otp) && attempts < 10);

    const newLobby: LobbyEntry = {
      otp,
      roomName,
      hostNodeId,
      hostIp,
      hostPort,
      hostType,
      createdAt: now,
      expiresAt: now + 60 * 60 * 1000, // 60 minutes
      members: [hostNodeId],
      peersJoined: 0,
      // legacy compat fields
      ip: hostIp,
      port: hostPort,
      nodeId: hostNodeId,
    };

    activeLobbies.set(otp, newLobby);

    console.log(`[Lobby] Room created: OTP=${otp} host=${hostIp}:${hostPort} name="${roomName}"`);

    return NextResponse.json(
      { success: true, otp, roomName, expiresIn: 3600 },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Lobby] Create error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET() {
  cleanupLobbies();
  const rooms = Array.from(activeLobbies.values()).map(r => ({
    otp: r.otp,
    roomName: r.roomName,
    memberCount: r.members.length,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
  return NextResponse.json({ rooms, total: rooms.length }, { headers: corsHeaders });
}
