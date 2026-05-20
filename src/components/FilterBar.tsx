import { CourtGroup, CourtStatus, CourtSystem, GROUP_LABELS } from '@/lib/courts';

export type StatusFilter = CourtStatus | 'ALL';
export type GroupFilter = CourtGroup | 'ALL';
export type SystemFilter = CourtSystem | 'ALL';

interface Props {
  groupFilter: GroupFilter;
  statusFilter: StatusFilter;
  systemFilter: SystemFilter;
  onGroupChange: (g: GroupFilter) => void;
  onStatusChange: (s: StatusFilter) => void;
  onSystemChange: (s: SystemFilter) => void;
  searchTerm: string;
  onSearchChange: (s: string) => void;
}

const GROUP_OPTIONS: { value: GroupFilter; label: string }[] = [
  { value: 'ALL',      label: 'Todos' },
  { value: 'SUPERIOR', label: GROUP_LABELS.SUPERIOR },
  { value: 'TRF',      label: 'TRFs / JFs' },
  { value: 'TJ',       label: 'TJs' },
  { value: 'TRT',      label: 'TRTs' },
  { value: 'TRE',      label: 'TREs' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL',                       label: 'Todos os status' },
  { value: CourtStatus.AVAILABLE,       label: 'Disponíveis' },
  { value: CourtStatus.UNAVAILABLE,     label: 'Indisponíveis' },
  { value: CourtStatus.ERROR,           label: 'Com erro' },
  { value: CourtStatus.UNKNOWN,         label: 'Não verificados' },
];

const SYSTEM_OPTIONS: { value: SystemFilter; label: string }[] = [
  { value: 'ALL',      label: 'Todos os sistemas' },
  { value: 'PJe',      label: 'PJe' },
  { value: 'eProc',    label: 'eProc' },
  { value: 'eSAJ',     label: 'eSAJ' },
  { value: 'Projudi',  label: 'Projudi' },
  { value: 'Prop',     label: 'Proprietário' },
];

export default function FilterBar({
  groupFilter, statusFilter, systemFilter,
  onGroupChange, onStatusChange, onSystemChange,
  searchTerm, onSearchChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Group tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
        {GROUP_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onGroupChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              groupFilter === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* System filter */}
      <select
        value={systemFilter}
        onChange={(e) => onSystemChange(e.target.value as SystemFilter)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SYSTEM_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar tribunal..."
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
      />
    </div>
  );
}
