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

    const hostNodeId: string = body.hostNodeId || body.nodeId;
    const hostIp: string     = body.hostIp     || body.ip;
    const hostPort: number   = Number(body.hostPort ?? body.port ?? 9000);
    const roomName: string   = body.roomName   || 'Unnamed Room';
    const hostType: 'desktop' | 'web' | 'mobile' = body.hostType || 'desktop';

    if (!hostNodeId || !hostIp) {
      return NextResponse.json(
        { error: 'Missing required fields: hostNodeId (or nodeId), hostIp (or ip)' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500, headers: corsHeaders });
    }

    let otp: string;
    let attempts = 0;
    let isUnique = false;
    
    do {
      otp = Math.floor(10000 + Math.random() * 90000).toString();
      const { data } = await supabase.from('matchmaker_lobbies').select('otp').eq('otp', otp).maybeSingle();
      if (!data) isUnique = true;
      attempts++;
    } while (!isUnique && attempts < 10);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const { error } = await supabase.from('matchmaker_lobbies').insert({
        otp,
        room_name: roomName,
        host_node_id: hostNodeId,
        host_ip: hostIp,
        host_port: hostPort,
        host_type: hostType,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
    });

    if (error) {
        throw new Error(error.message);
    }

    console.log(`[Lobby] Room created: OTP=${otp} host=${hostIp}:${hostPort} name="${roomName}"`);

    return NextResponse.json(
      { success: true, otp, roomName, expiresIn: 3600 },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Lobby] Create error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET() {
  if (!supabase) return NextResponse.json({ rooms: [], total: 0 }, { headers: corsHeaders });
  
  // Cleanup expired lobbies
  await supabase.from('matchmaker_lobbies').delete().lt('expires_at', new Date().toISOString());
  
  const { data } = await supabase.from('matchmaker_lobbies').select('*');
  const rooms = (data || []).map((r: any) => ({
    otp: r.otp,
    roomName: r.room_name,
    memberCount: 1, // simplified
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: new Date(r.expires_at).getTime(),
  }));
  return NextResponse.json({ rooms, total: rooms.length }, { headers: corsHeaders });
}
