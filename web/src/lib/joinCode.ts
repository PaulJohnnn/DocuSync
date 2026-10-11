import { redis } from '@/lib/redis';
import type { LobbyEntry } from '@/app/api/lobby/store';

/**
 * Join codes, and why they are not the room's identity.
 *
 * Panel 2 asked for the room code to be re-generated. The obvious reading —
 * give the room a new `otp` — is the expensive one, because `otp` is not
 * just a code: every piece of a room's state is keyed by it
 * (`doc_snapshot:<otp>:<fileId>`, `doc_history:<otp>:<fileId>`,
 * `doc_history_seq:<otp>:<fileId>`, `doc_stats:<otp>`). Changing it means
 * migrating all of them, and any peer that misses the migration quietly
 * falls out of the room with no way back.
 *
 * So `otp` is treated as the room's permanent internal id and never
 * changes, while the six characters people actually type become a separate,
 * rotatable alias pointing at it. Rotating a code then moves no document
 * state at all: one small pointer key is written and one is deleted.
 *
 * A room created before this existed has no alias, so `resolveJoinCode`
 * falls back to treating the code as the room id — which is exactly what it
 * was.
 */

const DAY_SECONDS = 60 * 60 * 24;
export const JOIN_CODE_TTL_MS = DAY_SECONDS * 1000;

/** Characters with no 0/O or 1/I/L pairs, so a code read aloud is unambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join('');
}

/** Mints a code that is not currently an alias, nor a room id. */
export async function mintJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const [aliasTaken, roomTaken] = await Promise.all([
      redis.get(`joincode:${code}`),
      redis.get(`lobby:${code}`),
    ]);
    if (!aliasTaken && !roomTaken) return code;
  }
  throw new Error('Could not generate a unique join code');
}

/** Points `code` at `otp` for the standard lifetime. */
export async function setJoinCodeAlias(code: string, otp: string): Promise<void> {
  await redis.set(`joincode:${code}`, otp, { ex: DAY_SECONDS });
}

/**
 * Turns whatever the user typed into the room's internal id.
 *
 * Order matters: the alias is checked first so a rotated code reaches the
 * right room, and the direct lookup second so rooms predating aliases, and
 * a room whose current code still equals its id, both keep working.
 */
export async function resolveJoinCode(code: string): Promise<string | null> {
  const aliased = (await redis.get(`joincode:${code}`)) as string | null;
  if (aliased) return aliased;
  const direct = await redis.get(`lobby:${code}`);
  return direct ? code : null;
}

/**
 * Rotates the room's join code if the current one has lapsed.
 *
 * Called from the host's heartbeat, so a room that is still being used
 * keeps a working code indefinitely while an abandoned one simply expires
 * with its Redis TTL. Returns the code now in force, and whether this call
 * is what changed it.
 *
 * The old alias is deleted rather than left to expire: a code that has been
 * replaced should stop working at once, which is the whole point of
 * rotating it.
 */
export async function rotateJoinCodeIfExpired(
  lobby: LobbyEntry
): Promise<{ joinCode: string; rotated: boolean }> {
  const now = Date.now();
  const current = lobby.joinCode || lobby.otp;
  const expiresAt = lobby.joinCodeExpiresAt ?? 0;

  // A room that predates join codes gets one now, without rotating: its
  // code is still the one its members are holding.
  if (!lobby.joinCode || !lobby.joinCodeExpiresAt) {
    lobby.joinCode = current;
    lobby.joinCodeExpiresAt = now + JOIN_CODE_TTL_MS;
    await setJoinCodeAlias(current, lobby.otp);
    await redis.set(`lobby:${lobby.otp}`, lobby, { ex: DAY_SECONDS });
    return { joinCode: current, rotated: false };
  }

  if (now < expiresAt) return { joinCode: current, rotated: false };

  const next = await mintJoinCode();
  await setJoinCodeAlias(next, lobby.otp);
  if (current !== lobby.otp) {
    // Never delete the room's own id as though it were a stale alias.
    await redis.del(`joincode:${current}`);
  }

  lobby.joinCode = next;
  lobby.joinCodeExpiresAt = now + JOIN_CODE_TTL_MS;
  // The room's own lifetime is extended alongside the code, or rotating it
  // would hand out a fresh code to a room about to vanish.
  lobby.expiresAt = now + JOIN_CODE_TTL_MS;
  await redis.set(`lobby:${lobby.otp}`, lobby, { ex: DAY_SECONDS });

  return { joinCode: next, rotated: true };
}
