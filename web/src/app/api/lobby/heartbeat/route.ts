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
    const ROOM_TTL = 60 * 60 * 24; // 24 hours

    // Explicit departure: the browser is leaving the room (tab close, "Leave
    // Room" click, or navigating away from the editor). Without this, the
    // ONLY way a peer's presence record disappears is its 5-minute TTL
    // expiring — so the member/active-editor count would look "stuck" for
    // up to 5 minutes after someone actually left. Delete immediately so
    // the very next heartbeat from anyone else in the room reflects it.
    if (body.leaving === true) {
      const otpForLeave: string | undefined = body.hostedRoom?.otp;
      await redis.del(`user:${nodeId}`);
      if (otpForLeave) {
        try { await redis.srem(`lobby_members_set:${otpForLeave}`, nodeId); } catch (_e) {}
      }
      return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
    }

    // openFileId: which file (if any) this peer currently has open in the
    // editor. Rooms use this to know exactly who is actively editing a
    // given file — not just who's connected to the room overall — so a
    // "last editor left" history checkpoint can be scoped to the right
    // file instead of firing whenever the room happens to empty out.
    const openFileId: string | null = body.openFileId ? String(body.openFileId) : null;
    const displayName: string | null = body.displayName ? String(body.displayName) : null;

    let activePeers: any[] = [];
    const hostedRoom = body.hostedRoom;
    // Desktop only sends hostedRoom when IT is the room's owner (see
    // App.tsx's pingHeartbeat) — a non-owner peer's heartbeat has no
    // hostedRoom at all, so the presence write below must stay unconditional
    // rather than nested inside the `if (hostedRoom...)` block, or those
    // peers would stop registering their own presence entirely.
    let existingLobby: any = null;
    if (hostedRoom && hostedRoom.otp) {
      existingLobby = (await redis.get(`lobby:${hostedRoom.otp}`)) as any;

      // A kicked peer must not be able to just re-register on its very next
      // heartbeat — check before writing any presence/membership state so a
      // kick actually sticks instead of self-healing itself away. The
      // client (WebSyncContext's pollPresence) checks this flag and evicts
      // itself the same way it already does for PEER_KICK over WebSocket.
      if (existingLobby?.kickedNodeIds?.includes(nodeId)) {
        return NextResponse.json({ success: false, kicked: true }, { status: 200, headers: corsHeaders });
      }
    }

    await redis.set(`user:${nodeId}`, {
      nodeId,
      displayName,
      lastActive: Date.now(),
      ip: clientIp,
      openFileId
    }, { ex: TTL_SECONDS });

    if (hostedRoom && hostedRoom.otp) {
      const roomKey = `lobby:${hostedRoom.otp}`;
      const membersSetKey = `lobby_members_set:${hostedRoom.otp}`;
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
        await redis.sadd(membersSetKey, nodeId);
        await redis.expire(membersSetKey, ROOM_TTL);
        activePeers = [{ nodeId, displayName, ip: clientIp, lastActive: Date.now() }];
      } else {
        await redis.expire(roomKey, ROOM_TTL);

        // Room membership lives in a Redis Set, added to with SADD — an
        // atomic, idempotent operation. The previous approach read the
        // whole lobby object, pushed into a plain array, and wrote the
        // whole object back; with several peers heartbeating every few
        // seconds, two of those read-modify-write cycles racing is
        // exactly what silently dropped a newly-joined member (whichever
        // heartbeat's full-object write landed second won, discarding the
        // other's addition). SADD can't lose a concurrent add this way.
        await redis.sadd(membersSetKey, nodeId);
        await redis.expire(membersSetKey, ROOM_TTL);

        let memberIds = await redis.smembers(membersSetKey) as string[];
        if (!memberIds || memberIds.length === 0) {
          // First time seeing this room's Set (e.g. room created before
          // this migration) — seed it from the legacy array once.
          const legacyMembers: string[] = existingLobby.members || [];
          if (legacyMembers.length > 0) {
            await redis.sadd(membersSetKey, ...legacyMembers);
            await redis.expire(membersSetKey, ROOM_TTL);
            memberIds = legacyMembers;
          } else {
            memberIds = [nodeId];
          }
        }

        // Gather all active members by checking their TTL keys
        const memberChecks = await Promise.all(
          memberIds.map(async (mId: string) => {
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
