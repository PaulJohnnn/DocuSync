import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { LobbyEntry, UserPresence } from '../../lobby/store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  try {
    // 1. Get all active rooms from Redis
    const lobbyKeys = await redis.keys('lobby:*');
    let rooms: any[] = [];
    if (lobbyKeys.length > 0) {
      const lobbies = await redis.mget<LobbyEntry[]>(...lobbyKeys);
      rooms = lobbies
        .filter((r): r is LobbyEntry => r !== null)
        .map(r => ({
          otp: r.otp,
          roomName: r.roomName,
          hostNodeId: r.hostNodeId,
          memberCount: r.members.length,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        }));
    }

    // 2. Get all known users from Redis
    const userKeys = await redis.keys('user:*');
    let users: any[] = [];
    if (userKeys.length > 0) {
      const activeUsers = await redis.mget<UserPresence[]>(...userKeys);
      const now = Date.now();
      const OFFLINE_THRESHOLD_MS = 60000; // 60 seconds

      users = activeUsers
        .filter((u): u is UserPresence => u !== null)
        .map(u => {
          const isOnline = now - u.lastActive < OFFLINE_THRESHOLD_MS;
          return {
            nodeId: u.nodeId,
            lastActive: u.lastActive,
            isOnline,
            ip: u.ip
          };
        });
    }

    return NextResponse.json({
      rooms,
      users,
      totalRooms: rooms.length,
      totalUsers: users.length,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error('[Stats] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
