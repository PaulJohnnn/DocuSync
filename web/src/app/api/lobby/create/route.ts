import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies, LobbyEntry } from '../store';

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

    cleanupLobbies();

    let otp: string;
    let attempts = 0;
    
    do {
      otp = Math.floor(10000 + Math.random() * 90000).toString();
      attempts++;
    } while (activeLobbies.has(otp) && attempts < 10);

    const now = Date.now();
    const expiresAt = now + 60 * 60 * 1000;

    const newLobby: LobbyEntry = {
        otp,
        roomName,
        hostNodeId,
        hostIp,
        hostPort,
        hostType,
        createdAt: now,
        expiresAt,
        members: [],
        peersJoined: 0,
        files: [],
        ip: hostIp,
        port: hostPort,
        nodeId: hostNodeId
    };

    activeLobbies.set(otp, newLobby);

    return NextResponse.json(
      {
        success: true,
        otp,
        roomName,
        hostNodeId,
        hostIp,
        hostPort,
        hostType
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
