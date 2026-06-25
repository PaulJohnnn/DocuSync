import { NextResponse } from 'next/server';
import { activeUsers } from '../store';

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

    activeUsers.set(nodeId, {
      nodeId,
      lastActive: Date.now(),
      ip: clientIp
    });

    return NextResponse.json({ success: true }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error('[Heartbeat] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
