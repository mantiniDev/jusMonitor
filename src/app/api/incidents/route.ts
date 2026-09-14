import { NextRequest, NextResponse } from 'next/server';
import { listIncidents , atestavel } from '@/lib/incidents';
import { COURTS } from '@/lib/courts';

export const dynamic = 'force-dynamic';

const COURT_BY_ID = new Map(COURTS.map((c) => [c.id, c]));

/**
 * GET /api/incidents
 *   ?open=true|false   abertos, encerrados ou todos
 *   ?court=t01         filtra por endpoint
 *   ?since=ISO         a partir de uma data
 *   ?limit=200
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const openParam = q.get('open');

  const incidents = await listIncidents({
    open: openParam === null ? undefined : openParam === 'true',
    courtId: q.get('court') ?? undefined,
    since: q.get('since') ?? undefined,
    limit: q.get('limit') ? Number(q.get('limit')) : undefined,
  });

  // O ledger guarda só o court_id; o painel precisa do tribunal por extenso.
  const enriched = incidents.map((i) => {
    const court = COURT_BY_ID.get(i.court_id);
    return {
      ...i,
      acronym: court?.acronym ?? i.court_id,
      system: court?.system ?? null,
      grau: court?.grau ?? null,
      durationMs: i.ended_at
        ? new Date(i.ended_at).getTime() - new Date(i.started_at).getTime()
        : Date.now() - new Date(i.started_at).getTime(),
      // Falha interna não atesta nada sobre o tribunal: a UI não deve
      // oferecer o botão de certidão só para receber 409 de volta.
      certidaoDisponivel: atestavel(i.kind),
    };
  });

  return NextResponse.json({ incidents: enriched, count: enriched.length });
}
