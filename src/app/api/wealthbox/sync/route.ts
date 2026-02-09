import { NextResponse } from 'next/server';
import { getWealthboxContacts, mapWealthboxToFFOClient } from '@/lib/wealthbox';

export async function GET() {
  try {
    const contacts = await getWealthboxContacts();
    const clients = contacts.map(mapWealthboxToFFOClient);

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
