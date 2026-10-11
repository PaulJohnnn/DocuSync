import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * The Redis client sometimes hands back list entries already parsed into
 * objects rather than as the JSON strings they were written as. Both are
 * accepted; anything unreadable is dropped rather than failing the request.
 */
function parseEntry(raw: unknown): Record<string, unknown> | null {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');
  const fileId = searchParams.get('fileId');

  if (!fileId) {
    return NextResponse.json({ error: 'Missing fileId' }, { status: 400, headers: corsHeaders });
  }

  if (!otp) {
    return NextResponse.json({ success: true, data: { entries: [] } }, { headers: corsHeaders });
  }

  try {
    // Two lists, one timeline.
    //
    // `doc_history` is a rolling window trimmed to the most recent fifty
    // versions, which is what keeps a long editing session from growing
    // without bound. The cost is that its oldest rows fall off the end --
    // and the oldest row is the document as it was first uploaded.
    // Measured: after sixty revisions the baseline was gone, so the one
    // version a reader is most likely to want back was the first to be
    // discarded.
    //
    // `doc_history_anchors` holds the versions that must outlive that
    // window: every upload, because it replaced the whole document, and
    // every conflict, because the decision it records cannot be
    // reconstructed from the versions around it. They are written there in
    // addition to the rolling list, so a recent anchor appears in both and
    // is de-duplicated below.
    const [rollingRaw, anchorsRaw] = await Promise.all([
      redis.lrange(`doc_history:${otp}:${fileId}`, 0, 50),
      redis.lrange(`doc_history_anchors:${otp}:${fileId}`, 0, 50),
    ]);

    const byEventId = new Map<string, Record<string, unknown>>();
    for (const raw of [...rollingRaw, ...anchorsRaw]) {
      const entry = parseEntry(raw);
      if (!entry) continue;
      // `seqNo` is the server's own counter and is unique per version, so
      // it identifies a row even where an older entry predates eventId.
      const key = String(entry.eventId ?? entry.seqNo ?? JSON.stringify(entry).slice(0, 64));
      if (!byEventId.has(key)) byEventId.set(key, entry);
    }

    // Newest first, by the server's counter, so every device shows the
    // same order regardless of which list a row came from.
    const entries = Array.from(byEventId.values()).sort((a, b) => {
      const sa = typeof a.seqNo === 'number' ? a.seqNo : -1;
      const sb = typeof b.seqNo === 'number' ? b.seqNo : -1;
      if (sa !== sb) return sb - sa;
      const ra = typeof a.recordedAt === 'number' ? a.recordedAt : 0;
      const rb = typeof b.recordedAt === 'number' ? b.recordedAt : 0;
      return rb - ra;
    });

    return NextResponse.json({ success: true, data: { entries } }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
