import { NextResponse } from 'next/server';
import { updateWealthboxContact, prepareScoreForWealthbox } from '@/lib/wealthbox';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { wealthboxId, score, status, dimensions } = body;

    if (!wealthboxId || score === undefined || !status || !dimensions) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (need wealthboxId, score, status, dimensions)' },
        { status: 400 }
      );
    }

    const customFields = prepareScoreForWealthbox(score, status, dimensions);
    const success = await updateWealthboxContact(wealthboxId, customFields);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Score pushed to Wealthbox successfully',
        pushedAt: new Date().toISOString()
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to update Wealthbox contact' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Push score error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push score to Wealthbox'
      },
      { status: 500 }
    );
  }
}
