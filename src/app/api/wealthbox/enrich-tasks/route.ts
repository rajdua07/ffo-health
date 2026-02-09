import { NextResponse } from 'next/server';
import { enrichClientWithTasks } from '@/lib/wealthbox';
import { Client } from '@/lib/data';

export async function POST(request: Request) {
  try {
    const { clients } = await request.json();

    if (!Array.isArray(clients)) {
      return NextResponse.json(
        { success: false, error: 'Invalid clients data' },
        { status: 400 }
      );
    }

    // Enrich each client with tasks sequentially to avoid rate limiting
    const enrichedClients: Client[] = [];
    for (const client of clients) {
      const enriched = await enrichClientWithTasks(client);
      enrichedClients.push(enriched);

      // Small delay to avoid rate limiting (100ms between requests)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      success: true,
      clients: enrichedClients,
      count: enrichedClients.length
    });
  } catch (error) {
    console.error('Enrich tasks error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enrich clients with tasks'
      },
      { status: 500 }
    );
  }
}
