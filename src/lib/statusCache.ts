import { CourtStatus, CourtWithStatus, COURTS } from './courts';
import { checkCourt } from './scraper';

interface CacheEntry {
  status: CourtStatus;
  lastChecked: string;
  statusMessage: string;
}

// Module-level cache (persists across requests in the same Node.js process)
const cache = new Map<string, CacheEntry>();

export function getCachedStatuses(): CourtWithStatus[] {
  return COURTS.map((court) => {
    const entry = cache.get(court.id);
    return {
      ...court,
      currentStatus: entry?.status ?? CourtStatus.UNKNOWN,
      lastChecked: entry?.lastChecked,
      statusMessage: entry?.statusMessage,
    };
  });
}

export function getCachedStatus(id: string): CourtWithStatus | undefined {
  const court = COURTS.find((c) => c.id === id);
  if (!court) return undefined;
  const entry = cache.get(id);
  return {
    ...court,
    currentStatus: entry?.status ?? CourtStatus.UNKNOWN,
    lastChecked: entry?.lastChecked,
    statusMessage: entry?.statusMessage,
  };
}

export async function refreshCourts(ids: string[]): Promise<CourtWithStatus[]> {
  const courts = ids.length > 0
    ? COURTS.filter((c) => ids.includes(c.id))
    : COURTS;

  // Mark all as CHECKING before starting
  for (const court of courts) {
    const existing = cache.get(court.id);
    cache.set(court.id, {
      status: CourtStatus.CHECKING,
      lastChecked: existing?.lastChecked ?? new Date().toISOString(),
      statusMessage: 'Verificando...',
    });
  }

  // Fire all requests in parallel
  await Promise.allSettled(
    courts.map(async (court) => {
      const result = await checkCourt(court.url);
      cache.set(court.id, {
        status: result.status,
        lastChecked: new Date().toISOString(),
        statusMessage: result.message,
      });
    })
  );

  return getCachedStatuses();
}
