import { NextResponse } from 'next/server';
import { getCompletedTasksForContact } from '@/lib/wealthbox';

// === Wealthbox ===
const WEALTHBOX_API_KEY = process.env.WEALTHBOX_API_KEY || process.env.NEXT_PUBLIC_WEALTHBOX_API_KEY;
const WEALTHBOX_API_URL = process.env.WEALTHBOX_API_URL || 'https://api.crmworkspace.com/v1';

async function wealthboxFetch(endpoint: string) {
  const url = `${WEALTHBOX_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: { 'ACCESS_TOKEN': WEALTHBOX_API_KEY || '', 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`Wealthbox API error: ${response.status}`);
  return response.json();
}

async function getOpenTasksForContact(contactId: string) {
  try {
    const data: { tasks?: Array<{ id: string; name: string; description?: string; due_date?: string; completed: boolean }> } =
      await wealthboxFetch(`/tasks?resource_id=${contactId}&resource_type=Contact&completed=false&per_page=50`);
    return data.tasks || [];
  } catch { return []; }
}

// === Slack ===
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function getSlackChannelMessages(channelId: string, sinceTs: number): Promise<Array<{ author: string; text: string; ts: string }>> {
  if (!SLACK_BOT_TOKEN || !channelId) return [];
  try {
    const oldest = Math.floor(sinceTs / 1000).toString();
    const response = await fetch(`https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oldest}&limit=30`, {
      headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!data.ok) {
      console.error('Slack API error:', data.error);
      return [];
    }
    // Resolve user names for the messages
    const userIds = Array.from(new Set((data.messages || []).map((m: { user?: string }) => m.user).filter(Boolean)));
    const userNames: Record<string, string> = {};
    for (const uid of userIds as string[]) {
      try {
        const userResp = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
          headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        });
        const userData = await userResp.json();
        if (userData.ok) {
          userNames[uid] = userData.user?.real_name || userData.user?.name || uid;
        }
      } catch { userNames[uid as string] = uid as string; }
    }

    return (data.messages || [])
      .filter((m: { subtype?: string }) => !m.subtype) // skip join/leave/etc
      .map((m: { user?: string; text?: string; ts?: string }) => ({
        author: userNames[m.user || ''] || m.user || 'Unknown',
        text: (m.text || '').slice(0, 500),
        ts: new Date(Number(m.ts) * 1000).toISOString(),
      }))
      .reverse() // chronological order
      .slice(-20); // last 20 messages
  } catch (error) {
    console.error('Slack fetch error:', error);
    return [];
  }
}

// === Gmail ===
const GMAIL_ACCESS_TOKEN = process.env.GMAIL_ACCESS_TOKEN;

async function getGmailThreads(query: string, maxResults = 10): Promise<Array<{ subject: string; from: string; snippet: string; date: string }>> {
  if (!GMAIL_ACCESS_TOKEN || !query) return [];
  try {
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const response = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${GMAIL_ACCESS_TOKEN}` },
    });
    const data = await response.json();
    if (!data.messages) return [];

    const threads: Array<{ subject: string; from: string; snippet: string; date: string }> = [];
    for (const msg of data.messages.slice(0, maxResults)) {
      try {
        const msgResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { 'Authorization': `Bearer ${GMAIL_ACCESS_TOKEN}` },
        });
        const msgData = await msgResp.json();
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value || '(no subject)';
        const from = headers.find((h: { name: string }) => h.name === 'From')?.value || '';
        const date = headers.find((h: { name: string }) => h.name === 'Date')?.value || '';
        threads.push({ subject, from, snippet: (msgData.snippet || '').slice(0, 200), date });
      } catch { /* skip individual message errors */ }
    }
    return threads;
  } catch (error) {
    console.error('Gmail fetch error:', error);
    return [];
  }
}

// === Main handler ===
export async function POST(request: Request) {
  try {
    const { clientId, wealthboxId, lastCheckinDate, slackChannelId, clientName, gmailQuery } = await request.json();

    const sinceDate = lastCheckinDate ? new Date(lastCheckinDate) : new Date(Date.now() - 90 * 86400000);
    const sinceTs = sinceDate.getTime();

    // Fetch all sources in parallel
    const [completedTasks, openTasks, slackMessages, emailThreads] = await Promise.all([
      wealthboxId ? getCompletedTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getOpenTasksForContact(wealthboxId) : Promise.resolve([]),
      getSlackChannelMessages(slackChannelId || '', sinceTs),
      getGmailThreads(gmailQuery || clientName || '', 10),
    ]);

    // Process Wealthbox achievements
    const achievementsSinceLastCheckin = completedTasks
      .filter(t => t.completed_at && new Date(t.completed_at) >= sinceDate)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
      .slice(0, 20)
      .map(t => ({ name: t.name, completedAt: t.completed_at!, description: t.description }));

    // Process open tasks into priorities vs outstanding
    const now = new Date();
    const currentPriorities = openTasks
      .filter(t => !t.due_date || new Date(t.due_date) >= now)
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .slice(0, 15)
      .map(t => ({ name: t.name, dueDate: t.due_date, description: t.description }));

    const outstandingItems = openTasks
      .filter(t => t.due_date && new Date(t.due_date) < now)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .map(t => ({ name: t.name, dueDate: t.due_date, description: t.description }));

    return NextResponse.json({
      success: true,
      summary: {
        clientId,
        achievementsSinceLastCheckin,
        currentPriorities,
        outstandingItems,
        slackMessages,
        emailThreads,
        lastCheckinDate: lastCheckinDate || null,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Exec summary error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate exec summary' },
      { status: 500 }
    );
  }
}
