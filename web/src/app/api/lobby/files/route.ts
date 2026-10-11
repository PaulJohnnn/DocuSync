import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { LobbyEntry } from '../store';
import { documentSignature } from '@/lib/documentSignature';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DAY_SECONDS = 60 * 60 * 24;

/** Same-name matching, so "Thesis.docx" and "thesis.docx " are one file. */
function sameName(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nameOf(f: Record<string, unknown>): string {
  return String(f.fileName ?? f.name ?? '');
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const otp = searchParams.get('otp');

  if (!otp) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
  }

  const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
  }

  const activeFiles = (lobby.files || []).filter((f) => !f.isDeleted);
  return NextResponse.json({ files: activeFiles }, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { otp, file } = body;

    if (!otp || !file) {
      return NextResponse.json({ error: 'Missing otp or file data' }, { status: 400, headers: corsHeaders });
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
    }

    if (!lobby.files) lobby.files = [];

    const incomingName = nameOf(file);
    const existingIndex = lobby.files.findIndex((f) => sameName(nameOf(f), incomingName));
    const isReplacement = existingIndex >= 0;

    // The file id belongs to the room, not to the uploader.
    //
    // Every upload used to mint a fresh id from the clock
    // (`Date.now() + i`), and this route then overwrote the row it matched
    // BY NAME with that new id. Everything a document owns is keyed by id --
    // `doc_snapshot:<otp>:<fileId>`, `doc_history:<otp>:<fileId>`,
    // `doc_history_seq:<otp>:<fileId>` -- so re-uploading a file under its
    // own name silently cut the document loose from its entire version
    // history. That is what the panel saw as the history being deleted: it
    // was never deleted, it was orphaned under an id nothing referenced any
    // more.
    //
    // The id is therefore assigned here once and preserved on every later
    // upload of the same name; the client's id is honoured only for a
    // genuinely new file. Deciding it server-side means desktop and mobile
    // get the same guarantee without shipping a new build.
    const previous = isReplacement ? lobby.files[existingIndex] : null;
    const fileId = isReplacement
      ? (previous!.fileId ?? previous!.id ?? file.fileId ?? file.id)
      : (file.fileId ?? file.id);

    if (fileId === undefined || fileId === null || fileId === '') {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400, headers: corsHeaders });
    }

    const version = isReplacement ? Number(previous!.version ?? 1) + 1 : 1;
    const now = Date.now();

    const stored = {
      ...file,
      fileId,
      id: fileId,
      version,
      isDeleted: false,
      firstSharedAt: isReplacement ? (previous!.firstSharedAt ?? previous!.sharedAt ?? now) : now,
      updatedAt: now,
    };

    if (isReplacement) {
      lobby.files[existingIndex] = stored;
    } else {
      lobby.files.push(stored);
    }

    await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });

    // Auto-sync the new content to everyone already in the room.
    //
    // Sharing a file only ever wrote this lobby row, which nobody sitting in
    // the editor reads -- they poll `doc_snapshot:<otp>:<fileId>`. So a
    // re-upload changed the file list and nothing else: the people editing
    // carried on against the old text and were never told. Writing the
    // snapshot here is what makes the upload reach them, and what turns an
    // upload into something the editor can show rather than a silent
    // divergence.
    let replacedContent: string | null = null;
    const content = typeof file.content === 'string' ? file.content : null;

    if (content !== null) {
      const snapKey = `doc_snapshot:${otp}:${fileId}`;
      const priorSnap = (await redis.get(snapKey)) as { content?: string } | null;
      replacedContent = typeof priorSnap?.content === 'string' ? priorSnap.content : null;

      await redis.set(snapKey, {
        content,
        authorNodeId: file.sharedByNodeId ?? file.authorNodeId ?? null,
        // No vector clock: an upload is not an edit derived from anyone's
        // causal history, it is a new baseline for the document. Leaving it
        // null makes the next real edit from any peer compare as a plain
        // fast-forward rather than as a phantom conflict against a clock no
        // device actually holds.
        vectorClock: null,
        seq: 0,
        committedAt: now,
        storedAt: now,
        // Who replaced this document, and with which upload.
        //
        // Writing the snapshot is what makes an upload REACH the people
        // already editing; this is what makes it VISIBLE to them. Without
        // it their document silently changed under their cursor -- the
        // uploader got a dialog explaining what they had just done, and
        // the people it was done TO got nothing, which is the half of
        // "conflict management when uploading while others are editing"
        // that auto-syncing alone does not cover.
        //
        // Carried on the snapshot rather than sent as a message because
        // the web path has no push channel: every client already polls
        // this object, so a marker on it reaches all of them, including
        // one that reconnects a minute later.
        uploadedVersion: version,
        uploadedBy: file.sharedBy ?? null,
        uploadedByNodeId: file.sharedByNodeId ?? null,
        uploadedAt: now,
        uploadedFileName: incomingName,
      }, { ex: DAY_SECONDS });

      // And record it as a version, so it is restorable.
      //
      // An upload is the one event most likely to destroy work -- it
      // replaces the whole document -- so the text it replaced is logged as
      // its own entry directly beneath it. That makes "I uploaded over our
      // work" recoverable from the Version History panel, the same way a
      // lost Last-Write-Wins arbitration already is.
      const historyKey = `doc_history:${otp}:${fileId}`;
      const anchorKey = `doc_history_anchors:${otp}:${fileId}`;
      const seqKey = `doc_history_seq:${otp}:${fileId}`;

      // Whether the text this upload replaced is ALREADY in the log.
      //
      // It usually is: the last person to edit left their work there on
      // save. Logging it again produces two rows a reader cannot tell
      // apart -- the exact duplication this history is supposed to be free
      // of.
      //
      // Checked across the whole recent window rather than just the newest
      // row. Only checking the newest missed the case that actually
      // occurs: someone restores an older version, which is deduplicated
      // against the log and so adds no row, and then an upload lands --
      // leaving the restored state present further down the list but not
      // at the head, and logged a second time. Same window the edit path
      // uses, for the same reason.
      //
      // Compared on what the page renders, not on the markup, since a
      // re-serialised save differs by whitespace alone.
      const RECENT_WINDOW = 12;
      const recentRaw = await redis.lrange(historyKey, 0, RECENT_WINDOW - 1);
      const recentEntries = recentRaw
        .map((raw: unknown) => {
          try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
        })
        .filter(Boolean) as { fullContent?: string }[];
      const replacedSig = replacedContent ? documentSignature(replacedContent) : null;
      const alreadyLogged =
        !!replacedSig &&
        recentEntries.some(
          (e) => typeof e.fullContent === 'string' && documentSignature(e.fullContent) === replacedSig
        );

      if (isReplacement && replacedContent && replacedContent !== content && !alreadyLogged) {
        const supersededSeq = await redis.incr(seqKey);
        const supersededAt = Date.now();
        await redis.lpush(historyKey, JSON.stringify({
          eventId: `${supersededAt}-${supersededSeq}`,
          seqNo: supersededSeq,
          fileId,
          nodeId: file.sharedByNodeId ?? null,
          eventType: 'edit',
          label: `Replaced by upload v${version}`,
          logicalTimestamp: supersededAt,
          recordedAt: supersededAt,
          payloadPreview: replacedContent.substring(0, 100),
          fullContent: replacedContent,
          createdAt: new Date(supersededAt).toISOString(),
          isCompacted: false,
        }));
      }

      const seqNo = await redis.incr(seqKey);
      const recordedAt = Date.now();
      await redis.lpush(historyKey, JSON.stringify({
        eventId: `${recordedAt}-${seqNo}`,
        seqNo,
        fileId,
        nodeId: file.sharedByNodeId ?? null,
        eventType: 'upload',
        version,
        label: isReplacement ? `Uploaded v${version}` : 'Uploaded',
        uploadedBy: file.sharedBy ?? null,
        fileName: incomingName,
        logicalTimestamp: recordedAt,
        recordedAt,
        payloadPreview: content.substring(0, 100),
        fullContent: content,
        createdAt: new Date(recordedAt).toISOString(),
        isCompacted: false,
      }));
      await redis.ltrim(historyKey, 0, 49);

      // Keep the upload outside the rolling window as well.
      //
      // The list above is trimmed to fifty, so a long editing session
      // pushes the oldest rows off the end -- and the oldest row is the
      // document as it was first uploaded, which is the one version a
      // reader is most likely to want back. Measured: after sixty
      // revisions the baseline was gone and the log held no upload row at
      // all, which makes "nothing is ever permanently lost" untrue for
      // exactly the case that matters most.
      //
      // Anchors are the versions that must outlive the window: an upload
      // replaces the whole document, and a conflict records a decision
      // nobody can reconstruct afterwards. /api/lobby/history merges this
      // list with the rolling one.
      await redis.lpush(anchorKey, JSON.stringify({
        eventId: `${recordedAt}-${seqNo}`,
        seqNo,
        fileId,
        nodeId: file.sharedByNodeId ?? null,
        eventType: 'upload',
        version,
        label: isReplacement ? `Uploaded v${version}` : 'Uploaded',
        uploadedBy: file.sharedBy ?? null,
        fileName: incomingName,
        logicalTimestamp: recordedAt,
        recordedAt,
        payloadPreview: content.substring(0, 100),
        fullContent: content,
        createdAt: new Date(recordedAt).toISOString(),
        isCompacted: false,
      }));
      await redis.ltrim(anchorKey, 0, 49);
    }

    return NextResponse.json({
      success: true,
      files: lobby.files,
      // What the client needs in order to warn the uploader. `replaced`
      // says the name was already taken; `hadLiveContent` says there was
      // real work under it that this upload has just superseded.
      fileId,
      version,
      replaced: isReplacement,
      hadLiveContent: !!(replacedContent && replacedContent !== content),
      previousVersion: isReplacement ? version - 1 : 0,
    }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json(
      { error: 'Internal Server Error: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const otp = searchParams.get('otp');
    const fileId = searchParams.get('fileId');
    const fileName = searchParams.get('fileName');

    if (!otp || (!fileId && !fileName)) {
      return NextResponse.json({ error: 'Missing otp or fileId/fileName' }, { status: 400, headers: corsHeaders });
    }

    const lobby = (await redis.get(`lobby:${otp}`)) as LobbyEntry | null;
    if (!lobby || !lobby.files) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404, headers: corsHeaders });
    }

    lobby.files = lobby.files.map((f) => {
      const idMatch = fileId && String(f.fileId ?? f.id) === String(fileId);
      const nameMatch = fileName && sameName(nameOf(f), fileName);
      if (idMatch || nameMatch) {
        return { ...f, isDeleted: true, deletedAt: new Date().toISOString() };
      }
      return f;
    });

    await redis.set(`lobby:${otp}`, lobby, { ex: DAY_SECONDS });

    return NextResponse.json({ success: true, files: lobby.files }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
