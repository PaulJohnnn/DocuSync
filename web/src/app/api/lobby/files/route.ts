import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { LobbyEntry } from '../store';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
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

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
    }

    if (!lobby.files) lobby.files = [];
    
    // Check if file already exists (by name or id)
    const existingIndex = lobby.files.findIndex((f) => {
      const existingName = f.fileName || f.name;
      const newName = file.fileName || file.name;
      return existingName && newName && existingName === newName;
    });
    if (existingIndex >= 0) {
      lobby.files[existingIndex] = file;
    } else {
      lobby.files.push(file);
    }

    await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });

    return NextResponse.json({ success: true, files: lobby.files }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const otp = searchParams.get('otp');
    const fileId = searchParams.get('fileId');
    const fileName = searchParams.get('fileName');

    if (!otp || (!fileId && !fileName)) {
      return NextResponse.json({ error: 'Missing otp or fileId/fileName' }, { status: 400, headers: corsHeaders });
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    if (!lobby || !lobby.files) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
    }

    lobby.files = lobby.files.filter((f) => {
      const idMatch = fileId && String(f.fileId ?? f.id) === String(fileId);
      const nameMatch = fileName && (f.fileName === fileName || f.name === fileName);
      return !idMatch && !nameMatch;
    });

    await redis.set(`lobby:${otp}`, lobby, { ex: 60 * 60 * 24 });

    return NextResponse.json({ success: true, files: lobby.files }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
