import { NextResponse } from 'next/server';
import { getWealthboxContacts, mapWealthboxToFFOClient, shouldIncludeContact } from '@/lib/wealthbox';

export async function GET() {
  try {
    const contacts = await getWealthboxContacts();

    // Filter by tags first (before mapping)
    const filteredContacts = contacts.filter(contact => shouldIncludeContact(contact));

    // Map contacts to clients (async now because we fetch tasks)
    const clientPromises = filteredContacts.map(contact => mapWealthboxToFFOClient(contact));
    const allClients = await Promise.all(clientPromises);

    // Filter out contacts with no valid name (Unknown or empty)
    const clients = allClients.filter(client => {
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
