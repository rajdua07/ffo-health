import { NextResponse } from 'next/server';

const KEY = 'ffo:app-data';

// Support both KV_REST_API_* (Vercel KV / Upstash integration) and UPSTASH_REDIS_REST_*
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

// GET: fetch the current app data blob
export async function GET() {
  if (!kvAvailable()) {
    return NextResponse.json({ success: false, error: 'Storage not configured', kvConfigured: false });
  }
  try {
    const raw = await redisCmd('GET', KEY);
    if (!raw) {
      return NextResponse.json({ success: true, data: null });
    }
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 });
  }
}

// POST: overwrite the app data blob
export async function POST(request: Request) {
  if (!kvAvailable()) {
    return NextResponse.json({ success: false, error: 'Storage not configured' }, { status: 500 });
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
    }
    await redisCmd('SET', KEY, JSON.stringify(body));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }
}
