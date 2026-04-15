import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCompletedTasksForContact, getOpenTasksForContact, getEventsForContact, getNotesForContact, loadWealthboxUsers, resolveUserName } from '@/lib/wealthbox';
import { readFileSync } from 'fs';
import { join } from 'path';

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const slackHeaders = () => ({ 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' });

// Load scoring criteria from markdown file
function loadScoringCriteria(): string {
  try {
    return readFileSync(join(process.cwd(), 'scoring-criteria.md'), 'utf-8');
  } catch {
    return 'Use standard 1-10 scoring for each metric based on available evidence.';
  }
}

async function getSlackMessages(channelId: string): Promise<Array<{ author: string; text: string; ts: string }>> {
  if (!SLACK_BOT_TOKEN || !channelId) return [];
  try {
    const oneMonthAgo = Math.floor((Date.now() - 30 * 86400000) / 1000).toString();
    const resp = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oneMonthAgo}&limit=50`, { headers: slackHeaders() });
    const data = await resp.json();
    if (!data.ok) return [];
    return (data.messages || [])
      .filter((m: any) => !m.subtype)
      .map((m: any) => ({
        author: m.user || 'Unknown',
        text: (m.text || '').slice(0, 300),
        ts: new Date(Number(m.ts) * 1000).toISOString(),
      }));
  } catch { return []; }
}

async function getGoogleDriveTranscripts(folderId: string): Promise<Array<{ name: string; content: string; date: string }>> {
  // Support both OAuth2 refresh token and service account
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!folderId) return [];
  if (!refreshToken && !serviceAccountKey) return [];

  try {
    let accessToken = '';

    if (refreshToken && clientId && clientSecret) {
      // OAuth2 refresh token flow (preferred)
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
      if (!tokenData.access_token) return [];
      accessToken = tokenData.access_token;
    } else if (serviceAccountKey) {
      // Service account fallback
      const sa = JSON.parse(serviceAccountKey);
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })).toString('base64url');
      const crypto = await import('crypto');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(`${header}.${payload}`);
      const signature = sign.sign(sa.private_key, 'base64url');
      const jwt = `${header}.${payload}.${signature}`;
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      });
      const tokenData = await tokenResp.json();
      if (!tokenData.access_token) return [];
      accessToken = tokenData.access_token;
    }

    const driveHeaders = { 'Authorization': `Bearer ${accessToken}` };

    // List recent files in the folder (last 30 days, text/doc files)
    const oneMonthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const query = `'${folderId}' in parents and modifiedTime > '${oneMonthAgo}' and trashed = false`;
    const listResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`,
      { headers: driveHeaders }
    );
    const listData = await listResp.json();

    const transcripts: Array<{ name: string; content: string; date: string }> = [];

    for (const file of (listData.files || []).slice(0, 5)) {
      try {
        let content = '';
        if (file.mimeType === 'application/vnd.google-apps.document') {
          // Export Google Doc as plain text
          const exportResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
            { headers: driveHeaders }
          );
          content = await exportResp.text();
        } else if (file.mimeType?.startsWith('text/') || file.mimeType === 'application/pdf') {
          // Download text files directly
          const dlResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
            { headers: driveHeaders }
          );
          content = await dlResp.text();
        }

        if (content) {
          transcripts.push({
            name: file.name,
            content: content.slice(0, 3000), // cap per transcript
            date: file.modifiedTime,
          });
        }
      } catch { /* skip individual file errors */ }
    }

    return transcripts;
  } catch (err) {
    console.error('Google Drive error:', err);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { clientName, wealthboxId, slackChannelId, googleDriveFolderId, wows } = await request.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // Fetch all data sources in parallel
    const [completedTasks, openTasks, events, notes, slackMessages, transcripts] = await Promise.all([
      wealthboxId ? (loadWealthboxUsers().then(() => getCompletedTasksForContact(wealthboxId))) : Promise.resolve([]),
      wealthboxId ? getOpenTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getEventsForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getNotesForContact(wealthboxId) : Promise.resolve([]),
      getSlackMessages(slackChannelId || ''),
      getGoogleDriveTranscripts(googleDriveFolderId || ''),
    ]);

    // Build data context
    const completedList = completedTasks.slice(0, 30).map((t: any) =>
      `- ${t.name} — completed by ${resolveUserName(t.completer)} on ${new Date(t.due_date || t.updated_at || t.created_at || '').toLocaleDateString()}${t.description ? '\n  ' + t.description.slice(0, 200) : ''}`
    ).join('\n') || 'None';

    const openList = openTasks.map((t: any) =>
      `- ${t.name} — assigned to ${resolveUserName(t.assigned_to)}${t.due_date ? ', due ' + new Date(t.due_date).toLocaleDateString() : ''}${t.description ? '\n  ' + t.description.slice(0, 200) : ''}`
    ).join('\n') || 'None';

    const eventsList = events.slice(0, 15).map((e: any) =>
      `- ${e.title} (${e.starts_at ? new Date(e.starts_at).toLocaleDateString() : 'no date'})${e.description ? ': ' + e.description.slice(0, 150) : ''}`
    ).join('\n') || 'None';

    const notesList = notes.slice(0, 15).map((n: any) =>
      `- ${new Date(n.created_at).toLocaleDateString()}: ${n.content.slice(0, 200)}`
    ).join('\n') || 'None';

    const slackList = slackMessages.slice(0, 30).map(m =>
      `- ${m.author} (${new Date(m.ts).toLocaleDateString()}): ${m.text}`
    ).join('\n') || 'No Slack data';

    const transcriptList = transcripts.map(t =>
      `--- ${t.name} (${new Date(t.date).toLocaleDateString()}) ---\n${t.content}`
    ).join('\n\n') || 'No call transcripts available';

    const wowList = (wows || []).map((w: any) =>
      `- ${w.date}: ${w.description} (Type: ${w.type}, Owner: ${w.owner})${w.reaction ? ' — Client reaction: ' + w.reaction : ''}`
    ).join('\n') || 'None';

    const scoringCriteria = loadScoringCriteria();

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an objective client health scorer for a fractional family office. Score the following client across 16 metrics on a 1-10 scale based on the available data.

## Scoring Criteria
${scoringCriteria}

## Client Data for: ${clientName}

### Completed Tasks (${completedTasks.length})
${completedList}

### Open / Outstanding Tasks (${openTasks.length})
${openList}

### Meetings & Events (${events.length})
${eventsList}

### CRM Notes (${notes.length})
${notesList}

### Slack Channel Activity (${slackMessages.length} messages)
${slackList}

### Recent Call Transcripts (${transcripts.length})
${transcriptList}

### Wow Moments (${(wows || []).length})
${wowList}

## Instructions

Based on ALL the data above, provide scores for each of the 16 metrics. You MUST respond with ONLY a valid JSON object in this exact format — no other text, no markdown code fences:

{
  "scores": [<meeting_attendance>, <response_time>, <communication_quality>, <project_velocity>, <milestone_achievement>, <direct_feedback>, <nps_score>, <complaint_frequency>, <strategy_implementation>, <results_achieved>, <payment_status>, <trust_level>, <partnership_quality>, <referral_willingness>, <referral_activity>, <network_advocacy>],
  "observations": "<2-3 sentence summary of key observations that drove the scores>",
  "actionItems": "<1-2 specific action items based on the scoring>"
}

Each score must be an integer from 1 to 10. Score conservatively — use 5 when data is insufficient. Reference specific evidence in observations.`
      }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) {
      return NextResponse.json({ success: false, error: 'No response from AI' }, { status: 500 });
    }

    // Parse the JSON response
    const jsonStr = textBlock.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    // Validate scores array
    if (!Array.isArray(result.scores) || result.scores.length !== 16) {
      return NextResponse.json({ success: false, error: 'AI returned invalid scores format' }, { status: 500 });
    }

    // Clamp all scores to 1-10
    result.scores = result.scores.map((s: number) => Math.max(1, Math.min(10, Math.round(s))));

    return NextResponse.json({
      success: true,
      scores: result.scores,
      observations: result.observations || '',
      actionItems: result.actionItems || '',
      dataSources: {
        completedTasks: completedTasks.length,
        openTasks: openTasks.length,
        events: events.length,
        notes: notes.length,
        slackMessages: slackMessages.length,
        transcripts: transcripts.length,
      },
    });
  } catch (error) {
    console.error('AI Score error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate AI score' },
      { status: 500 }
    );
  }
}
