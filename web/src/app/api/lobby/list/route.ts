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
    const present = lobbies.filter((lobby): lobby is LobbyEntry => lobby !== null);

    // How many devices are actually in the room right now.
    //
    // `peersJoined` is a counter that join increments and nothing ever
    // decrements, so it answers "how many have ever joined", not "how many
    // are here". A room everyone had left still reported its peak. The
    // heartbeat already maintains live presence in a Redis Set per room —
    // SADD on each beat, SREM on leave — so that set is the real answer and
    // this reads it. The old counter stays as the fallback for a room whose
    // members have not beaten yet.
    const liveCounts = await Promise.all(present.map(async (lobby) => {
      try {
        const members = (await redis.smembers(`lobby_members_set:${lobby.otp}`)) as string[];
        if (Array.isArray(members) && members.length > 0) return members.length;
      } catch { /* fall through to the stored counter */ }
      return lobby.peersJoined || lobby.members?.length || 0;
    }));

    const rooms = present.map((lobby, i) => ({
      id: lobby.otp,
      name: lobby.roomName,
      hostIp: lobby.hostIp || lobby.ip, // fallback for legacy
      hostPort: lobby.hostPort || lobby.port,
      peersJoined: liveCounts[i],
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
