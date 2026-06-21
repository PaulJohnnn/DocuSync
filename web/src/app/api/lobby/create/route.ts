import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies, Lobby } from '../store';

export async function POST(request: Request) {
  try {
    cleanupLobbies();
    const body = await request.json();
    const { nodeId, ip, port } = body;

    if (!nodeId || !ip || !port) {
      return NextResponse.json({ error: 'Missing nodeId, ip, or port' }, { status: 400 });
    }

    // Generate random 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();

    const newLobby: Lobby = {
      otp,
      ip,
      port: Number(port),
      nodeId,
      createdAt: Date.now(),
    };

    activeLobbies.set(otp, newLobby);

    return NextResponse.json({ otp }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
