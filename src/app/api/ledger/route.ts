import { NextRequest, NextResponse } from 'next/server';
import { listIncidents, listCourtStates, type Incident , atestavel } from '@/lib/incidents';
import { COURTS, CourtStatus } from '@/lib/courts';
import { BancoIndisponivel } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COURT_BY_ID = new Map(COURTS.map((c) => [c.id, c]));

function enrich(i: Incident, agora: number) {
  const court = COURT_BY_ID.get(i.court_id);
  return {
    ...i,
    acronym: court?.acronym ?? i.court_id,
    system: court?.system ?? null,
    grau: court?.grau ?? null,
    group: court?.group ?? null,
    url: court?.url ?? null,
    duracaoMin: Math.max(
      0,
      Math.round(((i.ended_at ? new Date(i.ended_at).getTime() : agora) - new Date(i.started_at).getTime()) / 60000)
    ),
    // Falha interna não atesta nada sobre o tribunal.
    certidaoDisponivel: atestavel(i.kind),
  };
}

/**
 * GET /api/ledger?dias=30
 *
 * Entrega tudo que o painel do ledger precisa numa única chamada: o que está
 * aberto agora, o histórico do período e o resumo. Evita três idas ao servidor
 * para montar uma tela só.
 */
export async function GET(req: NextRequest) {
  try {
    return await montar(req);
  } catch (e) {
    if (e instanceof BancoIndisponivel) {
      return NextResponse.json({ error: e.message, motivo: 'BANCO_NAO_CONFIGURADO' }, { status: 503 });
    }
    throw e;
  }
}

async function montar(req: NextRequest) {
  const dias = Number(req.nextUrl.searchParams.get('dias') ?? 30);
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const agora = Date.now();

  const abertos = (await listIncidents({ open: true, limit: 500 })).map((i) => enrich(i, agora));
  const historico = (await listIncidents({ open: false, since: desde, limit: 500 })).map((i) => enrich(i, agora));

  const estados = await listCourtStates();
  const monitorados = COURTS.filter((c) => !c.restricted).length;

  // Endpoints em incidente externo aberto — é o número que interessa ao on-call.
  const comIncidenteAberto = new Set(abertos.filter((i) => atestavel(i.kind)).map((i) => i.court_id));
  const emIncidente = comIncidenteAberto.size;

  // Operante exige as duas coisas: última observação boa E nenhum incidente
  // pendente. Um endpoint que respondeu uma vez após a queda ainda não teve a
  // recuperação confirmada, e contá-lo como operante contradiria o painel.
  const operantes = estados.filter(
    (e) => e.last_status === CourtStatus.AVAILABLE && !comIncidenteAberto.has(e.court_id)
  ).length;
  const bloqueiosInternos = abertos.filter((i) => i.kind === 'INTERNA').length;
  const naoCorroborados = abertos.filter((i) => i.kind === 'INDETERMINADA').length;

  const minutosIndisponiveis = historico.reduce((s, i) => s + i.duracaoMin, 0);

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    periodoDias: dias,
    resumo: {
      totalEndpoints: COURTS.length,
      monitorados,
      restritos: COURTS.length - monitorados,
      observados: estados.length,
      operantes,
      emIncidente,
      bloqueiosInternos,
      naoCorroborados,
      incidentesPeriodo: historico.length,
      minutosIndisponiveis,
    },
    abertos,
    historico,
  });
}
