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
    return NextResponse.json({ users: db.users, pending: db.pending }, { headers: corsHeaders });
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

    if (action === 'cancel_request') {
      const { email } = body;
      const idx = db.pending.findIndex((p: any) => p.email.toLowerCase() === email.toLowerCase());
      if (idx !== -1) {
        db.pending.splice(idx, 1);
        saveDb(db);
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
      saveDb(db);
      
      return NextResponse.json({ success: true, pin }, { headers: corsHeaders });
    }

    if (action === 'reset_pin') {
      const { userId } = body;
      const user = db.users.find((u: any) => u.id === userId);
      if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404, headers: corsHeaders });
      
      const newPin = Math.floor(100000 + Math.random() * 900000).toString();
      user.pin = newPin;
      saveDb(db);
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
      saveDb(db);
      
      return NextResponse.json({ success: true, status: 'renew_approved', pin: newPin }, { headers: corsHeaders });
    }

    if (action === 'deny') {
      const { reqId } = body;
      const idx = db.pending.findIndex((p: any) => p.id === reqId);
      if (idx !== -1) {
        db.pending.splice(idx, 1);
        saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    if (action === 'revoke') {
      const { userId } = body;
      const user = db.users.find((u: any) => u.id === userId);
      if (user) {
        user.status = 'revoked';
        user.pin = 'revoked'; // Invalidate pin
        saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    return NextResponse.json({ error: 'Unknown POST action' }, { status: 400, headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
