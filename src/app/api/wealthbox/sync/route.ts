import { NextResponse } from 'next/server';
import { getWealthboxContacts, mapWealthboxToFFOClientFast, shouldIncludeContact } from '@/lib/wealthbox';

export async function GET() {
  try {
    const contacts = await getWealthboxContacts();

    // Filter by tags first (before mapping)
    const filteredContacts = contacts.filter(contact => shouldIncludeContact(contact));

    // Map contacts to clients (fast version without tasks for dialog display)
    const clients = filteredContacts
      .map(contact => mapWealthboxToFFOClientFast(contact))
      // Filter out contacts with no valid name (Unknown or empty)
      .filter(client => {
        const hasValidName = client.name &&
                            client.name.trim() !== '' &&
                            client.name !== 'Unknown';
        return hasValidName;
      });

    return NextResponse.json({
      success: true,
      clients,
      count: clients.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync with Wealthbox'
      },
      { status: 500 }
    );
  }
}
