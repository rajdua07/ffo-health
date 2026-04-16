// Wealthbox API Client
import { Client } from "@/lib/data";

const WEALTHBOX_API_KEY = process.env.WEALTHBOX_API_KEY || process.env.NEXT_PUBLIC_WEALTHBOX_API_KEY;
const WEALTHBOX_API_URL = process.env.WEALTHBOX_API_URL || 'https://api.crmworkspace.com/v1';

interface WealthboxContact {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  birth_date?: string;
  client_since?: string;
  source?: string;
  owner?: {
    id: string;
    name: string;
  };
  custom_fields?: Record<string, any>;
  referrer?: {
    name: string;
  };
  tags?: Array<{ name: string }>;
}

interface WealthboxTask {
  id: string;
  name: string;
  description?: string;
  due_date?: string;
  completed_at?: string;
  completed: boolean;
  contact_id?: string;
}

interface WealthboxResponse<T> {
  contacts?: T[];
  contact?: T;
  meta?: {
    total_count: number;
    total_pages: number;
    page: number;
  };
}

async function wealthboxFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${WEALTHBOX_API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'ACCESS_TOKEN': WEALTHBOX_API_KEY || '',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Wealthbox API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Tag filtering configuration — only import contacts tagged "Planning - FFO"
const REQUIRED_TAGS = [
  'Planning - FFO',
];

const EXCLUDED_TAGS = [
  'Inactive',
  'Inactive Planning Client'
];

export function shouldIncludeContact(contact: WealthboxContact): boolean {
  const tagNames = (contact.tags || []).map(tag => tag.name);

  // Check if contact has any excluded tags
  const hasExcludedTag = EXCLUDED_TAGS.some(excludedTag =>
    tagNames.includes(excludedTag)
  );

  if (hasExcludedTag) {
    return false;
  }

  // Check if contact has at least one required tag
  const hasRequiredTag = REQUIRED_TAGS.some(requiredTag =>
    tagNames.includes(requiredTag)
  );

  return hasRequiredTag;
}

export async function getWealthboxContacts(): Promise<WealthboxContact[]> {
  try {
    const allContacts: WealthboxContact[] = [];
    let page = 1;
    let totalPages = 1;

    // Fetch all pages of contacts
    do {
      const data: WealthboxResponse<WealthboxContact> = await wealthboxFetch(
        `/contacts?per_page=100&status=active&page=${page}`
      );

      if (Array.isArray(data.contacts)) {
        allContacts.push(...data.contacts);
      }

      if (data.meta) {
        totalPages = data.meta.total_pages;
      }

      page++;
    } while (page <= totalPages);

    return allContacts;
  } catch (error) {
    console.error('Error fetching Wealthbox contacts:', error);
    throw error;
  }
}

export async function getWealthboxContact(id: string): Promise<WealthboxContact | null> {
  try {
    const data: WealthboxResponse<WealthboxContact> = await wealthboxFetch(`/contacts/${id}`);
    return data.contact || null;
  } catch (error) {
    console.error(`Error fetching Wealthbox contact ${id}:`, error);
    return null;
  }
}

// Cache for user ID → name resolution
let userCache: Record<string, string> = {};
let userCacheLoaded = false;

export async function loadWealthboxUsers(): Promise<Record<string, string>> {
  if (userCacheLoaded) return userCache;
  try {
    const data = await wealthboxFetch('/users?per_page=100');
    for (const u of data.users || []) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').replace(/,.*$/, '').trim();
      if (name) userCache[String(u.id)] = name;
    }
    userCacheLoaded = true;
  } catch { /* ignore */ }
  return userCache;
}

export function resolveUserName(idOrObj: any): string {
  if (!idOrObj) return 'Team';
  if (typeof idOrObj === 'object' && idOrObj.name) return idOrObj.name;
  const id = String(typeof idOrObj === 'object' ? idOrObj.id : idOrObj);
  return userCache[id] || 'Team';
}

export async function getCompletedTasksForContact(contactId: string): Promise<WealthboxTask[]> {
  try {
    // resource_id correctly filters to this contact only (linked_to does NOT filter)
    const data = await wealthboxFetch(
      `/tasks?resource_id=${contactId}&resource_type=Contact&completed=true&per_page=50`
    );
    return (data.tasks || []).sort((a: any, b: any) =>
      new Date(b.completed_at || b.updated_at || '').getTime() - new Date(a.completed_at || a.updated_at || '').getTime()
    );
  } catch {
    return [];
  }
}

export async function getOpenTasksForContact(contactId: string): Promise<WealthboxTask[]> {
  try {
    const data = await wealthboxFetch(
      `/tasks?resource_id=${contactId}&resource_type=Contact&completed=false&per_page=50`
    );
    return (data.tasks || []).sort((a: any, b: any) =>
      new Date(b.due_date || b.updated_at || '').getTime() - new Date(a.due_date || a.updated_at || '').getTime()
    );
  } catch {
    return [];
  }
}

export async function getEventsForContact(contactId: string): Promise<Array<{
  id: string; title: string; description?: string; starts_at?: string; created_at: string;
}>> {
  try {
    const data = await wealthboxFetch(
      `/events?resource_id=${contactId}&resource_type=Contact&per_page=30`
    );
    return (data.events || []).map((e: any) => ({
      id: e.id,
      title: e.title || '(No title)',
      description: e.description ? String(e.description).replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
      starts_at: e.starts_at,
      created_at: e.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getNotesForContact(contactId: string): Promise<Array<{
  id: string; content: string; created_at: string;
}>> {
  try {
    const data = await wealthboxFetch(
      `/notes?resource_id=${contactId}&resource_type=Contact&per_page=30&order=desc`
    );
    return (data.status_updates || data.notes || []).map((n: any) => ({
      id: n.id,
      content: (n.content || '').replace(/<[^>]*>/g, '').slice(0, 2000),
      created_at: n.created_at,
    }));
  } catch {
    return [];
  }
}

export async function updateWealthboxContact(id: string, customFields: Record<string, any>): Promise<boolean> {
  try {
    await wealthboxFetch(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        contact: {
          custom_fields: customFields
        }
      })
    });
    return true;
  } catch (error) {
    console.error(`Error updating Wealthbox contact ${id}:`, error);
    return false;
  }
}

// Fast version: Map contact to client WITHOUT fetching tasks (for display in dialog)
export function mapWealthboxToFFOClientFast(contact: WealthboxContact): Client {
  const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';

  // Use client_since if available, otherwise fall back to created_at
  const onboardDate = contact.client_since?.split('T')[0] ||
                      contact.created_at?.split('T')[0] ||
                      new Date().toISOString().split('T')[0];

  return {
    id: `ffo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique FFO Health ID
    wealthboxId: contact.id, // Store Wealthbox ID separately
    name,
    tier: (contact.custom_fields?.ffo_tier as string) || 'FFO',
    leadAdvisor: contact.owner?.name || 'Landon',
    onboardDate,
    monthlyFee: Number(contact.custom_fields?.ffo_monthly_fee) || 0,
    referralSource: contact.source || 'Direct Outreach',
    referredBy: contact.referrer?.name,
    birthDate: contact.birth_date?.split('T')[0], // Store birthdate
    completedTasks: [], // Will be populated later if needed
  };
}

// Slow version: Fetch and add completed tasks to an existing client (called after selection)
export async function enrichClientWithTasks(client: Client): Promise<Client> {
  if (!client.wealthboxId) return client;

  let completedTasks: Array<{ name: string; completedAt: string; description?: string }> = [];
  try {
    const tasks = await getCompletedTasksForContact(client.wealthboxId);
    completedTasks = tasks
      .filter(task => task.completed_at) // Only include tasks with completion date
      .slice(0, 20) // Limit to most recent 20 tasks
      .map(task => ({
        name: task.name,
        completedAt: task.completed_at!,
        description: task.description
      }));
  } catch (error) {
    console.error(`Failed to fetch tasks for contact ${client.wealthboxId}:`, error);
  }

  return {
    ...client,
    completedTasks
  };
}

// Legacy function for backwards compatibility (now just calls fast version)
export async function mapWealthboxToFFOClient(contact: WealthboxContact): Promise<Client> {
  return mapWealthboxToFFOClientFast(contact);
}

export function prepareScoreForWealthbox(
  score: number,
  status: string,
  dimensions: { engagement: number; responsiveness: number; profitability: number; advocacy: number; retention: number }
) {
  return {
    ffo_health_score: Number(score.toFixed(1)),
    ffo_status: status,
    ffo_last_scored: new Date().toISOString().split('T')[0],
    ffo_engagement: Number(dimensions.engagement.toFixed(1)),
    ffo_responsiveness: Number(dimensions.responsiveness.toFixed(1)),
    ffo_profitability: Number(dimensions.profitability.toFixed(1)),
    ffo_advocacy: Number(dimensions.advocacy.toFixed(1)),
    ffo_retention: Number(dimensions.retention.toFixed(1)),
  };
}

export async function testWealthboxConnection(): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    const contacts = await getWealthboxContacts();
    return {
      success: true,
      message: `Successfully connected to Wealthbox`,
      count: contacts.length
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
