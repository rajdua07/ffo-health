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

// Tag filtering configuration
const REQUIRED_TAGS = [
  'Planning - Maintenance',
  'Planning - FFO',
  'Planning - Private Office',
  'Investments',
  'Krop - 2025 Tax Project',
  'Tax - FFO'
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

      if (data.contacts) {
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

export async function getCompletedTasksForContact(contactId: string): Promise<WealthboxTask[]> {
  try {
    // Fetch completed tasks for this contact using resource_id and resource_type
    const data: { tasks?: WealthboxTask[] } = await wealthboxFetch(
      `/tasks?resource_id=${contactId}&resource_type=Contact&completed=true&per_page=50`
    );
    return data.tasks || [];
  } catch (error) {
    // Tasks endpoint might not be available or have different permissions
    // Fail silently and return empty array
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

export async function mapWealthboxToFFOClient(contact: WealthboxContact): Promise<Client> {
  const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';

  // Fetch completed tasks for this contact
  let completedTasks: Array<{ name: string; completedAt: string; description?: string }> = [];
  try {
    const tasks = await getCompletedTasksForContact(contact.id);
    completedTasks = tasks
      .filter(task => task.completed_at) // Only include tasks with completion date
      .slice(0, 20) // Limit to most recent 20 tasks
      .map(task => ({
        name: task.name,
        completedAt: task.completed_at!,
        description: task.description
      }));
  } catch (error) {
    console.error(`Failed to fetch tasks for contact ${contact.id}:`, error);
  }

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
    completedTasks, // Include completed tasks
  };
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
