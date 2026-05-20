import { NextRequest, NextResponse } from 'next/server';
import { COURTS, CourtStatus } from '@/lib/courts';
import { checkCourt } from '@/lib/scraper';
import { updateCachedStatus } from '@/lib/statusCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const court = COURTS.find((c) => c.id === id);
  if (!court) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Courts that block external/cloud IPs — skip checking
  if (court.restricted) {
    return NextResponse.json({
      id,
      status: CourtStatus.RESTRICTED,
      message: 'Acesso restrito a IPs externos',
      lastChecked: null,
    });
  }

  const result = await checkCourt(court.url);
  const lastChecked = new Date().toISOString();
  updateCachedStatus(id, result.status, result.message, lastChecked);

  return NextResponse.json({ id, status: result.status, message: result.message, lastChecked });
}
