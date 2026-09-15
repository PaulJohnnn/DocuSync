import { NextResponse } from 'next/server';
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
    const nodeId: string = body.nodeId;

    if (!nodeId) {
      return NextResponse.json(
        { error: 'Missing required field: nodeId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const clientIp = request.headers.get('x-forwarded-for')
      || request.headers.get('x-real-ip')
      || 'unknown';

    const TTL_SECONDS = 60 * 5; // 5 minutes

    await redis.set(`user:${nodeId}`, {
      nodeId,
      lastActive: Date.now(),
      ip: clientIp
    }, { ex: TTL_SECONDS });

    let activePeers: any[] = [];
    const hostedRoom = body.hostedRoom;
    if (hostedRoom && hostedRoom.otp) {
      const ROOM_TTL = 60 * 60 * 24; // 24 hours
      const roomKey = `lobby:${hostedRoom.otp}`;
      const existingLobby = (await redis.get(roomKey)) as any;
      
      const hostIp = hostedRoom.hostIp || clientIp;
      
      if (!existingLobby) {
        console.log(`[Heartbeat] ♻️ Self-healing! Re-registering lost room ${hostedRoom.otp}`);
        const newLobby = {
          otp: hostedRoom.otp,
          roomName: hostedRoom.roomName || 'Unnamed Room',
          hostNodeId: nodeId,
          hostIp,
          hostPort: hostedRoom.hostPort || 9000,
          hostType: hostedRoom.hostType || 'desktop',
          createdAt: Date.now(),
          expiresAt: Date.now() + ROOM_TTL * 1000,
          members: [nodeId],
          peersJoined: 1,
          files: [],
          ip: hostIp,
          port: hostedRoom.hostPort || 9000,
          nodeId: nodeId
        };
        await redis.set(roomKey, newLobby, { ex: ROOM_TTL });
        activePeers = [{ nodeId, ip: clientIp, lastActive: Date.now() }];
      } else {
        await redis.expire(roomKey, ROOM_TTL);
        
        // Add self to members if not present
        if (!existingLobby.members.includes(nodeId)) {
          existingLobby.members.push(nodeId);
          existingLobby.peersJoined = existingLobby.members.length;
          await redis.set(roomKey, existingLobby, { ex: ROOM_TTL });
        }

        // Gather all active members by checking their TTL keys
        const memberChecks = await Promise.all(
          existingLobby.members.map(async (mId: string) => {
            const u = await redis.get(`user:${mId}`);
            return u ? u : null;
          })
        );
        activePeers = memberChecks.filter(Boolean);
      }
    }

    return NextResponse.json({ success: true, activePeers }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('[Heartbeat] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
