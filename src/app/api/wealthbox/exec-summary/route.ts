import { NextResponse } from 'next/server';
import { getCompletedTasksForContact } from '@/lib/wealthbox';

const WEALTHBOX_API_KEY = process.env.WEALTHBOX_API_KEY || process.env.NEXT_PUBLIC_WEALTHBOX_API_KEY;
const WEALTHBOX_API_URL = process.env.WEALTHBOX_API_URL || 'https://api.crmworkspace.com/v1';

async function wealthboxFetch(endpoint: string) {
  const url = `${WEALTHBOX_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'ACCESS_TOKEN': WEALTHBOX_API_KEY || '',
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Wealthbox API error: ${response.status} - ${error}`);
  }
  return response.json();
}

async function getOpenTasksForContact(contactId: string) {
  try {
    const data: { tasks?: Array<{ id: string; name: string; description?: string; due_date?: string; completed: boolean }> } =
      await wealthboxFetch(`/tasks?resource_id=${contactId}&resource_type=Contact&completed=false&per_page=50`);
    return data.tasks || [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { clientId, wealthboxId, lastCheckinDate } = await request.json();

    if (!wealthboxId) {
      return NextResponse.json(
        { success: false, error: 'No Wealthbox ID provided' },
        { status: 400 }
      );
    }

    // Fetch completed and open tasks in parallel
    const [completedTasks, openTasks] = await Promise.all([
      getCompletedTasksForContact(wealthboxId),
      getOpenTasksForContact(wealthboxId),
    ]);

    // Filter completed tasks to only those since last check-in
    const sinceDate = lastCheckinDate ? new Date(lastCheckinDate) : new Date(Date.now() - 90 * 86400000); // default 90 days
    const achievementsSinceLastCheckin = completedTasks
      .filter(t => t.completed_at && new Date(t.completed_at) >= sinceDate)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
      .slice(0, 20)
      .map(t => ({
        name: t.name,
        completedAt: t.completed_at!,
        description: t.description,
      }));

    // Split open tasks into priorities (due soon / no due date) vs outstanding (overdue)
    const now = new Date();
    const currentPriorities = openTasks
      .filter(t => !t.due_date || new Date(t.due_date) >= now)
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .slice(0, 15)
      .map(t => ({
        name: t.name,
        dueDate: t.due_date,
        description: t.description,
      }));

    const outstandingItems = openTasks
      .filter(t => t.due_date && new Date(t.due_date) < now)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .map(t => ({
        name: t.name,
        dueDate: t.due_date,
        description: t.description,
      }));

    return NextResponse.json({
      success: true,
      summary: {
        clientId,
        achievementsSinceLastCheckin,
        currentPriorities,
        outstandingItems,
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
