import { CourtStatus, CourtWithStatus, COURTS } from './courts';

interface CacheEntry {
  status: CourtStatus;
  lastChecked: string;
  statusMessage: string;
}

const cache = new Map<string, CacheEntry>();

export function getCachedStatuses(): CourtWithStatus[] {
  return COURTS.map((court) => {
    if (court.restricted) {
      return {
        ...court,
        currentStatus: CourtStatus.RESTRICTED,
        lastChecked: undefined,
        statusMessage: 'Acesso restrito a IPs externos',
      };
    }
    const entry = cache.get(court.id);
    return {
      ...court,
      currentStatus: entry?.status ?? CourtStatus.UNKNOWN,
      lastChecked: entry?.lastChecked,
      statusMessage: entry?.statusMessage,
    };
  });
}

export function updateCachedStatus(
  id: string,
  status: CourtStatus,
  statusMessage: string,
  lastChecked: string
) {
  cache.set(id, { status, statusMessage, lastChecked });
}
