import { NextResponse } from 'next/server';
import { LobbyEntry } from '../store';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Kicking a peer used to only ever be sent over a raw WebSocket
// (PEER_KICK), which desktop's native P2P server understands but which
// nothing in the web/matchmaker stack ever listens on — so on a web-hosted
// room the "Kick" button silently did nothing. This gives it a real,
// HTTP-based effect: the target is removed from the room immediately (so
// everyone else's next heartbeat stops showing them), and blocklisted so
// their own heartbeat (see /api/lobby/heartbeat) refuses to re-register
// them and tells their client to leave.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, nodeId, targetNodeId } = body;

    if (!otp || !nodeId || !targetNodeId) {
      return NextResponse.json(
        { error: 'Missing otp, nodeId, or targetNodeId' },
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
        { error: 'Forbidden: Only the room owner can remove peers.' },
        { status: 403, headers: corsHeaders }
      );
    }

    if (targetNodeId === lobby.hostNodeId) {
      return NextResponse.json(
        { error: "The room owner can't kick themselves." },
        { status: 400, headers: corsHeaders }
      );
    }

    const kicked = new Set(lobby.kickedNodeIds || []);
    kicked.add(targetNodeId);
    lobby.kickedNodeIds = Array.from(kicked);
    lobby.members = (lobby.members || []).filter((m) => m !== targetNodeId);

    await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });
    await redis.del(`user:${targetNodeId}`);
    try {
      await redis.srem(`lobby_members_set:${otp}`, targetNodeId);
    } catch (_e) {}

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
