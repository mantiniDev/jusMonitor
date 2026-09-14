import { CourtStatus, type CourtSystem } from './courts';
import { evaluateBody, MAX_BODY_BYTES, type ProbeVerdict, type ProbeEvaluation } from './probes';

export interface CheckResult {
  status: CourtStatus;
  message: string;
  /** HTTP status recebido, quando houve resposta. */
  httpStatus?: number;
  /** Tempo até a resposta (ou até o erro), em ms. Entra na evidência do incidente. */
  latencyMs: number;
  /** Veredito da sondagem funcional, quando houve corpo para avaliar. */
  verdict?: ProbeVerdict;
}

/**
 * Lê no máximo `MAX_BODY_BYTES` do corpo. Os marcadores que interessam ficam
 * no início do HTML, e sem o limite uma resposta anômala travaria a varredura.
 */
async function readBounded(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const chunks: string[] = [];
  let total = 0;

  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } catch {
    // Corpo truncado ainda serve: avaliamos o que chegou.
  } finally {
    reader.cancel().catch(() => {});
  }

  return chunks.join('');
}

/**
 * Decide o estado a partir do código HTTP e do veredito do corpo.
 *
 * Separada do `fetch` porque é a peça mais crítica do sistema: é aqui que se
 * decide se uma resposta vira "queda do tribunal" — e, por consequência, se
 * pode virar certidão. Pura, para ser testável sem rede.
 *
 * O princípio que governa a ordem: **na dúvida, a culpa é nossa**. Atribuir ao
 * tribunal uma indisponibilidade que não houve produz prova falsa; atribuir a
 * nós uma queda real só nos custa um alerta a investigar.
 */
export function classificarResposta(
  s: number,
  { verdict, matched }: ProbeEvaluation,
  system: CourtSystem
): { status: CourtStatus; message: string; verdict: ProbeVerdict } {
  // 1. Bloqueio nosso vem primeiro: não observamos o tribunal, observamos a
  //    nossa própria barreira.
  if (verdict === 'BLOCKED') {
    return { status: CourtStatus.BLOCKED, message: `Bloqueio de acesso — ${matched}`, verdict };
  }

  // 2. Manutenção declarada, venha com o código que vier.
  if (verdict === 'MAINTENANCE') {
    return { status: CourtStatus.UNAVAILABLE, message: `Indisponível — ${matched} (HTTP ${s})`, verdict };
  }

  // 3. 5xx → o servidor do tribunal falhou ao processar. Sinal inequívoco.
  if (s >= 500) {
    return { status: CourtStatus.UNAVAILABLE, message: `HTTP ${s} — sistema com erro/manutenção`, verdict };
  }

  // 4. Parede de autenticação: só conta como "no ar" se a tela do sistema veio
  //    junto. Um 401/403 com corpo irreconhecível é quase sempre WAF de borda
  //    barrando a gente, e dar isso como disponível seria o pior erro possível
  //    — um falso "operante" durante janela que pode ser de prazo.
  if (s === 401 || s === 403) {
    return verdict === 'FUNCTIONAL'
      ? { status: CourtStatus.AVAILABLE, message: `HTTP ${s} — autenticação necessária (${system} no ar)`, verdict }
      : { status: CourtStatus.BLOCKED, message: `HTTP ${s} — acesso barrado sem a tela do ${system}`, verdict: 'BLOCKED' };
  }

  // 5. Erro de requisição: o servidor recusou o FORMATO do que pedimos, o que
  //    fala da nossa borda, não da saúde do tribunal. Vários tribunais
  //    respondem assim apenas a IP de datacenter, servindo a página normal a um
  //    navegador comum — observado em TRT23 e TJSE a partir do Vercel enquanto
  //    ambos estavam no ar. Tratar como queda geraria certidão de fato inexistente.
  if (s === 400 || s === 405 || s === 406) {
    return verdict === 'FUNCTIONAL'
      ? { status: CourtStatus.AVAILABLE, message: `HTTP ${s} — ${system} respondendo`, verdict }
      : { status: CourtStatus.BLOCKED, message: `HTTP ${s} — requisição recusada sem a tela do ${system}`, verdict: 'BLOCKED' };
  }

  // 6. Respondeu 2xx/3xx, mas a tela esperada não carregou: não dá para coletar.
  if (verdict === 'UNEXPECTED') {
    return { status: CourtStatus.DEGRADED, message: `HTTP ${s} — respondeu sem a tela esperada do ${system}`, verdict };
  }

  if (s < 400) {
    return { status: CourtStatus.AVAILABLE, message: `HTTP ${s} — ${system} operante`, verdict };
  }
  return { status: CourtStatus.ERROR, message: `HTTP ${s}`, verdict };
}

/**
 * Sondagem funcional de um endpoint.
 *
 * Não basta o código HTTP: um PJe em manutenção devolve 200 com uma página de
 * aviso, e um WAF devolve 403 que nada diz sobre o tribunal. Por isso o corpo
 * é inspecionado contra a assinatura do sistema antes de decidir o estado.
 */
export async function checkCourt(url: string, system: CourtSystem): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

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
    const body = await readBounded(response);
    const latencyMs = elapsed();
    const avaliacao = evaluateBody(system, body);
    const decidido = classificarResposta(s, avaliacao, system);

    return { ...decidido, httpStatus: s, latencyMs };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const latencyMs = elapsed();
    if (message.includes('abort') || message.toLowerCase().includes('timeout')) {
      return { status: CourtStatus.ERROR, message: 'Timeout: sem resposta em 9s', latencyMs };
    }
    if (message.includes('SSL') || message.includes('certificate') || message.includes('CERT')) {
      return { status: CourtStatus.ERROR, message: 'Erro de certificado SSL', latencyMs };
    }
    if (message.includes('ECONNREFUSED')) {
      return { status: CourtStatus.UNAVAILABLE, message: 'Conexão recusada', latencyMs };
    }
    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return { status: CourtStatus.ERROR, message: 'DNS não resolvido', latencyMs };
    }
    return { status: CourtStatus.ERROR, message: message.slice(0, 80), latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}
