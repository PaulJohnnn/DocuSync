import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { otp } = body;
    
    if (!otp) {
      return NextResponse.json({ error: 'otp is required' }, { status: 400, headers: corsHeaders });
    }

    // Try Supabase first
    if (supabase) {
      const { error } = await supabase.from('matchmaker_lobbies').delete().eq('otp', otp);
      if (error) {
        console.error('[Admin] Delete group error (Supabase):', error);
      }
    }

    // Remove from Redis store
    await redis.del(`lobby:${otp}`);

    return NextResponse.json({ success: true, message: `Group ${otp} deleted` }, { status: 200, headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
