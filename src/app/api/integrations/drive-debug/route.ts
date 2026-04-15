import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folder');

  if (!folderId) {
    return NextResponse.json({ error: 'Pass ?folder=FOLDER_ID' }, { status: 400 });
  }

  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }

  // Get access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) {
    return NextResponse.json({ error: 'Token refresh failed', details: tokenData }, { status: 500 });
  }

  const headers = { 'Authorization': `Bearer ${tokenData.access_token}` };

  // List direct children of the folder
  const directResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=50`,
    { headers }
  );
  const directData = await directResp.json();

  // For each subfolder, list its children too
  const subfolders = (directData.files || []).filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');
  const subfolderContents: Record<string, any[]> = {};

  for (const sf of subfolders.slice(0, 10)) {
    const subResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${sf.id}' in parents and trashed = false`)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=20`,
      { headers }
    );
    const subData = await subResp.json();
    subfolderContents[sf.name] = (subData.files || []).map((f: any) => ({
      name: f.name,
      type: f.mimeType,
      modified: f.modifiedTime,
    }));
  }

  return NextResponse.json({
    folderId,
    directChildren: (directData.files || []).map((f: any) => ({
      name: f.name,
      type: f.mimeType,
      modified: f.modifiedTime,
    })),
    subfolderContents,
  });
}
