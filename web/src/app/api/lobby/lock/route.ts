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
    const { otp, nodeId, isLocked } = body;

    if (!otp || !nodeId) {
      return NextResponse.json(
        { error: 'Missing otp or nodeId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    
    if (!lobby) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (lobby.hostNodeId !== nodeId) {
      return NextResponse.json(
        { error: 'Forbidden: Only the exact Node Owner who created the room can lock it.' },
        { status: 403, headers: corsHeaders }
      );
    }

    lobby.isLocked = !!isLocked;
    
    await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });

    return NextResponse.json(
      { success: true, isLocked: lobby.isLocked },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
