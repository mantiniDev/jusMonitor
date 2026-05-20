import { CourtWithStatus, CourtStatus } from '@/lib/courts';

interface Props {
  courts: CourtWithStatus[];
}

export default function StatsBar({ courts }: Props) {
  const counts = {
    total: courts.length,
    available: courts.filter((c) => c.currentStatus === CourtStatus.AVAILABLE).length,
    unavailable: courts.filter((c) => c.currentStatus === CourtStatus.UNAVAILABLE).length,
    error: courts.filter((c) => c.currentStatus === CourtStatus.ERROR).length,
    checking: courts.filter((c) => c.currentStatus === CourtStatus.CHECKING).length,
    unknown: courts.filter((c) => c.currentStatus === CourtStatus.UNKNOWN).length,
    restricted: courts.filter((c) => c.currentStatus === CourtStatus.RESTRICTED).length,
  };

  const stats = [
    { label: 'Total',         value: counts.total,       bg: 'bg-gray-50',    text: 'text-gray-700' },
    { label: 'Disponíveis',   value: counts.available,   bg: 'bg-green-50',   text: 'text-green-700' },
    { label: 'Indisponíveis', value: counts.unavailable, bg: 'bg-red-50',     text: 'text-red-700' },
    { label: 'Com erro',      value: counts.error,       bg: 'bg-amber-50',   text: 'text-amber-700' },
    { label: 'Verificando',   value: counts.checking,    bg: 'bg-blue-50',    text: 'text-blue-700' },
    { label: 'Não verificados', value: counts.unknown,   bg: 'bg-gray-50',    text: 'text-gray-500' },
    { label: '🔒 Restritos',  value: counts.restricted,  bg: 'bg-gray-50',    text: 'text-gray-500' },
  ];

  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {stats.map((s) => (
        <div key={s.label} className={`${s.bg} rounded-lg p-3 text-center`}>
          <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
          <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
