import { COURTS, Court, CourtStatus } from './courts';
import { checkCourt } from './scraper';
import { recordCheck, type Incident } from './incidents';
import { updateCachedStatus } from './statusCache';
import { checkNetwork, type CanaryResult } from './canary';

/** Quantos endpoints sondar em paralelo. Alto o bastante para varrer 227 em
 *  poucos minutos, baixo o bastante para não parecer abuso aos tribunais. */
const CONCURRENCY = 12;

/**
 * Acima desta fração de falhas, a causa provável somos nós — não é plausível
 * que tribunais independentes caiam juntos. Não desfaz o que foi gravado,
 * mas avisa o on-call antes que alguém emita certidão em cima disso.
 */
const MASS_FAILURE_RATIO = 0.7;

export interface SweepSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  checked: number;
  skipped: number;
  available: number;
  degraded: number;
  blocked: number;
  failing: number;
  opened: Incident[];
  closed: Incident[];
  canary: CanaryResult;
  /** true quando a varredura não rodou por falta de conectividade nossa. */
  aborted: boolean;
  abortReason?: string;
  /** true quando a proporção de falhas sugere causa local, não dos tribunais. */
  massFailureSuspected: boolean;
}

/** Percorre `items` com no máximo `limit` execuções simultâneas. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

export interface SweepOptions {
  /** Sonda apenas estes ids. Sem isso, varre o catálogo inteiro. */
  courtIds?: string[];
  /** Pula o canário. Só para teste — em produção a varredura sem canário mente. */
  skipCanary?: boolean;
}

export async function runSweep(options: SweepOptions = {}): Promise<SweepSummary> {
  const startedAt = new Date();
  const t0 = Date.now();

  const canary = options.skipCanary
    ? { healthy: true, reachable: [], unreachable: [], checkedAt: startedAt.toISOString() }
    : await checkNetwork();

  let target: Court[] = COURTS;
  if (options.courtIds?.length) {
    const wanted = new Set(options.courtIds);
    target = COURTS.filter((c) => wanted.has(c.id));
  }

  // Endpoints que bloqueiam IP externo não são medíveis daqui: sondá-los
  // produziria falha que não é do tribunal, poluindo o ledger.
  const measurable = target.filter((c) => !c.restricted);
  const skipped = target.length - measurable.length;

  const base = {
    startedAt: startedAt.toISOString(),
    skipped,
    canary,
  };

  // Sem internet não há observação possível. Abortar preserva o ledger.
  if (!canary.healthy) {
    const finishedAt = new Date();
    return {
      ...base,
      finishedAt: finishedAt.toISOString(),
      durationMs: Date.now() - t0,
      checked: 0,
      available: 0,
      degraded: 0,
      blocked: 0,
      failing: 0,
      opened: [],
      closed: [],
      aborted: true,
      abortReason: 'Sem conectividade: nenhum controle externo respondeu. Nada foi gravado.',
      massFailureSuspected: false,
    };
  }

  let available = 0;
  let degraded = 0;
  let blocked = 0;
  let failing = 0;
  const opened: Incident[] = [];
  const closed: Incident[] = [];

  await pool(measurable, CONCURRENCY, async (court) => {
    const result = await checkCourt(court.url, court.system);
    const at = new Date();
    const outcome = await recordCheck(court.id, result, at);

    switch (result.status) {
      case CourtStatus.AVAILABLE: available++; break;
      case CourtStatus.DEGRADED:  degraded++; failing++; break;
      case CourtStatus.BLOCKED:   blocked++;  failing++; break;
      default:                    failing++;
    }

    if (outcome.opened) opened.push(outcome.opened);
    if (outcome.closed) closed.push(outcome.closed);

    updateCachedStatus(court.id, result.status, result.message, at.toISOString());
  });

  const finishedAt = new Date();
  return {
    ...base,
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - t0,
    checked: measurable.length,
    available,
    degraded,
    blocked,
    failing,
    opened,
    closed,
    aborted: false,
    massFailureSuspected: measurable.length >= 10 && failing / measurable.length >= MASS_FAILURE_RATIO,
  };
}
