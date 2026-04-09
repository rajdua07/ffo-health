import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCompletedTasksForContact, getOpenTasksForContact, getEventsForContact, getNotesForContact, loadWealthboxUsers, resolveUserName } from '@/lib/wealthbox';

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
    if (!data.ok) return [];
    const userIds = Array.from(new Set((data.messages || []).map((m: { user?: string }) => m.user).filter(Boolean)));
    const userNames: Record<string, string> = {};
    for (const uid of userIds as string[]) {
      try {
        const userResp = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
          headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        });
        const userData = await userResp.json();
        if (userData.ok) userNames[uid] = userData.user?.real_name || userData.user?.name || uid;
      } catch { userNames[uid as string] = uid as string; }
    }
    return (data.messages || [])
      .filter((m: { subtype?: string }) => !m.subtype)
      .map((m: { user?: string; text?: string; ts?: string }) => ({
        author: userNames[m.user || ''] || m.user || 'Unknown',
        text: (m.text || '').slice(0, 500),
        ts: new Date(Number(m.ts) * 1000).toISOString(),
      }))
      .reverse().slice(-20);
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
${completedTasks.length === 0 ? 'None' : completedTasks.map((t: any) => `- ${t.name} — completed by ${t.completedBy || 'team'} on ${new Date(t.completedAt).toLocaleDateString()}${t.description ? '\n  Context: ' + t.description.slice(0, 200) : ''}`).join('\n')}

--- OPEN TASKS / CURRENT PRIORITIES (${currentPriorities.length}) ---
${currentPriorities.length === 0 ? 'None' : currentPriorities.map((t: any) => `- ${t.name} — assigned to ${t.assignedTo || 'unassigned'}${t.dueDate ? ', due ' + new Date(t.dueDate).toLocaleDateString() : ''}${t.description ? '\n  Context: ' + t.description.slice(0, 200) : ''}`).join('\n')}

--- OVERDUE ITEMS (${outstandingItems.length}) ---
${outstandingItems.length === 0 ? 'None' : outstandingItems.map((t: any) => `- ${t.name} — assigned to ${t.assignedTo || 'unassigned'}, was due ${new Date(t.dueDate!).toLocaleDateString()}${t.description ? '\n  Context: ' + t.description.slice(0, 200) : ''}`).join('\n')}

--- MEETINGS & EVENTS (${emailThreads.filter(e => e.subject !== 'Note').length}) ---
${emailThreads.filter(e => e.subject !== 'Note').length === 0 ? 'None' : emailThreads.filter(e => e.subject !== 'Note').map(e => `- ${e.subject} (${new Date(e.date).toLocaleDateString()})${e.snippet ? ': ' + e.snippet.slice(0, 150) : ''}`).join('\n')}

--- CRM NOTES (${emailThreads.filter(e => e.subject === 'Note').length}) ---
${emailThreads.filter(e => e.subject === 'Note').length === 0 ? 'None' : emailThreads.filter(e => e.subject === 'Note').map(e => `- ${new Date(e.date).toLocaleDateString()}: ${e.snippet.slice(0, 200)}`).join('\n')}

--- SLACK CHANNEL ACTIVITY (${slackMessages.length}) ---
${slackMessages.length === 0 ? 'No Slack channel connected' : slackMessages.map(m => `- ${m.author} (${new Date(m.ts).toLocaleDateString()}): ${m.text}`).join('\n')}
`.trim();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are an executive assistant to a lead financial advisor at a fractional family office. Based on the following client data, write a concise executive briefing for the advisor before their next check-in with this client.

The briefing should:
1. Start with a 1-2 sentence overall status ("where the client is at")
2. Highlight what's been accomplished since the last check-in
3. Call out what balls are in whose court — what the team owes the client, and what the client owes the team
4. Flag any overdue items or risks
5. Suggest 1-2 talking points for the next meeting

Keep it under 250 words. Use plain language, no jargon. Be direct and actionable. Use bullet points for clarity. Do not use markdown headers.

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

    const sinceDate = lastCheckinDate ? new Date(lastCheckinDate) : new Date(Date.now() - 90 * 86400000);
    const sinceTs = sinceDate.getTime();

    // Load user names + fetch all sources in parallel
    const [, completedTasksRaw, openTasksRaw, events, notes, slackMessages] = await Promise.all([
      wealthboxId ? loadWealthboxUsers() : Promise.resolve({}),
      wealthboxId ? getCompletedTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getOpenTasksForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getEventsForContact(wealthboxId) : Promise.resolve([]),
      wealthboxId ? getNotesForContact(wealthboxId) : Promise.resolve([]),
      getSlackChannelMessages(slackChannelId || '', sinceTs),
    ]);

    // Process completed tasks → achievements (with who completed them)
    const achievementsSinceLastCheckin = completedTasksRaw
      .filter((t: any) => t.completed_at && new Date(t.completed_at) >= sinceDate)
      .sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 25)
      .map((t: any) => ({
        name: t.name,
        completedAt: t.completed_at!,
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
      .slice(0, 20)
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
        .filter(n => new Date(n.created_at) >= sinceDate)
        .map(n => ({
          subject: 'Note',
          from: 'Team',
          snippet: n.content.slice(0, 300),
          date: n.created_at,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20);

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
