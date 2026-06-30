import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
    const { otp, clientNodeId } = body;

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing OTP' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500, headers: corsHeaders });
    }

    const { data: lobby, error } = await supabase.from('matchmaker_lobbies').select('*').eq('otp', otp).maybeSingle();

    if (!lobby || error) {
      return NextResponse.json(
        { error: `Room not found. No active room with OTP "${otp}". Ask the host to generate a new code.` },
        { status: 404, headers: corsHeaders }
      );
    }

    if (new Date() > new Date(lobby.expires_at)) {
      await supabase.from('matchmaker_lobbies').delete().eq('otp', otp);
      return NextResponse.json(
        { error: 'This OTP has expired. Ask the host to generate a new one.' },
        { status: 410, headers: corsHeaders }
      );
    }

    // Register member in Supabase (simplified for now as member list isn't strictly enforced in the table structure we created)
    
    console.log(`[Lobby] Client joined OTP=${otp} → ${lobby.host_ip}:${lobby.host_port}`);

    return NextResponse.json(
      {
        success: true,
        otp: lobby.otp,
        roomName: lobby.room_name,
        hostNodeId: lobby.host_node_id,
        hostIp: lobby.host_ip,
        hostPort: lobby.host_port,
        hostType: lobby.host_type || 'desktop',
        memberCount: 2, // Dummy count
        // Legacy compat fields
        ip: lobby.host_ip,
        port: lobby.host_port,
        nodeId: lobby.host_node_id,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Lobby] Join error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

