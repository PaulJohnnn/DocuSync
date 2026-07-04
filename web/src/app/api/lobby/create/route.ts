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

    let otp: string;
    let attempts = 0;
    let isUnique = false;
    
    // Generate unique OTP
    do {
      otp = Math.floor(10000 + Math.random() * 90000).toString();
      const existing = await redis.get(`lobby:${otp}`);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    } while (!isUnique && attempts < 10);

    if (!isUnique) {
      throw new Error("Could not generate a unique OTP");
    }

    const now = Date.now();
    const TTL_SECONDS = 60 * 60; // 1 hour
    const expiresAt = now + TTL_SECONDS * 1000;

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

    // Save to Redis with 1 hour TTL
    await redis.set(`lobby:${otp}`, newLobby, { ex: TTL_SECONDS });

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
