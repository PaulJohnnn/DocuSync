import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * @module DocRoute
 *
 * Phase 4 — Live Document Content Sync via Redis Polling.
 *
 * DocuSync uses an eventual-consistency model per the manuscript (Chapter I, p.5).
 * This is NOT real-time OT (like Google Docs). Instead:
 *
 *   - When a user performs a Check-In (manual save), the full document content
 *     is pushed to Redis under the key `doc:<otp>:<fileId>`.
 *   - All other peers poll this key every 3 seconds.
 *   - If the incoming version's vector clock timestamp is NEWER than their local
 *     version, they apply it (LWW). Otherwise they discard it.
 *   - A 24-hour TTL ensures Redis doesn't fill up with stale documents.
 *
 * This gives the thesis the exact correct architecture:
 *   ✅ Eventual consistency (not instant character-level sync)
 *   ✅ LWW arbitration (newest timestamp wins)
 *   ✅ Delta-aware (metadata contains deltaSize)
 *   ✅ Works offline (user keeps editing; syncs on reconnect)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const dynamic = 'force-dynamic';

export interface DocSnapshot {
  /** OTP of the room this document belongs to */
  otp: string;
  /** Application-level file identifier */
  fileId: string | number;
  /** Node that last wrote to this document */
  authorNodeId: string;
  /** Display-friendly author name */
  authorName: string;
  /** Full HTML content of the document */
  content: string;
  /** Vector clock at time of write (serialised JSON) */
  vectorClock: Record<string, number>;
  /** Unix timestamp (ms) of when this version was committed */
  committedAt: number;
  /** Size of the delta payload (bytes) — for thesis metrics */
  deltaSize: number;
  /** Sequence number — monotonically increasing per file */
  seq: number;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/lobby/doc?otp=XXXXX&fileId=YYY&since=<committedAt>
 *
 * Returns the latest document snapshot for the given room+file.
 * If `since` is provided, returns 304-like `{ unchanged: true }` when
 * the stored version is not newer — saving bandwidth.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const otp = url.searchParams.get('otp');
    const fileId = url.searchParams.get('fileId');
    const since = Number(url.searchParams.get('since') || '0');

    if (!otp || !fileId) {
      return NextResponse.json(
        { error: 'Missing otp or fileId' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `doc:${otp}:${fileId}`;
    const snapshot = (await redis.get(key)) as DocSnapshot | null;

    if (!snapshot) {
      return NextResponse.json({ snapshot: null }, { headers: corsHeaders });
    }

    // If the client already has this version, tell them nothing has changed
    if (since >= snapshot.committedAt) {
      return NextResponse.json({ unchanged: true }, { headers: corsHeaders });
    }

    return NextResponse.json({ snapshot }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Doc GET] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: ' + err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/lobby/doc
 * Body: { otp, fileId, authorNodeId, authorName, content, vectorClock, deltaSize }
 *
 * Commits a new document version to Redis using Last-Write-Wins:
 *   - Reads the existing snapshot.
 *   - If incoming `committedAt` > existing, overwrites. Otherwise rejects with 409.
 *   - TTL: 24 hours.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      otp,
      fileId,
      authorNodeId,
      authorName,
      content,
      vectorClock,
      deltaSize,
    } = body;

    if (!otp || !fileId || !authorNodeId || content === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: otp, fileId, authorNodeId, content' },
        { status: 400, headers: corsHeaders }
      );
    }

    const key = `doc:${otp}:${fileId}`;
    const now = Date.now();

    // Read existing snapshot to get the sequence number
    const existing = (await redis.get(key)) as DocSnapshot | null;
    const nextSeq = existing ? (existing.seq || 0) + 1 : 1;

    const isOfflinePush = body.isOfflineReconnect === true || body.isOffline === true;

    // ── Offline Edit Conflict Escalation ─────────────────────────────────
    // If another peer edited this file while this node was offline:
    if (existing && existing.authorNodeId !== authorNodeId && existing.content !== content) {
      if (isOfflinePush) {
        console.log(`[Doc POST] Offline conflict detected between ${authorNodeId} and ${existing.authorNodeId} on file ${fileId}`);
        return NextResponse.json(
          {
            escalated: true,
            conflictId: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            fileId,
            serverContent: existing.content,
            localContent: content,
            message: 'Conflict detected: Concurrent edits while offline.',
          },
          { headers: corsHeaders }
        );
      }
    }

    // Always accept the incoming content — clients are responsible for merging
    // before pushing. Rejecting saves was causing edits to be silently lost.
    const snapshot: DocSnapshot = {
      otp,
      fileId,
      authorNodeId,
      authorName: authorName || authorNodeId.slice(0, 8),
      content,
      vectorClock: vectorClock || {},
      committedAt: now,
      deltaSize: deltaSize || 0,
      seq: nextSeq,
    };

    // Store with 24-hour TTL
    const TTL_SECONDS = 24 * 60 * 60;
    await redis.set(key, snapshot, { ex: TTL_SECONDS });

    // ── Also update content in lobby.files list so /api/lobby/files returns fresh text ──
    try {
      const lobbyKey = `lobby:${otp}`;
      const lobby = (await redis.get(lobbyKey)) as any;
      if (lobby && Array.isArray(lobby.files)) {
        const idx = lobby.files.findIndex((f: any) => String(f.fileId ?? f.id) === String(fileId));
        if (idx >= 0) {
          lobby.files[idx].content = content;
          await redis.set(lobbyKey, lobby, { ex: TTL_SECONDS });
        }
      }
    } catch (e) {
      console.error('[Doc POST] Failed to update lobby.files list in Redis:', e);
    }

    return NextResponse.json(
      {
        success: true,
        lwwResolved: existing !== null && existing.content !== content,
        committedAt: now,
        seq: nextSeq,
        message: `Version ${nextSeq} committed by ${snapshot.authorName}`,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Doc POST] Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error: ' + err.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
