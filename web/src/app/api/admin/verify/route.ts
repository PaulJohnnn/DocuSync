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
    const { nodeId } = body;
    
    if (!nodeId) {
      return NextResponse.json({ error: 'nodeId is required' }, { status: 400, headers: corsHeaders });
    }

    // In a real app, this would update a database record to set `verified = true`.
    // For the thesis, we just return a success response to satisfy the AdminRole flow.
    return NextResponse.json({ success: true, message: `Account ${nodeId} verified` }, { status: 200, headers: corsHeaders });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
