'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Dashboard from './Dashboard';
import Ledger from './Ledger';
import AvisosPanel from './AvisosPanel';

type Aba = 'status' | 'incidentes' | 'avisos';

const ABAS: { id: Aba; titulo: string; descricao: string }[] = [
  { id: 'status',     titulo: 'Status ao vivo',        descricao: 'o que medimos agora' },
  { id: 'incidentes', titulo: 'Registro de incidentes', descricao: 'histórico e certidão' },
  { id: 'avisos',     titulo: 'Avisos oficiais',        descricao: 'o que o tribunal declara' },
];

interface Resumo {
  operantes: number;
  emIncidente: number;
  bloqueiosInternos: number;
  incidentesPeriodo: number;
  minutosIndisponiveis: number;
  monitorados: number;
}

function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export default function Painel() {
  const router = useRouter();
  const params = useSearchParams();
  const abaParam = params.get('aba') as Aba | null;
  const [aba, setAba] = useState<Aba>(
    abaParam && ABAS.some((a) => a.id === abaParam) ? abaParam : 'status'
  );

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [fontesComJanela, setFontesComJanela] = useState<number | null>(null);

  const carregarResumo = useCallback(async () => {
    const [led, avi] = await Promise.all([
      fetch('/api/ledger?dias=30').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/avisos').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (led) setResumo(led.resumo);
    if (avi) setFontesComJanela(avi.resumo.comJanela);
  }, []);

  useEffect(() => { carregarResumo(); }, [carregarResumo]);

  const trocar = (id: Aba) => {
    setAba(id);
    // Mantém a aba no endereço para que o link possa ser compartilhado.
    router.replace(id === 'status' ? '/' : `/?aba=${id}`, { scroll: false });
  };

  const cartoes = resumo
    ? [
        { label: 'Operantes',       valor: String(resumo.operantes),                     cor: 'text-green-700',  bg: 'bg-green-50' },
        { label: 'Em incidente',    valor: String(resumo.emIncidente),                   cor: 'text-red-700',    bg: 'bg-red-50' },
        { label: 'Bloqueio nosso',  valor: String(resumo.bloqueiosInternos),             cor: 'text-purple-700', bg: 'bg-purple-50' },
        { label: 'Incidentes 30d',  valor: String(resumo.incidentesPeriodo),             cor: 'text-blue-700',   bg: 'bg-blue-50' },
        { label: 'Tempo fora 30d',  valor: duracao(resumo.minutosIndisponiveis),         cor: 'text-amber-700',  bg: 'bg-amber-50' },
        { label: 'Fontes com aviso', valor: fontesComJanela === null ? '—' : String(fontesComJanela), cor: 'text-gray-700', bg: 'bg-gray-50' },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Monitoramento de indisponibilidade dos tribunais</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Duas fontes no mesmo registro: a indisponibilidade que <strong>medimos</strong> e a que o tribunal{' '}
          <strong>declara</strong>.
        </p>
      </div>

      {cartoes.length > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {cartoes.map((c) => (
            <div key={c.label} className={`${c.bg} rounded-lg p-3 text-center`}>
              <div className={`text-xl sm:text-2xl font-bold ${c.cor} tabular-nums`}>{c.valor}</div>
              <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="border-b border-gray-200 flex gap-1 overflow-x-auto">
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => trocar(a.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                ativa
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {a.titulo}
              <span className="hidden md:inline text-xs text-gray-400 font-normal ml-2">{a.descricao}</span>
            </button>
          );
        })}
      </div>

      {aba === 'status' && <Dashboard />}
      {aba === 'incidentes' && <Ledger />}
      {aba === 'avisos' && <AvisosPanel />}
    </div>
  );
}
