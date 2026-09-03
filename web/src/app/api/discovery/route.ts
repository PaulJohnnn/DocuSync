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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspace = url.searchParams.get('workspace') || 'admin';

  try {
    const raw = await redis.get(`discovery_${workspace}`);
    if (!raw) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return NextResponse.json({ success: true, ip: data.ip, port: data.port, updatedAt: data.updatedAt }, { headers: corsHeaders });
  } catch (err) {
    console.error('Failed to get discovery info', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspace = 'admin', ip, port } = body;

    if (!ip) {
      return NextResponse.json({ error: 'IP address is required' }, { status: 400, headers: corsHeaders });
    }

    const data = {
      ip,
      port: port || '3000',
      updatedAt: new Date().toISOString(),
    };

    await redis.set(`discovery_${workspace}`, data);
    return NextResponse.json({ success: true, data }, { headers: corsHeaders });
  } catch (err) {
    console.error('Failed to update discovery info', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
