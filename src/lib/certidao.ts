import { createHash } from 'node:crypto';
import { COURTS } from './courts';
import { getIncident, getEvidence, CONFIRM_FAILURES, CONFIRM_RECOVERIES, type Incident, type Evidence } from './incidents';
import { avisosDoIncidente, type AvisoVinculado } from './correlacao';

/** Prazos processuais correm em horário de Brasília — a certidão não pode exibir UTC. */
export const FUSO = 'America/Sao_Paulo';

export type RecusaMotivo = 'NAO_ENCONTRADO' | 'FALHA_INTERNA' | 'NAO_CORROBORADA';

export class CertidaoRecusada extends Error {
  constructor(readonly motivo: RecusaMotivo, mensagem: string) {
    super(mensagem);
    this.name = 'CertidaoRecusada';
  }
}

export interface ObservacaoCertidao {
  momento: string;        // formatado em Brasília
  momentoISO: string;
  httpStatus: number | null;
  latenciaMs: number | null;
  descricao: string;
}

export interface Certidao {
  numero: string;
  emitidaEm: string;
  emitidaEmISO: string;
  tribunal: string;
  sistema: string | null;
  grau: string | null;
  endereco: string | null;
  natureza: string;
  inicio: string;
  inicioISO: string;
  fim: string | null;
  fimISO: string | null;
  emCurso: boolean;
  duracaoMinutos: number;
  observacoes: ObservacaoCertidao[];
  /** Comunicados do próprio tribunal que cobrem o período certificado. */
  avisosOficiais: AvisoVinculado[];
  metodologia: string[];
  ressalvas: string[];
  hash: string;
}

function emBrasilia(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: FUSO,
  }).format(new Date(iso));
}

const NATUREZA: Record<string, string> = {
  EXTERNA_BLOQUEANTE:
    'Indisponibilidade do sistema do tribunal: as requisições não foram atendidas ou retornaram erro de servidor.',
  EXTERNA:
    'Instabilidade do sistema do tribunal: o endereço respondeu, porém sem apresentar a tela de acesso esperada, ou sem responder dentro do tempo limite.',
  PROGRAMADA:
    'Indisponibilidade programada, previamente anunciada pelo tribunal.',
};

/**
 * Impressão digital do conteúdo atestado. Permite conferir, mais tarde, que o
 * documento não foi alterado: reemitir a certidão do mesmo incidente deve
 * produzir o mesmo hash.
 */
function calcularHash(incidente: Incident, evidencias: Evidence[], avisos: AvisoVinculado[]): string {
  const canonico = JSON.stringify({
    id: incidente.id,
    court_id: incidente.court_id,
    kind: incidente.kind,
    started_at: incidente.started_at,
    ended_at: incidente.ended_at,
    evidencias: evidencias.map((e) => [e.observed_at, e.status, e.http_status, e.latency_ms]),
    avisos: avisos.map((a) => [a.avisoId, a.capturedAt]),
  });
  return createHash('sha256').update(canonico).digest('hex');
}

/**
 * Monta a certidão de um incidente.
 *
 * Recusa incidentes classificados como INTERNA: naqueles casos a falha foi
 * nossa (bloqueio de WAF, rede), e o tribunal pode ter permanecido no ar.
 * Emitir certidão ali seria atestar fato que não ocorreu — é a razão pela qual
 * a sondagem funcional foi construída antes deste módulo.
 */
export async function emitirCertidao(incidenteId: number): Promise<Certidao> {
  const incidente = await getIncident(incidenteId);
  if (!incidente) {
    throw new CertidaoRecusada('NAO_ENCONTRADO', `Incidente ${incidenteId} não existe no registro.`);
  }

  if (incidente.kind === 'INTERNA') {
    throw new CertidaoRecusada(
      'FALHA_INTERNA',
      'Incidente classificado como falha interna do monitoramento (bloqueio de acesso ou rede). ' +
        'Não há atestado de indisponibilidade do tribunal a emitir.'
    );
  }

  if (incidente.kind === 'INDETERMINADA') {
    throw new CertidaoRecusada(
      'NAO_CORROBORADA',
      'Incidente registrado a partir de falha sem resposta (tempo esgotado, DNS ou TLS). ' +
        'De um único ponto de observação não é possível distinguir indisponibilidade do tribunal ' +
        'de falha no caminho de rede até ele, e atestar a primeira hipótese sem corroboração ' +
        'produziria prova de fato não estabelecido.'
    );
  }

  const evidencias = await getEvidence(incidenteId);
  const avisosOficiais = await avisosDoIncidente(incidenteId);
  const corte = COURTS.find((c) => c.id === incidente.court_id);
  const agora = new Date();
  const emCurso = incidente.ended_at === null;

  const fimParaCalculo = incidente.ended_at ?? agora.toISOString();
  const duracaoMinutos = Math.max(
    0,
    Math.round((new Date(fimParaCalculo).getTime() - new Date(incidente.started_at).getTime()) / 60000)
  );

  const ressalvas = [
    'Este documento atesta exclusivamente as observações registradas pelo monitoramento automatizado descrito na metodologia.',
    'As medições foram realizadas a partir da rede da instituição emitente, por acesso público, sem autenticação no sistema do tribunal.',
    'O documento não contém juízo sobre a contagem, suspensão ou prorrogação de prazo processual, cuja apreciação compete ao juízo.',
  ];

  if (avisosOficiais.length > 0) {
    ressalvas.unshift(
      'O período certificado é coberto por comunicado publicado pelo próprio tribunal, transcrito nesta certidão.'
    );
  }

  if (emCurso) {
    ressalvas.unshift(
      'A indisponibilidade permanecia em curso no momento da emissão: não há registro de normalização até a data e hora deste documento.'
    );
  }
  if (evidencias.length < CONFIRM_FAILURES) {
    ressalvas.push(
      `O incidente possui ${evidencias.length} observação(ões) registrada(s), quantidade inferior ao limiar de confirmação usual.`
    );
  }

  return {
    numero: `JM-${String(incidente.id).padStart(6, '0')}`,
    emitidaEm: emBrasilia(agora.toISOString()),
    emitidaEmISO: agora.toISOString(),
    tribunal: corte?.acronym ?? incidente.court_id,
    sistema: corte?.system ?? null,
    grau: corte?.grau ?? null,
    endereco: corte?.url ?? null,
    natureza: NATUREZA[incidente.kind] ?? 'Indisponibilidade registrada pelo monitoramento.',
    inicio: emBrasilia(incidente.started_at),
    inicioISO: incidente.started_at,
    fim: incidente.ended_at ? emBrasilia(incidente.ended_at) : null,
    fimISO: incidente.ended_at,
    emCurso,
    duracaoMinutos,
    observacoes: evidencias.map((e) => ({
      momento: emBrasilia(e.observed_at),
      momentoISO: e.observed_at,
      httpStatus: e.http_status,
      latenciaMs: e.latency_ms,
      descricao: e.message ?? '—',
    })),
    avisosOficiais,
    metodologia: [
      'Sondagem funcional periódica do endereço público de acesso ao sistema, com inspeção do conteúdo retornado e não apenas do código de resposta HTTP.',
      `Um incidente é registrado somente após ${CONFIRM_FAILURES} observações consecutivas de falha, descartando oscilações isoladas.`,
      `O encerramento é registrado após ${CONFIRM_RECOVERIES} observações consecutivas de normalidade.`,
      'O horário de início corresponde à primeira observação de falha da sequência, e o de término à primeira observação de normalidade.',
      'Antes de cada varredura é verificada a conectividade da rede emitente com destinos externos ao Poder Judiciário; sem conectividade confirmada, nenhuma observação é registrada.',
      'Ocorrências atribuídas a bloqueio ou falha da própria rede emitente são classificadas separadamente e não geram certidão.',
      'Horários expressos em horário oficial de Brasília.',
    ],
    ressalvas,
    hash: calcularHash(incidente, evidencias, avisosOficiais),
  };
}
