import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'Missing fileId' }, { status: 400, headers: corsHeaders });
  }
  
  if (!otp) {
    return NextResponse.json({ success: true, data: { entries: [] } }, { headers: corsHeaders });
  }

  try {
    const key = `doc_history:${otp}:${fileId}`;
    const historyList = await redis.lrange(key, 0, 50);
    
    const entries = historyList.map((item: any) => typeof item === 'string' ? JSON.parse(item) : item);

    return NextResponse.json({ success: true, data: { entries } }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
