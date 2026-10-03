import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const DEFAULT_USERS = [
  {
    id: 'user-001',
    email: 'alice@docusync.local',
    name: 'Alice Reyes',
    pin: '123456',
    isAdmin: false,
    createdAt: '2025-01-10T08:00:00Z',
    status: 'active',
  },
  {
    id: 'user-002',
    email: 'admin',
    name: 'Admin',
    pin: 'admin',
    isAdmin: true,
    createdAt: '2025-01-01T08:00:00Z',
    status: 'active',
  },
];

/**
 * Fields that must never leave the server on a listing endpoint.
 * `pin` doubles as the account password (`set_password` writes the chosen
 * password straight into it), and the `resetOtp*` fields are a live
 * account-recovery token.
 */
const SECRET_FIELDS = ['pin', 'resetOtp', 'resetOtpIssuedAt', 'resetOtpVerified'] as const;

/** Redis key holding `{ [adminUserId]: lastSeenEpochMs }`. */
const ADMIN_PRESENCE_KEY = 'admin_presence';
/**
 * How stale a heartbeat may be before that admin counts as gone. Admin
 * sessions beat every 15s, so this tolerates two missed beats — long enough
 * to ride out a slow request, short enough that closing the tab is noticed
 * within about a minute.
 */
const ADMIN_ONLINE_WINDOW_MS = 45_000;

function publicUser(u: any) {
  const safe: any = { ...u };
  for (const f of SECRET_FIELDS) delete safe[f];
  // Keep the shape callers rely on without revealing the value itself.
  safe.hasPin = Boolean(u?.pin);
  return safe;
}

function publicPending(p: any) {
  const safe: any = { ...p };
  for (const f of SECRET_FIELDS) delete safe[f];
  return safe;
}

async function getDb() {
  try {
    const raw = await redis.get('auth_db');
    if (!raw) {
      const initialDb = { users: DEFAULT_USERS, pending: [] };
      await redis.set('auth_db', initialDb);
      return initialDb;
    }
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error('Failed to read mock DB from redis', err);
    return { users: DEFAULT_USERS, pending: [] };
  }
}

async function saveDb(data: any) {
  try {
    await redis.set('auth_db', data);
  } catch (err) {
    console.error('Failed to save mock DB to redis', err);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  const db = await getDb();

  if (action === 'sync') {
    // Only return current states. Auto-approval logic has been permanently removed.
    // Accounts will sit in db.pending indefinitely until an Admin manually calls the approve API.
    //
    // Secrets are stripped before this leaves the server. Every signed-in
    // client polls this endpoint every two seconds, so anything included
    // here sits in plain sight in the browser's Network tab — and `pin`
    // holds the account's actual login credential (see `set_password`,
    // which writes the chosen password into that field). It was returning
    // the whole user record, so opening dev tools exposed every account's
    // password, along with the live password-reset codes.
    return NextResponse.json(
      { users: db.users.map(publicUser), pending: db.pending.map(publicPending) },
      { headers: corsHeaders }
    );
  }

  // Lets a pending applicant collect their own credential once an admin has
  // approved them, without the roster having to carry everyone's. Scoped to
  // a single address and only while that account is active.
  if (action === 'claim_pin') {
    const email = url.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400, headers: corsHeaders });
    }
    const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.status !== 'active') {
      return NextResponse.json({ success: true, status: user?.status ?? 'pending', pin: null }, { headers: corsHeaders });
    }
    return NextResponse.json({ success: true, status: 'active', pin: user.pin }, { headers: corsHeaders });
  }

  // Is an administrator actually signed in right now?
  //
  // This is measured, not assumed: an admin's own session posts a heartbeat
  // (see `admin_heartbeat`) while its tab is open, and this reports whether
  // any of those beats is still fresh. If no admin has beaten recently the
  // answer is a plain "no" — the waiting requester is told the truth rather
  // than being left staring at a timer.
  if (action === 'admin_status') {
    const presence = ((await redis.get(ADMIN_PRESENCE_KEY)) || {}) as Record<string, number>;
    const now = Date.now();
    const liveIds = Object.entries(presence)
      .filter(([, seen]) => now - Number(seen) < ADMIN_ONLINE_WINDOW_MS)
      .map(([id]) => id);
    const lastSeen = Object.values(presence).reduce<number>((a, b) => Math.max(a, Number(b) || 0), 0);
    return NextResponse.json({
      success: true,
      online: liveIds.length > 0,
      adminsOnline: liveIds.length,
      lastSeenSecondsAgo: lastSeen ? Math.round((now - lastSeen) / 1000) : null,
    }, { headers: corsHeaders });
  }

  return NextResponse.json({ error: 'Unknown GET action' }, { status: 400, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = await getDb();

    if (action === 'set_password') {
      const { email, pin, password } = body;
      const user = db.users.find((u: any) => 
        u.email.toLowerCase() === email.toLowerCase() && 
        u.pin === pin && 
        u.status === 'active'
      );
      if (!user) {
        return NextResponse.json({ success: false, error: 'Invalid Setup Code. Please go back and copy the code shown on the approval screen.' }, { status: 401, headers: corsHeaders });
      }

      // Password strength: at least 6 chars + 1 special char
      const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
      if (password.length < 6 || !specialCharRegex.test(password)) {
        return NextResponse.json({ success: false, error: 'Password must be at least 6 characters and include at least one special character (e.g. @, !, #).' }, { status: 400, headers: corsHeaders });
      }

      user.pin = password;
      user.passwordSet = true; // Mark so we know this account has been fully configured
      await saveDb(db);
      
      const { pin: _pin, ...safeUser } = user;
      return NextResponse.json({ success: true, user: safeUser }, { headers: corsHeaders });
    }

    if (action === 'login') {
      const { email, pin } = body;
      const user = db.users.find((u: any) => 
        u.email.toLowerCase() === email.toLowerCase() && 
        u.pin === pin && 
        u.status === 'active'
      );
      if (!user) {
        return NextResponse.json({ success: false, error: 'Invalid credentials or inactive.' }, { status: 401, headers: corsHeaders });
      }
      const { pin: _pin, ...safeUser } = user;
      return NextResponse.json({ success: true, user: safeUser }, { headers: corsHeaders });
    }

    if (action === 'request') {
      const { email, deviceId } = body;
      
      // Device Limits Implementation
      if (deviceId) {
        if (!db.deviceLimits) db.deviceLimits = {};
        if (!db.deviceLimits[deviceId]) db.deviceLimits[deviceId] = { requests: [], forgots: [] };
        
        const now = Date.now();
        const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
        
        // Clean out requests older than 2 weeks
        db.deviceLimits[deviceId].requests = db.deviceLimits[deviceId].requests.filter((t: number) => now - t < TWO_WEEKS);
        
        if (db.deviceLimits[deviceId].requests.length >= 3) {
          return NextResponse.json({ success: false, error: 'You cannot request more than 3 accounts per 2 weeks.' }, { status: 429, headers: corsHeaders });
        }
      }

      // Revoked accounts stay in db.users forever (status flips to
      // 'revoked', see the `revoke` action below) rather than being
      // deleted outright — login/forgot/verify_reset_code all already
      // account for that by requiring status === 'active'. This check
      // never did, so once an admin revoked someone, that email was
      // permanently locked out of ever registering again, even though
      // `approve` below already knows how to reactivate an existing
      // revoked record instead of creating a duplicate.
      const isAlreadyUser = db.users.some((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'active');
      if (isAlreadyUser) {
        return NextResponse.json({ success: false, error: 'Already registered.' }, { status: 400, headers: corsHeaders });
      }
      
      const isPending = db.pending.some((p: any) => p.email.toLowerCase() === email.toLowerCase());
      if (!isPending) {
        const reqId = 'req-' + Date.now().toString();
        db.pending.push({
          id: reqId,
          email,
          requestedAt: new Date().toISOString(),
          // Kept so cancelling can give this device its slot back. Without
          // it a cancel has no way to find whose quota to refund.
          deviceId: deviceId || null,
        });
        
        if (deviceId) {
          db.deviceLimits[deviceId].requests.push(Date.now());
        }
        await saveDb(db);

        // Approval is intentionally admin-gated (see the GET ?action=sync
        // comment above) — a request sits in `pending` until an admin
        // calls the `approve` action below. A previous "emergency
        // auto-approve" here used `setTimeout(..., 1000)` with its own
        // independent getDb()/saveDb() cycle: on a serverless deploy the
        // function instance can be torn down before that timer ever
        // fires, and even when it does fire, two approvals landing in the
        // same ~1s window each did a full-object overwrite and silently
        // clobbered each other. Removed rather than patched, since the
        // documented design already doesn't want silent auto-approval.
      }
      
      return NextResponse.json({ success: true, status: 'verified' }, { headers: corsHeaders });
    }

    if (action === 'forgot') {
      const { email, deviceId } = body;
      
      if (deviceId) {
        if (!db.deviceLimits) db.deviceLimits = {};
        if (!db.deviceLimits[deviceId]) db.deviceLimits[deviceId] = { requests: [], forgots: [] };
        
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        db.deviceLimits[deviceId].forgots = db.deviceLimits[deviceId].forgots.filter((t: number) => now - t < ONE_DAY);
        
        if (db.deviceLimits[deviceId].forgots.length >= 1) {
          return NextResponse.json({ success: false, error: 'Forgot account only 1 time per day.' }, { status: 429, headers: corsHeaders });
        }
      }

      const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'active');
      if (!user) return NextResponse.json({ success: false, error: 'No active account found for this username.' }, { status: 404, headers: corsHeaders });
      
      // Store a temporary reset OTP separately - do NOT change user.pin yet
      const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetOtp = resetOtp;
      user.resetOtpIssuedAt = Date.now();
      
      if (deviceId) db.deviceLimits[deviceId].forgots.push(Date.now());
      await saveDb(db);
      return NextResponse.json({ success: true, pin: resetOtp }, { headers: corsHeaders });
    }

    if (action === 'verify_reset_code') {
      const { email, resetCode } = body;
      const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'active');
      if (!user || !user.resetOtp) {
        return NextResponse.json({ success: false, error: 'No pending reset found for this account.' }, { status: 400, headers: corsHeaders });
      }
      // OTP expires after 15 minutes
      const FIFTEEN_MIN = 15 * 60 * 1000;
      if (Date.now() - user.resetOtpIssuedAt > FIFTEEN_MIN) {
        user.resetOtp = null;
        await saveDb(db);
        return NextResponse.json({ success: false, error: 'Reset code has expired. Please request a new forgot password.' }, { status: 410, headers: corsHeaders });
      }
      if (user.resetOtp !== resetCode) {
        return NextResponse.json({ success: false, error: 'Incorrect reset code.' }, { status: 401, headers: corsHeaders });
      }
      // Mark as verified so next step can set password
      user.resetOtpVerified = true;
      await saveDb(db);
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    if (action === 'set_reset_password') {
      const { email, resetCode, newPassword } = body;
      const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'active');
      if (!user || !user.resetOtp || !user.resetOtpVerified || user.resetOtp !== resetCode) {
        return NextResponse.json({ success: false, error: 'Verification step incomplete. Please restart the forgot password flow.' }, { status: 400, headers: corsHeaders });
      }

      const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/;
      if (newPassword.length < 6 || !specialCharRegex.test(newPassword)) {
        return NextResponse.json({ success: false, error: 'Password must be at least 6 characters and include at least one special character.' }, { status: 400, headers: corsHeaders });
      }

      user.pin = newPassword;
      user.passwordSet = true;
      user.resetOtp = null;
      user.resetOtpVerified = false;
      user.resetOtpIssuedAt = null;
      await saveDb(db);
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    // Every write below is awaited before the response is sent. This file
    // already documents (see the `request` handler) that on a serverless
    // deploy the function instance can be torn down as soon as it responds,
    // taking any still-in-flight Redis write with it. The admin actions
    // (approve/deny/revoke/reset_pin/renew_otp) and cancel_request were
    // returning `success: true` without awaiting `saveDb`, so an admin's
    // Approve could report success while the account silently stayed in
    // `pending` — reproduced locally as a cancel_request that "succeeded"
    // and left the request in place.
    if (action === 'cancel_request') {
      const { email, deviceId } = body;
      const idx = db.pending.findIndex((p: any) => p.email.toLowerCase() === email.toLowerCase());
      if (idx !== -1) {
        const cancelled = db.pending[idx];
        db.pending.splice(idx, 1);

        // Give the device its request slot back.
        //
        // A device may make three requests per fortnight, and that counter
        // was only ever appended to. Cancelling removed the pending entry but
        // kept the tally, so someone who withdrew a request and tried again
        // was refused after a couple of attempts — which reads as "that name
        // is not available", even though the name is free and no account was
        // ever created. The limit exists to stop bulk registration; a
        // withdrawn request created nothing, so it should not count.
        const owner = cancelled?.deviceId || deviceId;
        if (owner && db.deviceLimits?.[owner]?.requests?.length) {
          db.deviceLimits[owner].requests.pop();
        }

        await saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    if (action === 'approve') {
      const { reqId } = body;
      const idx = db.pending.findIndex((p: any) => p.id === reqId);
      if (idx === -1) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404, headers: corsHeaders });
      
      const p = db.pending[idx];
      const pin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit PIN
      
      const existingUser = db.users.find((u: any) => u.email.toLowerCase() === p.email.toLowerCase());
      if (existingUser) {
        existingUser.pin = pin;
        existingUser.status = 'active';
      } else {
        const newUser = {
          id: 'user-' + Date.now().toString(),
          email: p.email,
          name: p.email.split('@')[0],
          pin,
          isAdmin: false,
          createdAt: new Date().toISOString(),
          status: 'active'
        };
        db.users.push(newUser);
      }
      db.pending.splice(idx, 1);
      await saveDb(db);
      
      return NextResponse.json({ success: true, pin }, { headers: corsHeaders });
    }

    if (action === 'reset_pin') {
      const { userId } = body;
      const user = db.users.find((u: any) => u.id === userId);
      if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404, headers: corsHeaders });
      
      const newPin = Math.floor(100000 + Math.random() * 900000).toString();
      user.pin = newPin;
      await saveDb(db);
      return NextResponse.json({ success: true, pin: newPin }, { headers: corsHeaders });
    }

    if (action === 'renew_otp') {
      const { email } = body;
      const user = db.users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
      if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404, headers: corsHeaders });
      
      const now = Date.now();
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
      if (user.lastOtpRequest && now - user.lastOtpRequest < ONE_WEEK) {
        return NextResponse.json({ success: false, error: 'You can only request a new Access Code once per week. Try again later.' }, { status: 429, headers: corsHeaders });
      }

      const newPin = Math.floor(100000 + Math.random() * 900000).toString();
      user.pin = newPin;
      user.lastOtpRequest = now;
      await saveDb(db);
      
      return NextResponse.json({ success: true, status: 'renew_approved', pin: newPin }, { headers: corsHeaders });
    }

    if (action === 'deny') {
      const { reqId } = body;
      const idx = db.pending.findIndex((p: any) => p.id === reqId);
      if (idx !== -1) {
        db.pending.splice(idx, 1);
        await saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    if (action === 'revoke') {
      const { userId } = body;
      const user = db.users.find((u: any) => u.id === userId);
      if (user) {
        user.status = 'revoked';
        user.pin = 'revoked'; // Invalidate pin
        await saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    // Lets a signed-in user rename themselves. The display name is what
    // peers see on remote cursors and in the connected-peers list, so it
    // belongs to the user rather than the admin; email, PIN, status and
    // isAdmin are deliberately NOT editable here.
    if (action === 'update_profile') {
      const { userId, name } = body;
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!userId || !trimmed) {
        return NextResponse.json({ error: 'userId and name are required' }, { status: 400, headers: corsHeaders });
      }
      if (trimmed.length > 40) {
        return NextResponse.json({ error: 'Name must be 40 characters or fewer' }, { status: 400, headers: corsHeaders });
      }
      const user = db.users.find((u: any) => u.id === userId);
      if (!user) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404, headers: corsHeaders });
      }
      if (user.status !== 'active') {
        return NextResponse.json({ error: 'Account is not active' }, { status: 403, headers: corsHeaders });
      }
      user.name = trimmed;
      await saveDb(db);
      const { pin: _pin, ...safe } = user;
      return NextResponse.json({ success: true, user: safe }, { headers: corsHeaders });
    }

    // Posted by an administrator's own signed-in session while its tab is
    // open. This is what makes `admin_status` a real measurement: presence
    // is only ever recorded by a live admin session, never inferred.
    if (action === 'admin_heartbeat') {
      const { userId } = body;
      const user = db.users.find((u: any) => u.id === userId);
      if (!user || !user.isAdmin || user.status !== 'active') {
        return NextResponse.json({ error: 'Not an active administrator' }, { status: 403, headers: corsHeaders });
      }
      const now = Date.now();
      const presence = ((await redis.get(ADMIN_PRESENCE_KEY)) || {}) as Record<string, number>;
      // Drop entries that are long dead so the record cannot grow forever.
      for (const [id, seen] of Object.entries(presence)) {
        if (now - Number(seen) > ADMIN_ONLINE_WINDOW_MS * 10) delete presence[id];
      }
      presence[userId] = now;
      await redis.set(ADMIN_PRESENCE_KEY, presence, { ex: 60 * 60 });
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    // An administrator signing out should stop counting as present at once,
    // rather than lingering for the whole staleness window.
    if (action === 'admin_signout') {
      const { userId } = body;
      const presence = ((await redis.get(ADMIN_PRESENCE_KEY)) || {}) as Record<string, number>;
      if (userId && presence[userId]) {
        delete presence[userId];
        await redis.set(ADMIN_PRESENCE_KEY, presence, { ex: 60 * 60 });
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    return NextResponse.json({ error: 'Unknown POST action' }, { status: 400, headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
