import { NextRequest, NextResponse } from 'next/server';
import { emitirCertidao, CertidaoRecusada } from '@/lib/certidao';
import { certidaoHtml } from '@/lib/certidaoHtml';

export const dynamic = 'force-dynamic';

/**
 * GET /api/incidents/[id]/certidao
 *   ?format=html  documento imprimível (padrão: JSON)
 *
 * Recusa incidentes de falha interna: ali a culpa é nossa e não há
 * indisponibilidade do tribunal a atestar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incidenteId = Number(id);

  if (!Number.isInteger(incidenteId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const certidao = await emitirCertidao(incidenteId);

    if (req.nextUrl.searchParams.get('format') === 'html') {
      return new NextResponse(certidaoHtml(certidao), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.json(certidao);
  } catch (err) {
    if (err instanceof CertidaoRecusada) {
      // 404 para inexistente; 409 para o caso em que o registro existe mas
      // não admite certidão — a distinção importa para quem consome a API.
      const status = err.motivo === 'NAO_ENCONTRADO' ? 404 : 409;
      return NextResponse.json({ error: err.message, motivo: err.motivo }, { status });
    }
    throw err;
  }
}
