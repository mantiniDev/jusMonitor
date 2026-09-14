import { consultar, consultarUm, executar } from './db';
import { CourtStatus } from './courts';
import type { CheckResult } from './scraper';

/**
 * Quantas observações ruins seguidas são necessárias para ABRIR um incidente.
 * Evita que uma oscilação isolada vire registro — o que destruiria a
 * credibilidade da evidência perante o cliente.
 */
export const CONFIRM_FAILURES = 3;

/** Quantas observações boas seguidas são necessárias para FECHAR um incidente. */
export const CONFIRM_RECOVERIES = 2;

export type IncidentKind =
  | 'EXTERNA_BLOQUEANTE' // tribunal fora do ar: conexão recusada, 5xx
  | 'EXTERNA'            // instabilidade: timeout, SSL, DNS, tela não carregou
  | 'INTERNA'            // falha nossa: WAF barrou, rede caiu
  | 'PROGRAMADA';        // manutenção anunciada pelo próprio tribunal

export interface Incident {
  id: number;
  court_id: string;
  kind: IncidentKind;
  status: string;
  started_at: string;
  confirmed_at: string;
  ended_at: string | null;
  closed_at: string | null;
  failure_count: number;
  last_message: string | null;
}

export interface Evidence {
  id: number;
  incident_id: number;
  observed_at: string;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  message: string | null;
}

interface CourtState {
  court_id: string;
  fail_streak: number;
  ok_streak: number;
  first_fail_at: string | null;
  first_ok_at: string | null;
  open_incident_id: number | null;
  last_status: string | null;
  last_checked_at: string | null;
  last_message: string | null;
}

const EMPTY_STATE = (courtId: string): CourtState => ({
  court_id: courtId,
  fail_streak: 0,
  ok_streak: 0,
  first_fail_at: null,
  first_ok_at: null,
  open_incident_id: null,
  last_status: null,
  last_checked_at: null,
  last_message: null,
});

/** Só AVAILABLE conta como sucesso. DEGRADED e BLOCKED são falhas. */
function isOk(status: CourtStatus): boolean {
  return status === CourtStatus.AVAILABLE;
}

/** RESTRICTED e UNKNOWN não são evidência de nada — o endpoint nem foi medido. */
function isMeasurable(status: CourtStatus): boolean {
  return status !== CourtStatus.RESTRICTED && status !== CourtStatus.UNKNOWN && status !== CourtStatus.CHECKING;
}

/**
 * Atribui a culpa do incidente.
 *
 * BLOCKED é o caso que justifica o probe funcional: nosso IP foi barrado por
 * WAF. O tribunal pode estar perfeito. Marcar como INTERNA impede que isso
 * jamais vire certidão para o cliente — seria prova de um fato que não houve.
 */
function classify(status: CourtStatus): IncidentKind {
  switch (status) {
    case CourtStatus.BLOCKED:     return 'INTERNA';
    case CourtStatus.UNAVAILABLE: return 'EXTERNA_BLOQUEANTE';
    default:                      return 'EXTERNA'; // DEGRADED, ERROR
  }
}

async function loadState(courtId: string): Promise<CourtState> {
  const row = await consultarUm<CourtState>('SELECT * FROM court_state WHERE court_id = ?', [courtId]);
  return row ? { ...row } : EMPTY_STATE(courtId);
}

async function saveState(s: CourtState): Promise<void> {
  await executar(
    `INSERT INTO court_state
       (court_id, fail_streak, ok_streak, first_fail_at, first_ok_at,
        open_incident_id, last_status, last_checked_at, last_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (court_id) DO UPDATE SET
       fail_streak      = excluded.fail_streak,
       ok_streak        = excluded.ok_streak,
       first_fail_at    = excluded.first_fail_at,
       first_ok_at      = excluded.first_ok_at,
       open_incident_id = excluded.open_incident_id,
       last_status      = excluded.last_status,
       last_checked_at  = excluded.last_checked_at,
       last_message     = excluded.last_message`,
    [
      s.court_id, s.fail_streak, s.ok_streak, s.first_fail_at, s.first_ok_at,
      s.open_incident_id, s.last_status, s.last_checked_at, s.last_message,
    ]
  );
}

/**
 * Copia para a evidência do incidente todas as observações já gravadas desde o
 * início da sequência de falhas. É o que sustenta a certidão.
 */
async function attachEvidenceSince(incidentId: number, courtId: string, since: string): Promise<void> {
  await executar(
    `INSERT INTO incident_evidence (incident_id, observed_at, status, http_status, latency_ms, message)
     SELECT ?, checked_at, status, http_status, latency_ms, message
       FROM checks
      WHERE court_id = ? AND checked_at >= ? AND ok = 0
      ORDER BY checked_at`,
    [incidentId, courtId, since]
  );
}

export interface RecordOutcome {
  status: CourtStatus;
  opened?: Incident;
  closed?: Incident;
}

/**
 * Registra uma observação e movimenta a máquina de estado.
 *
 * Detalhe que importa juridicamente: ao confirmar um incidente, `started_at` é
 * retroagido à PRIMEIRA falha da sequência — não ao instante da confirmação. A
 * indisponibilidade começou quando o sistema caiu, não quando nós concluímos
 * que ele havia caído. Simetricamente, `ended_at` é o primeiro sucesso.
 */
export async function recordCheck(
  courtId: string,
  result: CheckResult,
  at = new Date()
): Promise<RecordOutcome> {
  const now = at.toISOString();

  if (!isMeasurable(result.status)) {
    return { status: result.status };
  }

  const ok = isOk(result.status);

  await executar(
    `INSERT INTO checks (court_id, checked_at, status, ok, http_status, latency_ms, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      courtId, now, result.status, ok ? 1 : 0,
      result.httpStatus ?? null, result.latencyMs ?? null, result.message ?? null,
    ]
  );

  const s = await loadState(courtId);
  s.last_status = result.status;
  s.last_checked_at = now;
  s.last_message = result.message ?? null;

  const outcome: RecordOutcome = { status: result.status };

  if (ok) {
    s.ok_streak += 1;
    s.fail_streak = 0;
    s.first_fail_at = null;
    if (!s.first_ok_at) s.first_ok_at = now;

    if (s.open_incident_id && s.ok_streak >= CONFIRM_RECOVERIES) {
      await executar('UPDATE incidents SET ended_at = ?, closed_at = ? WHERE id = ?', [
        s.first_ok_at, now, s.open_incident_id,
      ]);
      outcome.closed = (await getIncident(s.open_incident_id)) ?? undefined;
      s.open_incident_id = null;
      s.first_ok_at = null;
    }
  } else {
    s.fail_streak += 1;
    s.ok_streak = 0;
    s.first_ok_at = null;
    if (!s.first_fail_at) s.first_fail_at = now;

    if (s.open_incident_id) {
      await executar(
        `INSERT INTO incident_evidence (incident_id, observed_at, status, http_status, latency_ms, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          s.open_incident_id, now, result.status,
          result.httpStatus ?? null, result.latencyMs ?? null, result.message ?? null,
        ]
      );
      await executar(
        'UPDATE incidents SET failure_count = failure_count + 1, last_message = ? WHERE id = ?',
        [result.message ?? null, s.open_incident_id]
      );
    } else if (s.fail_streak >= CONFIRM_FAILURES) {
      const startedAt = s.first_fail_at!;
      const info = await executar(
        `INSERT INTO incidents
           (court_id, kind, status, started_at, confirmed_at, failure_count, last_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          courtId, classify(result.status), result.status,
          startedAt, now, s.fail_streak, result.message ?? null,
        ]
      );
      const incidentId = info.lastInsertRowid!;
      await attachEvidenceSince(incidentId, courtId, startedAt);
      s.open_incident_id = incidentId;
      outcome.opened = (await getIncident(incidentId)) ?? undefined;
    }
  }

  await saveState(s);
  return outcome;
}

export async function getIncident(id: number): Promise<Incident | null> {
  const row = await consultarUm<Incident>('SELECT * FROM incidents WHERE id = ?', [id]);
  return row ? { ...row } : null;
}

export async function getEvidence(incidentId: number): Promise<Evidence[]> {
  const rows = await consultar<Evidence>(
    'SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY observed_at',
    [incidentId]
  );
  return rows.map((r) => ({ ...r }));
}

export interface ListFilter {
  /** true = só abertos, false = só encerrados, undefined = todos. */
  open?: boolean;
  courtId?: string;
  /** ISO — retorna incidentes que começaram a partir daqui. */
  since?: string;
  limit?: number;
}

export async function listIncidents(filter: ListFilter = {}): Promise<Incident[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.open === true) where.push('ended_at IS NULL');
  if (filter.open === false) where.push('ended_at IS NOT NULL');
  if (filter.courtId) { where.push('court_id = ?'); params.push(filter.courtId); }
  if (filter.since) { where.push('started_at >= ?'); params.push(filter.since); }

  const sql =
    `SELECT * FROM incidents
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY started_at DESC
     LIMIT ?`;
  params.push(filter.limit ?? 200);

  const rows = await consultar<Incident>(sql, params);
  return rows.map((r) => ({ ...r }));
}

/** Estado corrente de todos os endpoints já observados, para o painel. */
export async function listCourtStates(): Promise<CourtState[]> {
  const rows = await consultar<CourtState>('SELECT * FROM court_state');
  return rows.map((r) => ({ ...r }));
}
