import { NextRequest, NextResponse } from 'next/server';
import { refreshCourts } from '@/lib/statusCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  const courts = await refreshCourts(ids);
  return NextResponse.json({ courts, timestamp: new Date().toISOString() });
}
