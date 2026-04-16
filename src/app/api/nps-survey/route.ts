import { NextResponse } from 'next/server';

const KV_PREFIX = 'nps_response:';
const KV_INDEX = 'nps_pending_ids';

// Support both KV_REST_API_* (Vercel KV) and UPSTASH_REDIS_REST_* (Upstash direct)
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function kvAvailable(): boolean {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function redisCmd(...args: (string | number)[]): Promise<any> {
  if (!kvAvailable()) return null;
  try {
    const resp = await fetch(REDIS_URL!, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const data = await resp.json();
    return data.result ?? data;
  } catch (err) {
    console.error('Redis error:', err);
    return null;
  }
}

// GET: Validate a survey token OR fetch pending responses
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action');

  // Fetch pending NPS responses (called by the app)
  if (action === 'pending') {
    if (!kvAvailable()) {
      return NextResponse.json({ success: true, responses: [], kvConfigured: false });
    }
    try {
      const ids: string[] = (await redisCmd('LRANGE', KV_INDEX, 0, -1)) || [];
      if (ids.length === 0) return NextResponse.json({ success: true, responses: [], kvConfigured: true });

      const responses = [];
      for (const id of ids) {
        const raw = await redisCmd('GET', `${KV_PREFIX}${id}`);
        if (raw) {
          try { responses.push(typeof raw === 'string' ? JSON.parse(raw) : raw); }
          catch { /* skip malformed */ }
        }
      }
      return NextResponse.json({ success: true, responses, kvConfigured: true });
    } catch (err) {
      console.error('Failed to fetch pending NPS:', err);
      return NextResponse.json({ success: true, responses: [], error: String(err) });
    }
  }

  // Claim (delete) pending responses after import
  if (action === 'claim') {
    if (!kvAvailable()) return NextResponse.json({ success: true });
    try {
      const ids: string[] = (await redisCmd('LRANGE', KV_INDEX, 0, -1)) || [];
      for (const id of ids) {
        await redisCmd('DEL', `${KV_PREFIX}${id}`);
      }
      await redisCmd('DEL', KV_INDEX);
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

    if (kvAvailable()) {
      // Store in Redis with 30-day TTL (2592000 seconds)
      await redisCmd('SET', `${KV_PREFIX}${response.id}`, JSON.stringify(response), 'EX', 2592000);
      await redisCmd('RPUSH', KV_INDEX, response.id);
    } else {
      // No storage configured — return error so the survey page knows
      console.error('No Redis configured — survey response was not stored:', response);
      return NextResponse.json({
        success: false,
        error: 'Survey storage not configured. Please contact your administrator.',
      }, { status: 500 });
    }

    // Also send a Slack notification if webhook is configured
    const slackWebhook = process.env.SLACK_NPS_WEBHOOK;
    if (slackWebhook) {
      try {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `New NPS response: ${response.npsScore}/10${response.comment ? ` — "${response.comment}"` : ''}`,
          }),
        });
      } catch { /* ignore */ }
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
