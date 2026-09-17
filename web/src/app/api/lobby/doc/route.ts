import { NextResponse } from 'next/server';
import { redis, casSetIfNewer } from '@/lib/redis';

export const dynamic = 'force-dynamic';

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
  const fileId = searchParams.get('fileId');
  const since = searchParams.get('since') || '0';

  if (!otp || !fileId) {
    return NextResponse.json({ error: 'Missing otp or fileId' }, { status: 400, headers: corsHeaders });
  }

  try {
    const key = `doc_snapshot:${otp}:${fileId}`;
    const snapshot = await redis.get(key) as any;

    if (!snapshot) {
      return NextResponse.json({ upToDate: true, snapshot: null }, { headers: corsHeaders });
    }

    const clientSince = parseInt(since, 10);
    const isUpToDate = clientSince >= (snapshot.committedAt || 0) && clientSince > 0;

    return NextResponse.json({
      upToDate: isUpToDate,
      snapshot: isUpToDate ? null : snapshot,
      content: isUpToDate ? null : snapshot.content,
      authorNodeId: snapshot.authorNodeId,
    }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, fileId, content, authorNodeId, vectorClock, seq, committedAt, isSessionEnd, isDone } = body;

    if (!otp || !fileId || content === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    const key = `doc_snapshot:${otp}:${fileId}`;
    const now = Date.now();
    const incomingCommittedAt = committedAt || now;

    // Atomic compare-and-set: the "is this newer?" check and the write happen
    // as one indivisible Redis operation, so two concurrent pushes (e.g. two
    // peers reconnecting with concurrent edits) can't both read stale state
    // and both overwrite each other — the commit with the later timestamp
    // always wins, regardless of which request's network round-trip finishes
    // first.
    const { written, snapshot } = await casSetIfNewer(
      key,
      { content, authorNodeId, vectorClock: vectorClock || null, seq, committedAt: incomingCommittedAt },
      60 * 60 * 24
    );

    if (!written) {
      return NextResponse.json({ success: true, ignored: true, snapshot }, { headers: corsHeaders });
    }

    // Only record history if the user explicitly saves or a conflict resolves
    if (isSessionEnd || isDone) {
      const historyKey = `doc_history:${otp}:${fileId}`;
      let skipLog = false;
      const latestStr = await redis.lindex(historyKey, 0);
      if (latestStr) {
        try {
          const latest = JSON.parse(latestStr as string);
          if (latest.fullContent === content) {
            skipLog = true;
          }
        } catch (e) {}
      }

      if (!skipLog) {
        const historyEvent = {
          eventId: Date.now().toString(),
          fileId,
          nodeId: authorNodeId,
          eventType: isSessionEnd ? 'session-snapshot' : 'edit',
          logicalTimestamp: incomingCommittedAt,
          payloadPreview: content.substring(0, 100), // Preview only to save space
          fullContent: content, // Keep full content for conflict diff viewing
          createdAt: new Date().toISOString(),
          isCompacted: false,
        };
        await redis.lpush(historyKey, JSON.stringify(historyEvent));
        // Trim history to 50 items
        await redis.ltrim(historyKey, 0, 49);
      }
    }

    return NextResponse.json({ success: true, snapshot }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
