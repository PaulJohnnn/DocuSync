import { NextResponse } from 'next/server';
import { activeLobbies, activeUsers, ipRateLimits } from '../store';

export async function POST() {
  activeLobbies.clear();
  activeUsers.clear();
  ipRateLimits.clear();
  return NextResponse.json({ success: true, message: 'All matchmaker state reset' });
}
