import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/lobby/conflicts?otp=XXXXX
 *
 * Returns all active offline conflicts for a room.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');

    if (!otp) {
      return NextResponse.json(
        { error: 'Missing otp' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `conflicts:${otp}`;
    const rawConflicts = await redis.get(key) as any[];
    const conflicts = Array.isArray(rawConflicts) ? rawConflicts : [];

    return NextResponse.json({ conflicts }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Conflicts GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * DELETE /api/lobby/conflicts?otp=XXXXX&conflictId=YYYY
 * 
 * Removes a conflict from the room's conflict list once resolved.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');
    const conflictId = url.searchParams.get('conflictId');

    if (!otp || !conflictId) {
      return NextResponse.json(
        { error: 'Missing otp or conflictId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `conflicts:${otp}`;
    const rawConflicts = await redis.get(key) as any[];
    if (Array.isArray(rawConflicts)) {
      const updatedList = rawConflicts.filter(c => c.conflictId !== conflictId);
      await redis.set(key, updatedList, { ex: 86400 });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Conflicts DELETE] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
