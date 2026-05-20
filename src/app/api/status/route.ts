import { NextResponse } from 'next/server';
import { getCachedStatuses } from '@/lib/statusCache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const courts = getCachedStatuses();
  return NextResponse.json({ courts, timestamp: new Date().toISOString() });
}
