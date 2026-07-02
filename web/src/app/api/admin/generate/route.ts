import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const displayName = body.displayName || 'User';

    const nodeId = `${displayName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Math.random().toString(36).substring(2, 8)}`;
    const tempPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit PIN

    return NextResponse.json({ 
      success: true, 
      nodeId, 
      tempPin,
      message: `Account generated for ${displayName}` 
    }, { status: 201, headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
