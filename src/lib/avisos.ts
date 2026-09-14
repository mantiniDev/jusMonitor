import { createHash } from 'node:crypto';
import { consultar, consultarUm, executar } from './db';

/**
 * Fonte de indisponibilidade DECLARADA: as páginas em que os próprios tribunais
 * publicam manutenções e quedas.
 *
 * Complementa a sondagem, que mede o que está fora agora. Uma queda que nós
 * medimos e que o tribunal também anunciou sustenta uma certidão bem mais forte
 * do que a nossa medição isolada.
 *
 * O catálogo abaixo contém apenas endereços verificados: cada um respondeu e
 * apresentou conteúdo sobre indisponibilidade ou manutenção. Endereços
 * adivinhados por padrão de URL foram descartados — um 404 silencioso viraria
 * "nenhum aviso encontrado", que é pior do que cobertura menor e honesta.
 */
export interface FonteAviso {
  acronym: string;
  nome: string;
  url: string;
}

export const FONTES_AVISO: FonteAviso[] = [
  { acronym: 'TSE',    nome: 'Tribunal Superior Eleitoral',  url: 'https://www.tse.jus.br/servicos-judiciais/processos/processo-judicial-eletronico/situacao-atual-dos-servicos-digitais-do-tse' },
  { acronym: 'TJSP',   nome: 'TJ de São Paulo',              url: 'https://www.tjsp.jus.br/Indisponibilidade/Comunicados' },
  { acronym: 'TJPE',   nome: 'TJ de Pernambuco',             url: 'https://www.tjpe.jus.br/pje/indisponibilidade-do-pje' },
  { acronym: 'TRT1',   nome: 'TRT 1ª Região (RJ)',           url: 'https://www.trt1.jus.br/certidao-de-indisponibilidade' },
  { acronym: 'TRT3',   nome: 'TRT 3ª Região (MG)',           url: 'https://portal.trt3.jus.br/internet/servicos/pje/indisponibilidade-do-sistema' },
  { acronym: 'TRT4',   nome: 'TRT 4ª Região (RS)',           url: 'https://www.trt4.jus.br/portais/trt4/pje-indisponibilidade' },
  { acronym: 'TRT5',   nome: 'TRT 5ª Região (BA)',           url: 'https://portalpje.trt5.jus.br/pje-indisponibilidades' },
  { acronym: 'TRT8',   nome: 'TRT 8ª Região (PA/AP)',        url: 'https://www.trt8.jus.br/pje/indisponibilidade-do-sistema' },
  { acronym: 'TRT19',  nome: 'TRT 19ª Região (AL)',          url: 'https://www.trt19.jus.br/pje/indisponibilidade-do-sistema' },
  { acronym: 'TRT24',  nome: 'TRT 24ª Região (MS)',          url: 'https://www.trt24.jus.br/pje/indisponibilidade-do-sistema' },
  { acronym: 'TRE-SP', nome: 'TRE de São Paulo',             url: 'https://www.tre-sp.jus.br/servicos-judiciais/indisponibilidade-pje' },
  { acronym: 'TRE-MG', nome: 'TRE de Minas Gerais',          url: 'https://www.tre-mg.jus.br/servicos-judiciais/processo-judicial-eletronico-pje/indisponibilidade-do-sistema-pje' },
];

export interface Janela {
  inicio: string | null;
  fim: string | null;
  trecho: string;
}

export interface AvisoRow {
  id: number;
  acronym: string;
  url: string;
  captured_at: string;
  http_status: number | null;
  ok: number;
  content_hash: string | null;
  excerpt: string | null;
  janelas: string | null;
  erro: string | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function textoVisivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Data COM hora obrigatória: "08/09/2026 00:00", "08/05/2026 às 17h32".
 *
 * Exigir a hora é deliberado. Um aviso sem horário não delimita a janela, e o
 * produto inteiro se apoia em hora certa — aceitar "dia 8" como início
 * produziria uma janela de 24h que casaria com qualquer incidente daquele dia.
 */
const DATA_HORA = String.raw`(\d{1,2})\/(\d{1,2})\/(\d{4})[\s,]*(?:às|as|a partir das|até às|até as|[-–])?\s*(\d{1,2})\s*[h:]\s*(\d{2})`;

/**
 * `indispon` cobre tanto "indisponibilidade" quanto "indisponível" — radicais
 * diferentes que aparecem lado a lado nos avisos. Um padrão mais específico
 * deixaria metade dos comunicados passar em branco.
 */
const PALAVRA_CHAVE = /indispon|manuten|instabilidade|interrup|paralisa/gi;

/** Quanto texto olhar em volta da palavra-chave. Menor = menos lixo de menu. */
const RAIO = 260;

/** Janela maior que isto quase certamente é lixo de parser, não manutenção. */
const DURACAO_MAX_MS = 7 * 24 * 3600 * 1000;

/**
 * Limpa o ruído estrutural das páginas de portal: avisos de JavaScript,
 * paginação e trilhas de menu. Este texto é transcrito na certidão, e um
 * trecho com "Pesquisar: 1 2 3 4 5" num documento levado aos autos destrói
 * a credibilidade do resto.
 */
function limparTrecho(t: string): string {
  return t
    .replace(/JavaScript[^.!?]{0,160}?(recarregar|habilitad[oa])[!.]?/gi, ' ')
    .replace(/(?:\b\d{1,2}\b[\s|]+){4,}/g, ' ')
    .replace(/\b(?:Pesquisar|Ir para o (?:conte[úu]do|menu|busca)|Acesso R[áa]pido|skip-to-content)\b:?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Recorta o texto em volta das datas — não da palavra-chave — porque são elas
 * que carregam o fato. Respeita fronteira de palavra para não entregar um
 * trecho começando no meio de um termo.
 */
function recortarTrecho(bruto: string, posIni: number, posFim: number): string {
  const ini = Math.max(0, posIni - 100);
  const fim = Math.min(bruto.length, posFim + 100);
  let t = bruto.slice(ini, fim);
  if (ini > 0) t = t.replace(/^\S*\s+/, '');
  if (fim < bruto.length) t = t.replace(/\s+\S*$/, '');
  return limparTrecho(t).slice(0, 300);
}

function montarISO(d: string, m: string, a: string, h: string, min: string): string | null {
  const dia = Number(d), mes = Number(m), ano = Number(a), hora = Number(h), mi = Number(min);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || mi > 59) return null;
  if (ano < 2015 || ano > new Date().getFullYear() + 1) return null;
  // Horário de Brasília.
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00-03:00`;
}

/**
 * Extrai janelas de indisponibilidade declaradas no texto.
 *
 * Cada tribunal escreve o aviso à sua maneira, e cobrir 60 formatos produziria
 * mais erro do que acerto. A extração é deliberadamente restritiva: só aceita
 * um par início/fim, ambos com hora, próximos de uma palavra-chave e coerentes
 * entre si. O que não passa nesse filtro fica só como trecho para leitura
 * humana — uma janela errada reclassificaria um incidente como manutenção
 * programada e anexaria comunicado falso a uma certidão.
 */
export function extrairJanelas(texto: string): Janela[] {
  const janelas: Janela[] = [];
  const vistos = new Set<string>();

  PALAVRA_CHAVE.lastIndex = 0;
  let chave: RegExpExecArray | null;

  while ((chave = PALAVRA_CHAVE.exec(texto)) !== null) {
    const ini = Math.max(0, chave.index - RAIO);
    const trechoBruto = texto.slice(ini, chave.index + RAIO);

    const achados = [...trechoBruto.matchAll(new RegExp(DATA_HORA, 'g'))];
    if (achados.length < 2) continue; // sem par não há janela delimitada

    const a = montarISO(achados[0][1], achados[0][2], achados[0][3], achados[0][4], achados[0][5]);
    const b = montarISO(achados[1][1], achados[1][2], achados[1][3], achados[1][4], achados[1][5]);
    if (!a || !b) continue;

    const tA = new Date(a).getTime();
    const tB = new Date(b).getTime();
    // Fim anterior ao início, ou janela absurdamente longa: é ruído de parser.
    if (tB <= tA || tB - tA > DURACAO_MAX_MS) continue;

    const assinatura = `${a}|${b}`;
    if (vistos.has(assinatura)) continue;
    vistos.add(assinatura);

    const posIni = achados[0].index ?? 0;
    const posFim = (achados[1].index ?? posIni) + achados[1][0].length;
    janelas.push({ inicio: a, fim: b, trecho: recortarTrecho(trechoBruto, posIni, posFim) });
    if (janelas.length >= 20) break;
  }

  return janelas;
}

/** Trecho da página que menciona indisponibilidade, para leitura humana. */
export function extrairResumo(texto: string): string {
  const frases = texto.split(/(?<=[.;!?])\s+/).filter((f) => /indispon|manuten|interrup|fora do ar/i.test(f));
  return frases.slice(0, 6).join(' ').slice(0, 1200);
}

export interface CapturaAviso {
  acronym: string;
  url: string;
  ok: boolean;
  httpStatus?: number;
  excerpt?: string;
  janelas: Janela[];
  hash?: string;
  erro?: string;
  mudou: boolean;
}

async function capturar(fonte: FonteAviso): Promise<CapturaAviso> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const res = await fetch(fonte.url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: ac.signal,
    });
    const html = await res.text();

    if (res.status >= 400) {
      return { acronym: fonte.acronym, url: fonte.url, ok: false, httpStatus: res.status, janelas: [], mudou: false, erro: `HTTP ${res.status}` };
    }

    const texto = textoVisivel(html);
    const excerpt = extrairResumo(texto);
    const janelas = extrairJanelas(texto);
    const hash = createHash('sha256').update(excerpt).digest('hex');

    return { acronym: fonte.acronym, url: fonte.url, ok: true, httpStatus: res.status, excerpt, janelas, hash, mudou: false };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    return { acronym: fonte.acronym, url: fonte.url, ok: false, janelas: [], mudou: false, erro: erro.slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function ultimoHash(acronym: string): Promise<string | null> {
  const row = await consultarUm<{ content_hash: string | null }>(
    'SELECT content_hash FROM avisos WHERE acronym = ? ORDER BY captured_at DESC LIMIT 1',
    [acronym]
  );
  return row?.content_hash ?? null;
}

/**
 * Varre as páginas oficiais e grava as capturas.
 *
 * Só grava quando o conteúdo muda: o valor operacional está na mudança — um
 * aviso novo apareceu — e não em reescrever a mesma página a cada hora.
 */
export async function varrerAvisos(): Promise<{ capturas: CapturaAviso[]; novos: number; falhas: number }> {
  const capturas: CapturaAviso[] = [];

  // Poucos alvos e servidores de portal costumam ser lentos: 4 por vez basta.
  const fila = [...FONTES_AVISO];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, fila.length) }, async () => {
      while (cursor < fila.length) {
        capturas.push(await capturar(fila[cursor++]));
      }
    })
  );

  let novos = 0;
  for (const c of capturas) {
    const anterior = await ultimoHash(c.acronym);
    c.mudou = c.ok ? c.hash !== anterior : false;
    if (!c.ok || c.mudou) {
      await executar(
        `INSERT INTO avisos (acronym, url, captured_at, http_status, ok, content_hash, excerpt, janelas, erro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.acronym, c.url, new Date().toISOString(), c.httpStatus ?? null,
          c.ok ? 1 : 0, c.hash ?? null, c.excerpt ?? null,
          c.janelas.length ? JSON.stringify(c.janelas) : null, c.erro ?? null,
        ]
      );
      if (c.mudou) novos++;
    }
  }

  return { capturas, novos, falhas: capturas.filter((c) => !c.ok).length };
}

/** Última captura de cada fonte, para o painel. */
export async function ultimasCapturas(): Promise<(AvisoRow & { janelasParsed: Janela[] })[]> {
  const rows = await consultar<AvisoRow>(
    `SELECT a.* FROM avisos a
      JOIN (SELECT acronym, MAX(captured_at) AS m FROM avisos GROUP BY acronym) u
        ON a.acronym = u.acronym AND a.captured_at = u.m`
  );

  return rows.map((r) => ({
    ...r,
    janelasParsed: r.janelas ? (JSON.parse(r.janelas) as Janela[]) : [],
  }));
}
