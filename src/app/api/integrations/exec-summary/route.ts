import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCompletedTasksForContact, getOpenTasksForContact, getEventsForContact, getNotesForContact, loadWealthboxUsers, resolveUserName } from '@/lib/wealthbox';

// === Slack ===
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

const slackHeaders = () => ({ 'Authorization': `Bearer ${SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' });
const slackUserCache: Record<string, string> = {};

async function resolveSlackUser(uid: string): Promise<string> {
  if (slackUserCache[uid]) return slackUserCache[uid];
  try {
    const resp = await fetch(`https://slack.com/api/users.info?user=${uid}`, { headers: slackHeaders() });
    const data = await resp.json();
    const name = data.ok ? (data.user?.real_name || data.user?.name || uid) : uid;
    slackUserCache[uid] = name;
    return name;
  } catch { slackUserCache[uid] = uid; return uid; }
}

async function getSlackChannelMessages(channelId: string, _sinceTs?: number): Promise<Array<{ author: string; text: string; ts: string }>> {
  if (!SLACK_BOT_TOKEN || !channelId) return [];
  try {
    // Always cap at 1 month ago from now, regardless of lastCheckinDate
    const oneMonthAgo = Math.floor((Date.now() - 30 * 86400000) / 1000).toString();

    // Fetch up to 100 top-level messages from the last month
    const allTopLevel: Array<any> = [];
    let cursor: string | undefined;
    let fetched = 0;
    const TARGET = 100;

    while (fetched < TARGET) {
      const url = new URL('https://slack.com/api/conversations.history');
      url.searchParams.set('channel', channelId);
      url.searchParams.set('oldest', oneMonthAgo);
      url.searchParams.set('limit', String(Math.min(TARGET - fetched, 100)));
      if (cursor) url.searchParams.set('cursor', cursor);

      const resp = await fetch(url.toString(), { headers: slackHeaders() });
      const data = await resp.json();
      if (!data.ok) break;

      const msgs = data.messages || [];
      allTopLevel.push(...msgs);
      fetched += msgs.length;

      cursor = data.response_metadata?.next_cursor;
      if (!cursor || msgs.length === 0) break;
    }

    const allMessages: Array<{ user?: string; text?: string; ts?: string; thread_ts?: string; reply_count?: number }> = [];

    // For each message, check if it has a thread and fetch replies
    for (const msg of allTopLevel) {
      allMessages.push(msg);

      if (msg.reply_count && msg.reply_count > 0 && msg.thread_ts) {
        try {
          const threadResp = await fetch(
            `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${msg.thread_ts}&oldest=${oneMonthAgo}&limit=50`,
            { headers: slackHeaders() }
          );
          const threadData = await threadResp.json();
          if (threadData.ok) {
            // Skip the parent (first message) since we already have it
            const replies = (threadData.messages || []).slice(1);
            allMessages.push(...replies);
          }
        } catch { /* skip thread fetch errors */ }
      }
    }

    // Resolve all unique user IDs
    const userIds = Array.from(new Set(allMessages.map(m => m.user).filter(Boolean))) as string[];
    await Promise.all(userIds.map(uid => resolveSlackUser(uid)));

    // Deduplicate by ts, filter system messages, sort chronologically
    const seen = new Set<string>();
    return allMessages
      .filter((m: any) => {
        if (m.subtype) return false;
        const key = m.ts || '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(a.ts) - Number(b.ts))
      .map(m => ({
        author: slackUserCache[m.user || ''] || m.user || 'Unknown',
        text: (m.text || '').slice(0, 1000),
        ts: new Date(Number(m.ts) * 1000).toISOString(),
      }));
  } catch { return []; }
}

// === AI Narrative Generation ===
async function generateNarrative(
  clientName: string,
  completedTasks: Array<{ name: string; completedAt: string; description?: string }>,
  currentPriorities: Array<{ name: string; dueDate?: string; description?: string }>,
  outstandingItems: Array<{ name: string; dueDate?: string; description?: string }>,
  emailThreads: Array<{ subject: string; from: string; snippet: string; date: string }>,
  slackMessages: Array<{ author: string; text: string; ts: string }>,
  lastCheckinDate: string | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFallbackNarrative(clientName, completedTasks, currentPriorities, outstandingItems, emailThreads, slackMessages);
  }

  const anthropic = new Anthropic({ apiKey });

  const context = `
CLIENT: ${clientName}
LAST CHECK-IN: ${lastCheckinDate ? new Date(lastCheckinDate).toLocaleDateString() : 'Unknown'}
TODAY: ${new Date().toLocaleDateString()}

--- RECENTLY COMPLETED TASKS (${completedTasks.length}) ---
${completedTasks.length === 0 ? 'None' : completedTasks.map((t: any) => `- ${t.name} — completed by ${t.completedBy || 'team'} on ${new Date(t.completedAt).toLocaleDateString()}${t.description ? '\n  Context: ' + t.description.slice(0, 500) : ''}`).join('\n')}

--- OPEN TASKS / CURRENT PRIORITIES (${currentPriorities.length}) ---
${currentPriorities.length === 0 ? 'None' : currentPriorities.map((t: any) => `- ${t.name} — assigned to ${t.assignedTo || 'unassigned'}${t.dueDate ? ', due ' + new Date(t.dueDate).toLocaleDateString() : ''}${t.description ? '\n  Context: ' + t.description.slice(0, 500) : ''}`).join('\n')}

--- OVERDUE ITEMS (${outstandingItems.length}) ---
${outstandingItems.length === 0 ? 'None' : outstandingItems.map((t: any) => `- ${t.name} — assigned to ${t.assignedTo || 'unassigned'}, was due ${new Date(t.dueDate!).toLocaleDateString()}${t.description ? '\n  Context: ' + t.description.slice(0, 500) : ''}`).join('\n')}

--- MEETINGS & EVENTS (${emailThreads.filter(e => e.subject !== 'Note').length}) ---
${emailThreads.filter(e => e.subject !== 'Note').length === 0 ? 'None' : emailThreads.filter(e => e.subject !== 'Note').map(e => `- ${e.subject} (${new Date(e.date).toLocaleDateString()})${e.snippet ? ': ' + e.snippet.slice(0, 500) : ''}`).join('\n')}

--- CRM NOTES (${emailThreads.filter(e => e.subject === 'Note').length}) ---
${emailThreads.filter(e => e.subject === 'Note').length === 0 ? 'None' : emailThreads.filter(e => e.subject === 'Note').map(e => `- ${new Date(e.date).toLocaleDateString()}: ${e.snippet.slice(0, 1000)}`).join('\n')}

--- SLACK CHANNEL ACTIVITY (${slackMessages.length}) ---
${slackMessages.length === 0 ? 'No Slack channel connected' : slackMessages.map(m => `- ${m.author} (${new Date(m.ts).toLocaleDateString()}): ${m.text}`).join('\n')}
`.trim();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an executive assistant to a lead financial advisor at a fractional family office. Based on the following client data, write a concise executive briefing for the advisor before their next check-in with this client.

The briefing should:
1. Start with a 1-2 sentence overall status ("where the client is at")
2. Highlight what's been accomplished since the last check-in
3. List EVERY open task and overdue item by name — specify who it's assigned to and when it's due. This is critical: do not summarize or skip any open/overdue tasks.
4. Call out what balls are in whose court — what the team owes the client, and what the client owes the team
5. Flag any overdue items or risks with urgency
6. Suggest 1-2 talking points for the next meeting

Keep it under 350 words. Use plain language, no jargon. Be direct and actionable. Use bullet points for clarity. Do not use markdown headers.

${context}`
    }],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  return textBlock?.text || buildFallbackNarrative(clientName, completedTasks, currentPriorities, outstandingItems, emailThreads, slackMessages);
}

function buildFallbackNarrative(
  clientName: string,
  completedTasks: Array<{ name: string; completedAt: string }>,
  currentPriorities: Array<{ name: string; dueDate?: string }>,
  outstandingItems: Array<{ name: string; dueDate?: string }>,
  emailThreads: Array<{ subject: string }>,
  slackMessages: Array<{ text: string }>,
): string {
  const parts: string[] = [];
  if (completedTasks.length > 0) parts.push(`${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''} completed since last check-in.`);
  if (currentPriorities.length > 0) parts.push(`${currentPriorities.length} open priorit${currentPriorities.length > 1 ? 'ies' : 'y'}: ${currentPriorities.slice(0, 3).map(t => t.name).join(', ')}.`);
  if (outstandingItems.length > 0) parts.push(`${outstandingItems.length} overdue item${outstandingItems.length > 1 ? 's' : ''} need${outstandingItems.length === 1 ? 's' : ''} attention.`);
  if (emailThreads.length > 0) parts.push(`${emailThreads.length} recent communication${emailThreads.length > 1 ? 's' : ''} in CRM.`);
  if (slackMessages.length > 0) parts.push(`${slackMessages.length} Slack message${slackMessages.length > 1 ? 's' : ''} in channel.`);
  if (parts.length === 0) parts.push(`No recent activity found for ${clientName}. Consider scheduling a check-in.`);
  return parts.join(' ');
}

// === Main handler ===
export async function POST(request: Request) {
  try {
    const { clientId, wealthboxId, lastCheckinDate, slackChannelId, clientName } = await request.json();

    // Use 90 days as the lookback window for notes/events regardless of last check-in
    const lookbackDate = new Date(Date.now() - 90 * 86400000);

    // Load user names + fetch all sources in parallel
    const [, completedTasksRaw, openTasksRaw, events, notes, slackMessages] = await Promise.all([
      wealthboxId ? loadWealthboxUsers() : Promise.resolve({}),
      wealthboxId ? getCompletedTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getOpenTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getEventsForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getNotesForContact(wealthboxId) : Promise.resolve([]),
      getSlackChannelMessages(slackChannelId || ''),
    ]);

    // Process ALL completed tasks — use due_date as the primary date
    const achievementsSinceLastCheckin = completedTasksRaw
      .sort((a: any, b: any) => new Date(b.due_date || b.updated_at || '').getTime() - new Date(a.due_date || a.updated_at || '').getTime())
      .slice(0, 30)
      .map((t: any) => ({
        name: t.name,
        completedAt: t.due_date || t.updated_at || t.created_at,
        description: t.description,
        completedBy: resolveUserName(t.completer),
        assignedTo: resolveUserName(t.assigned_to),
      }));

    // Process open tasks → priorities vs outstanding (with assignments)
    const now = new Date();
    const currentPriorities = openTasksRaw
      .filter((t: any) => !t.due_date || new Date(t.due_date) >= now)
      .sort((a: any, b: any) => {
        if (!a.due_date) return 1; if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .map((t: any) => ({
        name: t.name,
        dueDate: t.due_date,
        description: t.description,
        assignedTo: resolveUserName(t.assigned_to),
      }));

    const outstandingItems = openTasksRaw
      .filter((t: any) => t.due_date && new Date(t.due_date) < now)
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .map((t: any) => ({
        name: t.name,
        dueDate: t.due_date,
        description: t.description,
        assignedTo: resolveUserName(t.assigned_to),
      }));

    // Process Wealthbox events + notes → communication history
    const emailThreads = [
      ...events.map(e => ({
        subject: e.title || 'Meeting',
        from: 'Team',
        snippet: e.description || '',
        date: e.starts_at || e.created_at,
      })),
      ...notes
        .filter(n => new Date(n.created_at) >= lookbackDate)
        .map(n => ({
          subject: 'Note',
          from: 'Team',
          snippet: n.content.slice(0, 1000),
          date: n.created_at,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Generate AI narrative summary
    const narrative = await generateNarrative(
      clientName || 'Client',
      achievementsSinceLastCheckin,
      currentPriorities,
      outstandingItems,
      emailThreads,
      slackMessages,
      lastCheckinDate,
    );

    return NextResponse.json({
      success: true,
      summary: {
        clientId,
        narrative,
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
