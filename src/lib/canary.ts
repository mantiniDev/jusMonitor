/**
 * Canário de conectividade.
 *
 * Se a nossa rede ou o nosso DNS cair, todos os 227 endpoints falham ao mesmo
 * tempo — e sem esta checagem o ledger registraria 227 incidentes falsos, cada
 * um deles uma certidão mentirosa esperando para ser emitida.
 *
 * Antes de qualquer varredura, confirmamos que conseguimos sair para a internet.
 * Se não conseguimos, a varredura é abortada e nada é gravado: não saber é um
 * estado honesto, registrar queda inexistente não é.
 */

/** Alvos estáveis e fora do Judiciário, para não confundir com queda de tribunal. */
const CONTROLS = [
  'https://www.google.com/generate_204',
  'https://cloudflare.com/cdn-cgi/trace',
];

const CONTROL_TIMEOUT_MS = 6000;

export interface CanaryResult {
  /** true se ao menos um controle respondeu: temos internet. */
  healthy: boolean;
  reachable: string[];
  unreachable: string[];
  checkedAt: string;
}

async function ping(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkNetwork(): Promise<CanaryResult> {
  const results = await Promise.all(
    CONTROLS.map(async (url) => ({ url, ok: await ping(url) }))
  );

  const reachable = results.filter((r) => r.ok).map((r) => r.url);
  const unreachable = results.filter((r) => !r.ok).map((r) => r.url);

  return {
    healthy: reachable.length > 0,
    reachable,
    unreachable,
    checkedAt: new Date().toISOString(),
  };
}
