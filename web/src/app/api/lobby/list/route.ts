import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { LobbyEntry } from '../store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const keys = await redis.keys('lobby:*');
    
    if (keys.length === 0) {
      return NextResponse.json({ success: true, rooms: [] }, { headers: corsHeaders });
    }

    const lobbies = (await redis.mget(...keys)) as LobbyEntry[];
    
    const rooms = lobbies
      .filter((lobby): lobby is LobbyEntry => lobby !== null)
      .map(lobby => ({
        id: lobby.otp,
        name: lobby.roomName,
        hostIp: lobby.hostIp || lobby.ip, // fallback for legacy
        hostPort: lobby.hostPort || lobby.port,
        peersJoined: lobby.peersJoined || lobby.members?.length || 0,
        filesCount: lobby.files?.length || 0,
        createdAt: lobby.createdAt
      }));
    
    // Sort by newest first
    rooms.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ success: true, rooms }, { headers: corsHeaders });
  } catch (error) {
    console.error('[LobbyList] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
