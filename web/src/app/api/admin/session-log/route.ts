import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const raw = await redis.get('admin_session_log');
    const log = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);

    return NextResponse.json({ log: log.slice(0, limit) }, { status: 200, headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nodeId, action, detail } = body;
    
    if (!nodeId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const raw = await redis.get('admin_session_log');
    const log = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);

    const newEntry = {
      timestamp: Date.now(),
      nodeId,
      action,
      detail
    };

    log.unshift(newEntry);

    // Keep only last 500 entries
    if (log.length > 500) {
      log.length = 500;
    }

    await redis.set('admin_session_log', log);

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE() {
  try {
    await redis.set('admin_session_log', []);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
