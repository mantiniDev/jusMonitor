'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CourtWithStatus, CourtStatus } from '@/lib/courts';
import CourtCard from './CourtCard';
import StatsBar from './StatsBar';
import FilterBar, { GroupFilter, StatusFilter, SystemFilter } from './FilterBar';

const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000;

export default function Dashboard() {
  const [courts, setCourts] = useState<CourtWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [systemFilter, setSystemFilter] = useState<SystemFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const autoRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();
    setCourts(data.courts);
    setLastUpdated(data.timestamp);
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setCourts(data.courts);
      setLastUpdated(data.timestamp);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  const refreshOne = useCallback(async (id: string) => {
    setCourts((prev) =>
      prev.map((c) => c.id === id ? { ...c, currentStatus: CourtStatus.CHECKING } : c)
    );
    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setCourts(data.courts);
    setLastUpdated(data.timestamp);
  }, []);

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimer.current = setInterval(refreshAll, AUTO_REFRESH_INTERVAL);
    } else {
      if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current);
    }
    return () => { if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current); };
  }, [autoRefresh, refreshAll]);

  const filteredCourts = courts.filter((court) => {
    if (groupFilter !== 'ALL' && court.group !== groupFilter) return false;
    if (statusFilter !== 'ALL' && court.currentStatus !== statusFilter) return false;
    if (systemFilter !== 'ALL' && court.system !== systemFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!court.acronym.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const formattedLastUpdated = lastUpdated
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(new Date(lastUpdated))
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitor de Sistemas Judiciais</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {courts.length} sistemas monitorados — PJe, eProc, eSAJ, Projudi
          </p>
        </div>
        <div className="flex items-center gap-3">
          {formattedLastUpdated && (
            <span className="text-xs text-gray-400">Atualizado: {formattedLastUpdated}</span>
          )}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto (30 min)
          </label>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {refreshing ? <><span className="animate-spin inline-block">↻</span> Verificando...</> : <>↻ Verificar Todos</>}
          </button>
        </div>
      </div>

      <StatsBar courts={courts} />

      <FilterBar
        groupFilter={groupFilter}
        statusFilter={statusFilter}
        systemFilter={systemFilter}
        onGroupChange={setGroupFilter}
        onStatusChange={setStatusFilter}
        onSystemChange={setSystemFilter}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      <p className="text-sm text-gray-400">
        Exibindo {filteredCourts.length} de {courts.length} sistemas
      </p>

      {filteredCourts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          Nenhum sistema encontrado com os filtros selecionados.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filteredCourts.map((court) => (
            <CourtCard key={court.id} court={court} onRefresh={refreshOne} />
          ))}
        </div>
      )}
    </div>
  );
}
