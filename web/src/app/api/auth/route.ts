import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(process.cwd(), 'mock-db.json');

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

function getDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialDb = { users: DEFAULT_USERS, pending: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
      return initialDb;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read mock DB', err);
    return { users: DEFAULT_USERS, pending: [] };
  }
}

function saveDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save mock DB', err);
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

  const db = getDb();

  if (action === 'sync') {
    return NextResponse.json({ users: db.users, pending: db.pending }, { headers: corsHeaders });
  }

  return NextResponse.json({ error: 'Unknown GET action' }, { status: 400, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;
    const db = getDb();

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
      const { email } = body;
      const isAlreadyUser = db.users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());
      if (isAlreadyUser) {
        return NextResponse.json({ success: false, error: 'Already registered.' }, { status: 400, headers: corsHeaders });
      }
      const isPending = db.pending.some((p: any) => p.email.toLowerCase() === email.toLowerCase());
      if (!isPending) {
        db.pending.push({
          id: 'req-' + Date.now().toString(),
          email,
          requestedAt: new Date().toISOString(),
        });
        saveDb(db);
      }
      return NextResponse.json({ success: true, status: 'verified' }, { headers: corsHeaders });
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
      db.pending.splice(idx, 1);
      saveDb(db);
      
      return NextResponse.json({ success: true, pin }, { headers: corsHeaders });
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
      const idx = db.users.findIndex((u: any) => u.id === userId);
      if (idx !== -1) {
        db.users.splice(idx, 1);
        saveDb(db);
      }
      return NextResponse.json({ success: true }, { headers: corsHeaders });
    }

    return NextResponse.json({ error: 'Unknown POST action' }, { status: 400, headers: corsHeaders });

  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
