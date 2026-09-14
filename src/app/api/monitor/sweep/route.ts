import { NextRequest, NextResponse } from 'next/server';
import { runSweep } from '@/lib/monitor';
import { autorizado, NAO_AUTORIZADO } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// Varrer 227 endpoints com timeout de 9s leva minutos no pior caso.
export const maxDuration = 300;

/**
 * Dispara uma varredura. `?courts=t01,t02` limita o alvo — útil para
 * reagir rápido a um tribunal suspeito sem esperar o ciclo completo.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json(NAO_AUTORIZADO.body, NAO_AUTORIZADO.init);

  const param = req.nextUrl.searchParams.get('courts');
  const courtIds = param ? param.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const summary = await runSweep({ courtIds });
  return NextResponse.json(summary);
}
