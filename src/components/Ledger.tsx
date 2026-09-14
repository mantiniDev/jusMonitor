'use client';

import { useCallback, useEffect, useState } from 'react';
import { SYSTEM_COLORS, type CourtSystem } from '@/lib/courts';

interface IncidentRow {
  id: number;
  court_id: string;
  kind: string;
  status: string;
  started_at: string;
  confirmed_at: string;
  ended_at: string | null;
  failure_count: number;
  last_message: string | null;
  acronym: string;
  system: CourtSystem | null;
  grau: string | null;
  url: string | null;
  duracaoMin: number;
  certidaoDisponivel: boolean;
}

interface Resumo {
  totalEndpoints: number;
  monitorados: number;
  restritos: number;
  observados: number;
  operantes: number;
  emIncidente: number;
  bloqueiosInternos: number;
  incidentesPeriodo: number;
  minutosIndisponiveis: number;
}

interface LedgerData {
  geradoEm: string;
  periodoDias: number;
  resumo: Resumo;
  abertos: IncidentRow[];
  historico: IncidentRow[];
}

const KIND_LABEL: Record<string, { texto: string; classes: string }> = {
  EXTERNA_BLOQUEANTE: { texto: 'Indisponibilidade',  classes: 'bg-red-100 text-red-800' },
  EXTERNA:            { texto: 'Instabilidade',      classes: 'bg-amber-100 text-amber-800' },
  INTERNA:            { texto: 'Falha nossa',        classes: 'bg-purple-100 text-purple-800' },
  PROGRAMADA:         { texto: 'Programada',         classes: 'bg-blue-100 text-blue-800' },
};

/** Prazo corre em horário de Brasília: o painel não pode exibir outro fuso. */
function brasilia(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function KindBadge({ kind }: { kind: string }) {
  const cfg = KIND_LABEL[kind] ?? { texto: kind, classes: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
      {cfg.texto}
    </span>
  );
}

function Tabela({ linhas, emCurso }: { linhas: IncidentRow[]; emCurso: boolean }) {
  if (linhas.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm bg-white border-2 border-gray-100 rounded-xl">
        {emCurso ? 'Nenhum incidente em curso.' : 'Nenhum incidente registrado no período.'}
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-gray-100 rounded-xl overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Tribunal', 'Sistema', 'Inst.', 'Tipo', 'Início', emCurso ? 'Há' : 'Término', 'Duração', 'Obs.', 'Certidão'].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((i) => (
            <tr key={i.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
              <td className="px-3 py-2">
                <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded">{i.acronym}</span>
              </td>
              <td className="px-3 py-2">
                {i.system && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${SYSTEM_COLORS[i.system]}`}>{i.system}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{i.grau ?? '—'}</td>
              <td className="px-3 py-2"><KindBadge kind={i.kind} /></td>
              <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">{brasilia(i.started_at)}</td>
              <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                {emCurso ? <span className="text-red-600 font-medium">{duracao(i.duracaoMin)}</span> : brasilia(i.ended_at)}
              </td>
              <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">{duracao(i.duracaoMin)}</td>
              <td className="px-3 py-2 text-gray-400 tabular-nums">{i.failure_count}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {i.certidaoDisponivel ? (
                  <a
                    href={`/api/incidents/${i.id}/certidao?format=html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    Emitir
                  </a>
                ) : (
                  <span className="text-xs text-gray-300" title="Falha atribuída ao nosso monitoramento: não há indisponibilidade do tribunal a atestar.">
                    indisponível
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Ledger() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [dias, setDias] = useState(30);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async (d: number) => {
    const res = await fetch(`/api/ledger?dias=${d}`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    carregar(dias).finally(() => setLoading(false));
  }, [carregar, dias]);

  const varrer = useCallback(async () => {
    setSweeping(true);
    setAviso(null);
    const res = await fetch('/api/monitor/sweep', { method: 'POST' }).catch(() => null);
    if (res?.status === 401) {
      // Instalação pública: quem varre é o agendador, não o visitante.
      setAviso('Varredura manual desabilitada nesta instalação. As varreduras são executadas pelo agendador.');
      setSweeping(false);
      return;
    }
    if (res?.ok) {
      const s = await res.json();
      if (s.aborted) {
        setAviso(s.abortReason ?? 'Varredura abortada.');
      } else if (s.massFailureSuspected) {
        setAviso('Proporção de falhas muito alta: a causa provável é a nossa rede, não os tribunais. Confira antes de emitir certidão.');
      }
      await carregar(dias);
    } else {
      setAviso('Não foi possível concluir a varredura.');
    }
    setSweeping(false);
  }, [carregar, dias]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px] text-gray-400">Carregando...</div>;
  }
  if (!data) {
    return <div className="text-center py-16 text-gray-400">Não foi possível carregar o registro.</div>;
  }

  const { resumo } = data;
  const filtrar = (linhas: IncidentRow[]) =>
    busca ? linhas.filter((i) => i.acronym.toLowerCase().includes(busca.toLowerCase())) : linhas;

  const cards = [
    { label: 'Monitorados',      valor: resumo.monitorados,          cor: 'text-gray-700',   bg: 'bg-gray-50' },
    { label: 'Operantes',        valor: resumo.operantes,            cor: 'text-green-700',  bg: 'bg-green-50' },
    { label: 'Em incidente',     valor: resumo.emIncidente,          cor: 'text-red-700',    bg: 'bg-red-50' },
    { label: 'Bloqueio nosso',   valor: resumo.bloqueiosInternos,    cor: 'text-purple-700', bg: 'bg-purple-50' },
    { label: `Incidentes ${dias}d`, valor: resumo.incidentesPeriodo, cor: 'text-blue-700',   bg: 'bg-blue-50' },
    { label: 'Tempo fora',       valor: duracao(resumo.minutosIndisponiveis), cor: 'text-amber-700', bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-gray-500 max-w-2xl">
          Incidentes <strong className="text-gray-700">confirmados</strong>, com início e fim ao minuto e
          evidência para certidão.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700"
          >
            {[7, 30, 90, 180].map((d) => <option key={d} value={d}>Últimos {d} dias</option>)}
          </select>
          <button
            onClick={varrer}
            disabled={sweeping}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {sweeping ? <><span className="animate-spin inline-block">↻</span> Varrendo...</> : <>↻ Varrer agora</>}
          </button>
        </div>
      </div>

      {aviso && (
        <div className="bg-amber-50 border-2 border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">
          {aviso}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} rounded-lg p-3 text-center`}>
            <div className={`text-2xl font-bold ${c.cor} tabular-nums`}>{c.valor}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Filtrar por tribunal (ex.: TRT1, TJSP)..."
        className="w-full sm:w-72 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Em curso <span className="text-gray-400 font-normal">({filtrar(data.abertos).length})</span>
        </h2>
        <Tabela linhas={filtrar(data.abertos)} emCurso />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Histórico <span className="text-gray-400 font-normal">({filtrar(data.historico).length})</span>
        </h2>
        <Tabela linhas={filtrar(data.historico)} emCurso={false} />
      </section>

      <p className="text-xs text-gray-400">
        Horários em horário de Brasília. Incidentes classificados como falha nossa não geram certidão:
        naqueles casos o tribunal pode ter permanecido no ar.
      </p>
    </div>
  );
}
