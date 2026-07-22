import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST() {
  try {
    const keys = await redis.keys('lobby:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map((key: string) => redis.del(key)));
    }
    return NextResponse.json({ success: true, message: 'All matchmaker state reset' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to reset state' }, { status: 500 });
  }
}

