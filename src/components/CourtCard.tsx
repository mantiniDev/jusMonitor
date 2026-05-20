import { CourtWithStatus, CourtStatus, SYSTEM_COLORS } from '@/lib/courts';
import StatusBadge from './StatusBadge';

interface Props {
  court: CourtWithStatus;
  onRefresh: (id: string) => void;
}

const BORDER_COLOR: Record<CourtStatus, string> = {
  [CourtStatus.AVAILABLE]:   'border-green-200',
  [CourtStatus.UNAVAILABLE]: 'border-red-300',
  [CourtStatus.CHECKING]:    'border-blue-200',
  [CourtStatus.ERROR]:       'border-amber-200',
  [CourtStatus.UNKNOWN]:     'border-gray-200',
  [CourtStatus.RESTRICTED]:  'border-gray-200',
};

export default function CourtCard({ court, onRefresh }: Props) {
  const isChecking = court.currentStatus === CourtStatus.CHECKING;

  const formattedDate = court.lastChecked
    ? new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(court.lastChecked))
    : null;

  return (
    <div className={`bg-white border-2 ${BORDER_COLOR[court.currentStatus]} rounded-xl p-3 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow`}>
      {/* Header: tribunal + system + grau badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
          {court.acronym}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${SYSTEM_COLORS[court.system]}`}>
          {court.system}
        </span>
        <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
          {court.grau}
        </span>
      </div>

      {/* Status + actions */}
      <div className="flex items-center justify-between gap-1">
        <StatusBadge status={court.currentStatus} />
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={court.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            Acessar
          </a>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => onRefresh(court.id)}
            disabled={isChecking}
            title="Verificar agora"
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isChecking ? '⋯' : '↻'}
          </button>
        </div>
      </div>

      {/* Message + timestamp */}
      {court.statusMessage && court.currentStatus !== CourtStatus.UNKNOWN && (
        <p className="text-xs text-gray-400 truncate" title={court.statusMessage}>
          {court.statusMessage}
        </p>
      )}
      {formattedDate && (
        <p className="text-xs text-gray-300">{formattedDate}</p>
      )}
    </div>
  );
}
