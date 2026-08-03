import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/lobby/signal
 * Send a WebRTC signaling message to a target peer.
 * Body: { otp: string, targetNodeId: string, senderNodeId: string, type: 'offer'|'answer'|'candidate', data: any }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, targetNodeId, senderNodeId, type, data } = body;

    if (!otp || !targetNodeId || !senderNodeId || !type || !data) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const key = `signals:${otp}:${targetNodeId}`;
    const signal = JSON.stringify({ senderNodeId, type, data, ts: Date.now() });

    // Push the signal to the target's list
    await redis.rpush(key, signal);
    // Expire the list after 60 seconds (signaling is ephemeral)
    await redis.expire(key, 60);

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * GET /api/lobby/signal?otp=XXXXX&nodeId=MYID
 * Retrieve all pending signaling messages for my nodeId, then clear them.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');
    const nodeId = url.searchParams.get('nodeId');

    if (!otp || !nodeId) {
      return NextResponse.json({ signals: [] }, { headers: corsHeaders });
    }

    const key = `signals:${otp}:${nodeId}`;

    // Use a transaction or just lrange then del
    const rawSignals = await redis.lrange(key, 0, -1);
    if (rawSignals && rawSignals.length > 0) {
      await redis.del(key);
    }

    const signals = (rawSignals || []).map((s: any) => {
      try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return s; }
    });

    return NextResponse.json({ signals }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
