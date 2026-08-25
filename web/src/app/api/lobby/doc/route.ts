import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Gone: Matchmaker document handling stripped in favor of Desktop Host P2P.' }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: 'Gone: Matchmaker document handling stripped in favor of Desktop Host P2P.' }, { status: 410 });
}
