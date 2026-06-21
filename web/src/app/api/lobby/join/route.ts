import { NextResponse } from 'next/server';
import { activeLobbies, cleanupLobbies } from '../store';

export async function POST(request: Request) {
  try {
    cleanupLobbies();
    const body = await request.json();
    const { otp } = body;

    if (!otp) {
      return NextResponse.json({ error: 'Missing otp' }, { status: 400 });
    }

    const lobby = activeLobbies.get(otp);
    if (!lobby) {
      return NextResponse.json({ error: 'Session expired or invalid' }, { status: 404 });
    }

    // Instantly delete the OTP so it cannot be reused
    activeLobbies.delete(otp);

    return NextResponse.json({
      ip: lobby.ip,
      port: lobby.port,
      nodeId: lobby.nodeId
    }, { status: 200 });

  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
