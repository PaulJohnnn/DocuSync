import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { LobbyEntry } from '../store';

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

  if (!otp) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
  }

  const lobby = await redis.get<LobbyEntry>(`lobby:${otp}`);
  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
  }

  return NextResponse.json({ files: lobby.files || [] }, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, file } = body;

    if (!otp || !file) {
      return NextResponse.json({ error: 'Missing otp or file data' }, { status: 400, headers: corsHeaders });
    }

    const lobby = await redis.get<LobbyEntry>(`lobby:${otp}`);
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
    }

    if (!lobby.files) lobby.files = [];
    
    // Check if file already exists (by name or id)
    const existingIndex = lobby.files.findIndex((f) => f.fileName === file.fileName || f.name === file.name);
    if (existingIndex >= 0) {
      lobby.files[existingIndex] = file;
    } else {
      lobby.files.push(file);
    }

    await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 });

    return NextResponse.json({ success: true, files: lobby.files }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
