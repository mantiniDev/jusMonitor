import { CourtWithStatus, CourtStatus } from '@/lib/courts';

export type StatusFilter = CourtStatus | 'ALL';

interface Props {
  courts: CourtWithStatus[];
  activeFilter: StatusFilter;
  onStatusFilter: (f: StatusFilter) => void;
}

export default function StatsBar({ courts, activeFilter, onStatusFilter }: Props) {
  const counts = {
    total:      courts.length,
    available:  courts.filter((c) => c.currentStatus === CourtStatus.AVAILABLE).length,
    unavailable:courts.filter((c) => c.currentStatus === CourtStatus.UNAVAILABLE).length,
    error:      courts.filter((c) => c.currentStatus === CourtStatus.ERROR).length,
    checking:   courts.filter((c) => c.currentStatus === CourtStatus.CHECKING).length,
    unknown:    courts.filter((c) => c.currentStatus === CourtStatus.UNKNOWN).length,
    restricted: courts.filter((c) => c.currentStatus === CourtStatus.RESTRICTED).length,
  };

  const stats: {
    filter: StatusFilter;
    label: string;
    value: number;
    bg: string;
    bgActive: string;
    text: string;
    ring: string;
  }[] = [
    { filter: 'ALL',                    label: 'Total',           value: counts.total,       bg: 'bg-gray-50',    bgActive: 'bg-gray-200',   text: 'text-gray-700',  ring: 'ring-gray-400' },
    { filter: CourtStatus.AVAILABLE,    label: 'Disponíveis',     value: counts.available,   bg: 'bg-green-50',   bgActive: 'bg-green-200',  text: 'text-green-700', ring: 'ring-green-500' },
    { filter: CourtStatus.UNAVAILABLE,  label: 'Indisponíveis',   value: counts.unavailable, bg: 'bg-red-50',     bgActive: 'bg-red-200',    text: 'text-red-700',   ring: 'ring-red-500' },
    { filter: CourtStatus.ERROR,        label: 'Com erro',        value: counts.error,       bg: 'bg-amber-50',   bgActive: 'bg-amber-200',  text: 'text-amber-700', ring: 'ring-amber-500' },
    { filter: CourtStatus.CHECKING,     label: 'Verificando',     value: counts.checking,    bg: 'bg-blue-50',    bgActive: 'bg-blue-200',   text: 'text-blue-700',  ring: 'ring-blue-500' },
    { filter: CourtStatus.UNKNOWN,      label: 'Não verificados', value: counts.unknown,     bg: 'bg-gray-50',    bgActive: 'bg-gray-200',   text: 'text-gray-500',  ring: 'ring-gray-400' },
    { filter: CourtStatus.RESTRICTED,   label: '🔒 Restritos',   value: counts.restricted,  bg: 'bg-gray-50',    bgActive: 'bg-gray-200',   text: 'text-gray-500',  ring: 'ring-gray-400' },
  ];

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {stats.map((s) => {
        const isActive = activeFilter === s.filter;
        return (
          <button
            key={s.filter}
            onClick={() => onStatusFilter(isActive ? 'ALL' : s.filter)}
            title={isActive ? 'Clique para remover o filtro' : `Filtrar por: ${s.label}`}
            className={`rounded-lg p-3 text-center transition-all cursor-pointer select-none
              ${isActive ? `${s.bgActive} ring-2 ${s.ring}` : `${s.bg} hover:brightness-95`}
            `}
          >
            <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </button>
        );
      })}
    </div>
  );
}
