import { NextRequest, NextResponse } from 'next/server';
import { reclassificarTodos } from '@/lib/incidents';
import { autorizado, NAO_AUTORIZADO } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/incidents/reclassificar
 *
 * Recalcula a culpa de todos os incidentes a partir da evidência gravada.
 * Necessário quando a regra de classificação muda: sem isso, incidentes
 * classificados sob a regra antiga ficariam presos àquela decisão, inclusive
 * negando certidão que a evidência sustenta.
 *
 * Protegido como as varreduras — altera a classificação que decide quem recebe
 * certidão, e não deve ser acionável por quem abre o painel.
 */
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json(NAO_AUTORIZADO.body, NAO_AUTORIZADO.init);

  const mudancas = await reclassificarTodos();

  return NextResponse.json({
    executadoEm: new Date().toISOString(),
    alterados: mudancas.length,
    mudancas,
  });
}
