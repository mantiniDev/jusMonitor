import { NextRequest, NextResponse } from 'next/server';
import { varrerAvisos, ultimasCapturas, FONTES_AVISO, type Janela } from '@/lib/avisos';
import { correlacionar } from '@/lib/correlacao';
import { autorizado, NAO_AUTORIZADO } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Última captura de cada fonte oficial, com a saúde do catálogo. */
export async function GET() {
  const capturas = await ultimasCapturas();
  const porSigla = new Map(capturas.map((c) => [c.acronym, c]));

  const fontes = FONTES_AVISO.map((f) => {
    const c = porSigla.get(f.acronym);
    return {
      ...f,
      consultadoEm: c?.captured_at ?? null,
      ok: c ? c.ok === 1 : null,
      httpStatus: c?.http_status ?? null,
      erro: c?.erro ?? null,
      excerpt: c?.excerpt ?? null,
      janelas: (c?.janelasParsed ?? []) as Janela[],
    };
  });

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    resumo: {
      fontes: FONTES_AVISO.length,
      consultadas: fontes.filter((f) => f.consultadoEm !== null).length,
      comFalha: fontes.filter((f) => f.ok === false).length,
      comJanela: fontes.filter((f) => f.janelas.length > 0).length,
    },
    fontes,
  });
}

/** Varre as páginas oficiais e cruza o resultado com os incidentes medidos. */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json(NAO_AUTORIZADO.body, NAO_AUTORIZADO.init);

  const { capturas, novos, falhas } = await varrerAvisos();
  const vinculos = await correlacionar();

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    consultadas: capturas.length,
    avisosNovos: novos,
    falhas,
    incidentesReclassificados: vinculos.length,
    vinculos,
  });
}
