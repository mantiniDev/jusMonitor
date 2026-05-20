import { CourtStatus } from '@/lib/courts';

const CONFIG: Record<CourtStatus, { label: string; classes: string; dot: string }> = {
  [CourtStatus.AVAILABLE]:   { label: 'Disponível',        classes: 'bg-green-100 text-green-800',  dot: 'bg-green-500' },
  [CourtStatus.UNAVAILABLE]: { label: 'Indisponível',      classes: 'bg-red-100 text-red-800',      dot: 'bg-red-500 animate-pulse' },
  [CourtStatus.CHECKING]:    { label: 'Verificando...',    classes: 'bg-blue-100 text-blue-800',    dot: 'bg-blue-500 animate-pulse' },
  [CourtStatus.ERROR]:       { label: 'Erro de acesso',    classes: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-500' },
  [CourtStatus.UNKNOWN]:     { label: 'Não verificado',    classes: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  [CourtStatus.RESTRICTED]:  { label: '🔒 Acesso restrito', classes: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400' },
};

interface Props {
  status: CourtStatus;
}

export default function StatusBadge({ status }: Props) {
  const { label, classes, dot } = CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
