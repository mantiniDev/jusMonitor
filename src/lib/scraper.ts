import { CourtStatus } from './courts';

export async function checkCourt(url: string): Promise<{ status: CourtStatus; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
    });

    const s = response.status;

    if (s < 400) {
      return { status: CourtStatus.AVAILABLE, message: `HTTP ${s} — sistema respondendo` };
    }
    if (s === 401 || s === 403) {
      return { status: CourtStatus.AVAILABLE, message: `HTTP ${s} — autenticação necessária (sistema no ar)` };
    }
    if (s >= 500) {
      return { status: CourtStatus.UNAVAILABLE, message: `HTTP ${s} — sistema com erro/manutenção` };
    }
    return { status: CourtStatus.ERROR, message: `HTTP ${s}` };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('abort') || message.toLowerCase().includes('timeout')) {
      return { status: CourtStatus.ERROR, message: 'Timeout: sem resposta em 8s' };
    }
    if (message.includes('SSL') || message.includes('certificate') || message.includes('CERT')) {
      return { status: CourtStatus.ERROR, message: 'Erro de certificado SSL' };
    }
    if (message.includes('ECONNREFUSED')) {
      return { status: CourtStatus.UNAVAILABLE, message: 'Conexão recusada' };
    }
    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return { status: CourtStatus.ERROR, message: 'DNS não resolvido' };
    }
    return { status: CourtStatus.ERROR, message: message.slice(0, 80) };
  } finally {
    clearTimeout(timeout);
  }
}
