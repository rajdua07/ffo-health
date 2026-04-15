import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const KV_PREFIX = 'nps_response:';
const KV_INDEX = 'nps_pending_ids';

async function kvAvailable(): Promise<boolean> {
  try {
    await kv.ping();
    return true;
  } catch { return false; }
}

// GET: Validate a survey token OR fetch pending responses
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  // Fetch pending NPS responses (called by the app)
  if (action === 'pending') {
    if (!await kvAvailable()) {
      return NextResponse.json({ success: true, responses: [], kvConfigured: false });
    }
    try {
      const ids: string[] = await kv.lrange(KV_INDEX, 0, -1) || [];
      if (ids.length === 0) return NextResponse.json({ success: true, responses: [] });

      const responses = [];
      for (const id of ids) {
        const data = await kv.get(`${KV_PREFIX}${id}`);
        if (data) responses.push(data);
      }
      return NextResponse.json({ success: true, responses });
    } catch (err) {
      console.error('Failed to fetch pending NPS:', err);
      return NextResponse.json({ success: true, responses: [] });
    }
  }

  // Claim (delete) pending responses after import
  if (action === 'claim') {
    if (!await kvAvailable()) {
      return NextResponse.json({ success: true });
    }
    try {
      const ids: string[] = await kv.lrange(KV_INDEX, 0, -1) || [];
      for (const id of ids) {
        await kv.del(`${KV_PREFIX}${id}`);
      }
      await kv.del(KV_INDEX);
      return NextResponse.json({ success: true, claimed: ids.length });
    } catch {
      return NextResponse.json({ success: true });
    }
  }

  // Validate survey token
  if (!token) {
    return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
  }

  try {
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
      source: 'Survey',
      submittedAt: new Date().toISOString(),
    };

    if (await kvAvailable()) {
      // Store in Vercel KV with 30-day TTL
      await kv.set(`${KV_PREFIX}${response.id}`, response, { ex: 30 * 86400 });
      await kv.rpush(KV_INDEX, response.id);
    }

    return NextResponse.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('NPS submit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit response' },
      { status: 500 }
    );
  }
}
