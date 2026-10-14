import { redis } from '@/lib/redis';

export type CursorEntry = {
  nodeId: string;
  displayName: string;
  color: string;
  from: number;
  to: number;
  fileId: number;
  ts: number;
};

/**
 * Everyone else's caret in one room and file.
 *
 * Lives here rather than in the cursors route because the document poll
 * now asks for these alongside the text instead of in a request of its
 * own. They answer questions about the same room and the same file at
 * the same moment, so splitting them across two round trips bought
 * nothing and cost one of the two polls every open editor was running.
 */
/** How long a caret survives without being republished. */
export const CURSOR_TTL_SECONDS = 15;

/** The set of node ids that have published a caret in this room. */
export const cursorRosterKey = (otp: string) => `cursor_nodes:${otp}`;

/**
 * Record that this node has a caret, so it can be found without a scan.
 *
 * The set is kept a good deal longer than the carets themselves. Members
 * whose caret has expired simply read back as null and are dropped below;
 * paying for a slightly stale set is much cheaper than paying for a
 * keyspace scan on every read.
 */
export async function rememberCursorNode(otp: string, nodeId: string): Promise<void> {
  const key = cursorRosterKey(otp);
  await redis.sadd(key, nodeId);
  await redis.expire(key, 60 * 60);
}

export async function readCursors(
  otp: string,
  myNodeId: string | null,
  fileId: number,
): Promise<CursorEntry[]> {
  // Read from the room's own roster rather than with redis.keys().
  //
  // A KEYS scan walks the whole keyspace, which is shared with every
  // other room on the instance -- so its cost has nothing to do with how
  // many people are in THIS room, and it has a long tail. Once the
  // document poll started carrying carets, that tail landed on the
  // document's own response: the median was unchanged but the 90th
  // percentile went from 415ms to 688ms, which at a 700ms poll is a
  // skipped tick, and skipped ticks are how a fast typist's lines go
  // missing. This reads exactly the members of one room.
  const members = (await redis.smembers(cursorRosterKey(otp))) as string[];
  if (!members || members.length === 0) return [];

  const others = members.filter((id) => id !== myNodeId);
  if (others.length === 0) return [];

  const all = (await redis.mget(...others.map((id) => `cursor:${otp}:${id}`))) as (CursorEntry | null)[];
  return all
    .filter((c): c is CursorEntry => c !== null)
    .filter((c) => c.fileId === fileId);    // same file only
}
