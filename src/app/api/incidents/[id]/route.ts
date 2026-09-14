import { NextRequest, NextResponse } from 'next/server';
import { getIncident, getEvidence } from '@/lib/incidents';
import { COURTS } from '@/lib/courts';

export const dynamic = 'force-dynamic';

/** Detalhe de um incidente com toda a evidência que o sustenta. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incidentId = Number(id);

  if (!Number.isInteger(incidentId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const incident = await getIncident(incidentId);
  if (!incident) {
    return NextResponse.json({ error: 'Incidente não encontrado' }, { status: 404 });
  }

  const court = COURTS.find((c) => c.id === incident.court_id);

  return NextResponse.json({
    incident: {
      ...incident,
      acronym: court?.acronym ?? incident.court_id,
      system: court?.system ?? null,
      grau: court?.grau ?? null,
      url: court?.url ?? null,
      durationMs: incident.ended_at
        ? new Date(incident.ended_at).getTime() - new Date(incident.started_at).getTime()
        : Date.now() - new Date(incident.started_at).getTime(),
    },
    evidence: await getEvidence(incidentId),
  });
}
