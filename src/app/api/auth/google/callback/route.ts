import { NextResponse } from 'next/server';

// Step 2: Exchange auth code for tokens
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return new NextResponse(`<html><body><h2>Auth failed</h2><p>${error}</p></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return new NextResponse('<html><body><h2>Missing auth code</h2></body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new NextResponse('<html><body><h2>Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET</h2></body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ffo-health.vercel.app';
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResp.json();

    if (tokens.error) {
      return new NextResponse(`<html><body><h2>Token exchange failed</h2><pre>${JSON.stringify(tokens, null, 2)}</pre></body></html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new NextResponse(`
      <html>
      <body style="font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px;">
        <h2 style="color: #166534;">Google Drive connected!</h2>
        <p>Add this to your <code>.env.local</code> (or Vercel environment variables):</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; word-break: break-all;">
          <code>GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || 'NOT RETURNED — try again with prompt=consent'}</code>
        </div>
        <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">
          You only need to do this once. The refresh token doesn't expire unless you revoke access.
          After adding it, redeploy your app.
        </p>
        <details style="margin-top: 16px;">
          <summary style="cursor: pointer; color: #6b7280; font-size: 12px;">Full token response</summary>
          <pre style="font-size: 11px; background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto;">${JSON.stringify(tokens, null, 2)}</pre>
        </details>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    return new NextResponse(`<html><body><h2>Error</h2><pre>${err}</pre></body></html>`, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
