import { NextResponse } from 'next/server';
import { activeLobbies } from '../store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');

  if (!otp || !activeLobbies.has(otp)) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
  }

  const lobby = activeLobbies.get(otp)!;
  return NextResponse.json({ files: lobby.files || [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, file } = body;

    if (!otp || !activeLobbies.has(otp)) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Missing file data' }, { status: 400 });
    }

    const lobby = activeLobbies.get(otp)!;
    if (!lobby.files) lobby.files = [];
    
    // Check if file already exists (by name or id)
    const existingIndex = lobby.files.findIndex((f) => f.fileName === file.fileName || f.name === file.name);
    if (existingIndex >= 0) {
      lobby.files[existingIndex] = file;
    } else {
      lobby.files.push(file);
    }

    return NextResponse.json({ success: true, files: lobby.files });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
