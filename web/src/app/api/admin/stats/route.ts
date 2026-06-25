import { NextResponse } from 'next/server';
import { activeLobbies, activeUsers, cleanupLobbies } from '../../lobby/store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET() {
  cleanupLobbies();

  // 1. Get all active rooms
  const rooms = Array.from(activeLobbies.values()).map(r => ({
    otp: r.otp,
    roomName: r.roomName,
    hostNodeId: r.hostNodeId,
    memberCount: r.members.length,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));

  // 2. Get all known users
  const now = Date.now();
  const OFFLINE_THRESHOLD_MS = 60000; // 60 seconds

  const users = Array.from(activeUsers.values()).map(u => {
    const isOnline = now - u.lastActive < OFFLINE_THRESHOLD_MS;
    return {
      nodeId: u.nodeId,
      lastActive: u.lastActive,
      isOnline,
      ip: u.ip
    };
  });

  return NextResponse.json({
    rooms,
    users,
    totalRooms: rooms.length,
    totalUsers: users.length,
  }, { headers: corsHeaders });
}
