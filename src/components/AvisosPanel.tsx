'use client';

import { useCallback, useEffect, useState } from 'react';

interface Janela { inicio: string | null; fim: string | null; trecho: string }

interface Fonte {
  acronym: string;
  nome: string;
  url: string;
  consultadoEm: string | null;
  ok: boolean | null;
  httpStatus: number | null;
  erro: string | null;
  excerpt: string | null;
  janelas: Janela[];
}

interface AvisosData {
  geradoEm: string;
  resumo: { fontes: number; consultadas: number; comFalha: number; comJanela: number };
  fontes: Fonte[];
}

function brasilia(iso: string | null, comHora = true): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

export default function AvisosPanel() {
  const [data, setData] = useState<AvisosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [varrendo, setVarrendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch('/api/avisos').catch(() => null);
    if (res?.ok) { setData(await res.json()); setErroConfig(null); return; }
    if (res?.status === 503) setErroConfig((await res.json()).error ?? null);
  }, []);

  useEffect(() => { carregar().finally(() => setLoading(false)); }, [carregar]);

  const varrer = useCallback(async () => {
    setVarrendo(true);
    setResultado(null);
    const res = await fetch('/api/avisos', { method: 'POST' }).catch(() => null);
    if (res?.status === 401) {
      setResultado('Consulta manual desabilitada nesta instalação. As consultas são executadas pelo agendador.');
      setVarrendo(false);
      return;
    }
    if (res?.ok) {
      const r = await res.json();
      setResultado(
        `${r.consultadas} fontes consultadas · ${r.avisosNovos} com conteúdo novo · ` +
        `${r.falhas} falha(s) · ${r.incidentesReclassificados} incidente(s) reclassificado(s) como manutenção programada`
      );
      await carregar();
    } else {
      setResultado('Não foi possível concluir a consulta às fontes oficiais.');
    }
    setVarrendo(false);
  }, [carregar]);

  if (loading) return <div className="py-16 text-center text-gray-400">Carregando...</div>;
  if (!data) {
    return (
      <div className="bg-amber-50 border-2 border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-4">
        <strong className="block mb-1">Avisos indisponíveis</strong>
        {erroConfig ?? 'Não foi possível carregar os avisos.'}
      </div>
    );
  }

  const { resumo } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 max-w-2xl">
          O que os tribunais <strong className="text-gray-700">declaram</strong> nas próprias páginas oficiais.
          Cruzado com o que medimos, reclassifica incidentes como manutenção programada e reforça a certidão.
        </p>
        <button
          onClick={varrer}
          disabled={varrendo}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {varrendo ? <><span className="animate-spin inline-block">↻</span> Consultando...</> : <>↻ Consultar fontes</>}
        </button>
      </div>

      {resultado && (
        <div className="bg-blue-50 border-2 border-blue-100 text-blue-900 text-sm rounded-xl px-4 py-3">{resultado}</div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Fontes no catálogo', valor: resumo.fontes,      cor: 'text-gray-700',  bg: 'bg-gray-50' },
          { label: 'Consultadas',        valor: resumo.consultadas,  cor: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Com janela lida',    valor: resumo.comJanela,    cor: 'text-blue-700',  bg: 'bg-blue-50' },
          { label: 'Com falha',          valor: resumo.comFalha,     cor: 'text-red-700',   bg: 'bg-red-50' },
        ].map((c) => (
          <div key={c.label} className={`${c.bg} rounded-lg p-3 text-center`}>
            <div className={`text-2xl font-bold ${c.cor} tabular-nums`}>{c.valor}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {data.fontes.map((f) => {
          const expandido = aberto === f.acronym;
          return (
            <div key={f.acronym} className="bg-white border-2 border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setAberto(expandido ? null : f.acronym)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors"
              >
                <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded shrink-0">{f.acronym}</span>
                <span className="text-sm text-gray-600 truncate flex-1">{f.nome}</span>
                {f.janelas.length > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 shrink-0">
                    {f.janelas.length} janela{f.janelas.length > 1 ? 's' : ''}
                  </span>
                )}
                {f.ok === false && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 shrink-0">falha</span>
                )}
                {f.consultadoEm && (
                  <span className="text-xs text-gray-400 shrink-0 hidden sm:inline tabular-nums">{brasilia(f.consultadoEm)}</span>
                )}
                <span className="text-gray-300 shrink-0">{expandido ? '▾' : '▸'}</span>
              </button>

              {expandido && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  {f.erro && <p className="text-sm text-red-700">Falha ao consultar: {f.erro}</p>}

                  {f.janelas.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[420px]">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Início</th>
                            <th className="text-left px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Fim</th>
                            <th className="text-left px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">Trecho</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.janelas.map((j, k) => (
                            <tr key={k} className="border-b border-gray-50 last:border-0">
                              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-gray-700">{brasilia(j.inicio)}</td>
                              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-gray-700">{brasilia(j.fim)}</td>
                              <td className="px-3 py-1.5 text-xs text-gray-500">{j.trecho.slice(0, 120)}…</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {f.janelas.length === 0 && f.excerpt && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">
                        Nenhuma janela com data e hora reconhecida nesta página. Trecho capturado:
                      </p>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{f.excerpt.slice(0, 500)}</p>
                    </div>
                  )}

                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Abrir página oficial ↗
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        Só entram no catálogo endereços verificados. Uma janela é lida apenas quando a página traz início e fim
        com data e hora coerentes — o que não passa nesse critério fica como trecho para leitura, em vez de virar
        uma data inventada.
      </p>
    </div>
  );
}
