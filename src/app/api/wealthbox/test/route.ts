import { NextResponse } from 'next/server';
import { testWealthboxConnection } from '@/lib/wealthbox';

export async function GET() {
  try {
    const result = await testWealthboxConnection();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        contactCount: result.count,
        testedAt: new Date().toISOString()
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Test connection error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      },
      { status: 500 }
    );
  }
}
