import { NextResponse } from 'next/server';

// In-memory store for NPS responses (in production, use Vercel KV or a database)
// For now, responses are returned to the client app which stores them in localStorage
const pendingResponses: Array<{
  id: string;
  clientId: string;
  npsScore: number;
  comment: string;
  submittedAt: string;
}> = [];

// GET: Validate a survey token and return client info
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  if (action === 'pending') {
    // Return all pending responses (called by the app to fetch new submissions)
    return NextResponse.json({ success: true, responses: [...pendingResponses] });
  }

  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
  }

  // Decode token: base64(clientId:clientName:timestamp)
  try {
    // Decode base64url token (handle both standard and url-safe base64)
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    const clientId = parts[0];
    const clientName = parts[1];
    if (!clientId || !clientName) throw new Error('Invalid token');

    return NextResponse.json({
      success: true,
      clientId,
      clientName: decodeURIComponent(clientName),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid or expired survey link' }, { status: 400 });
  }
}

// POST: Submit an NPS response
export async function POST(request: Request) {
  try {
    const { token, npsScore, comment } = await request.json();

    if (!token || npsScore == null) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (npsScore < 0 || npsScore > 10) {
      return NextResponse.json({ success: false, error: 'NPS score must be between 0 and 10' }, { status: 400 });
    }

    // Decode token
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const [clientId] = decoded.split(':');
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 400 });
    }

    const response = {
      id: `nps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      npsScore: Number(npsScore),
      comment: (comment || '').slice(0, 1000),
      submittedAt: new Date().toISOString(),
    };

    pendingResponses.push(response);

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to submit response' },
      { status: 500 }
    );
  }
}
