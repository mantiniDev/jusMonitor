import type { NextRequest } from 'next/server';

/**
 * Guarda das rotas de escrita.
 *
 * As varreduras disparam centenas de requisições aos tribunais em nome da
 * instituição. Expostas sem proteção numa URL pública, qualquer um poderia
 * acioná-las em rajada — o que, na melhor hipótese, nos faria parecer abusivos
 * e, na pior, bloquearia nosso IP nos sistemas que dependemos.
 *
 * Sem SWEEP_TOKEN configurado (caso do desenvolvimento local) tudo é liberado.
 */
export function autorizado(req: NextRequest): boolean {
  const esperado = process.env.SWEEP_TOKEN;
  if (!esperado) return true;

  const header = req.headers.get('authorization') ?? '';
  const recebido = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Comparação de tamanho antes do conteúdo evita vazar o tamanho por timing.
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) {
    diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diferenca === 0;
}

export const NAO_AUTORIZADO = {
  body: { error: 'Não autorizado. Envie o cabeçalho Authorization: Bearer <SWEEP_TOKEN>.' },
  init: { status: 401 },
} as const;
