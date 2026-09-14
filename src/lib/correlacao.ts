import { consultar, executar } from './db';
import { COURTS } from './courts';
import { listIncidents } from './incidents';
import type { AvisoRow, Janela } from './avisos';

/**
 * Cruza o que medimos com o que o tribunal declarou.
 *
 * Quando um incidente observado cai dentro de uma janela anunciada pelo próprio
 * tribunal, ele é reclassificado como PROGRAMADA e o aviso fica vinculado como
 * evidência. É a diferença entre "nós dizemos que caiu" e "nós medimos a queda
 * e o tribunal a anunciou" — e essa segunda frase é a que sustenta uma petição.
 */

/** Tolerância nas bordas: avisos raramente batem no minuto com a queda real. */
const FOLGA_MS = 30 * 60 * 1000;

export interface Vinculo {
  incidentId: number;
  avisoId: number;
  acronym: string;
  trecho: string;
}

function sobrepoe(
  incIni: number, incFim: number,
  janIni: number | null, janFim: number | null
): boolean {
  if (janIni === null) return false;
  // Janela sem fim declarado: considera-se o próprio dia anunciado.
  const fim = janFim ?? janIni + 24 * 3600 * 1000;
  return incIni <= fim + FOLGA_MS && incFim >= janIni - FOLGA_MS;
}

/**
 * Reclassifica incidentes cobertos por aviso oficial.
 * Retorna os vínculos criados nesta passagem.
 */
export async function correlacionar(dias = 30): Promise<Vinculo[]> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const avisos = await consultar<AvisoRow>(
    'SELECT * FROM avisos WHERE ok = 1 AND janelas IS NOT NULL AND captured_at >= ?',
    [desde]
  );

  if (avisos.length === 0) return [];

  const porSigla = new Map<string, AvisoRow[]>();
  for (const a of avisos) {
    const lista = porSigla.get(a.acronym) ?? [];
    lista.push(a);
    porSigla.set(a.acronym, lista);
  }

  const siglaDe = new Map(COURTS.map((c) => [c.id, c.acronym]));
  const incidentes = await listIncidents({ since: desde, limit: 1000 });
  const agora = Date.now();
  const vinculos: Vinculo[] = [];

  for (const inc of incidentes) {
    // Falha nossa não vira manutenção programada do tribunal.
    if (inc.kind === 'INTERNA') continue;

    const sigla = siglaDe.get(inc.court_id);
    if (!sigla) continue;
    const candidatos = porSigla.get(sigla);
    if (!candidatos) continue;

    const incIni = new Date(inc.started_at).getTime();
    const incFim = inc.ended_at ? new Date(inc.ended_at).getTime() : agora;

    for (const aviso of candidatos) {
      const janelas: Janela[] = aviso.janelas ? JSON.parse(aviso.janelas) : [];
      const casada = janelas.find((j) =>
        sobrepoe(
          incIni, incFim,
          j.inicio ? new Date(j.inicio).getTime() : null,
          j.fim ? new Date(j.fim).getTime() : null
        )
      );
      if (!casada) continue;

      const info = await executar(
        'INSERT OR IGNORE INTO incidente_aviso (incident_id, aviso_id, trecho) VALUES (?, ?, ?)',
        [inc.id, aviso.id, casada.trecho]
      );

      if (info.rowsAffected > 0) {
        await executar("UPDATE incidents SET kind = 'PROGRAMADA' WHERE id = ?", [inc.id]);
        vinculos.push({ incidentId: inc.id, avisoId: aviso.id, acronym: sigla, trecho: casada.trecho });
      }
      break;
    }
  }

  return vinculos;
}

export interface AvisoVinculado {
  avisoId: number;
  acronym: string;
  url: string;
  capturedAt: string;
  trecho: string;
}

/** Avisos oficiais vinculados a um incidente — entram na certidão como reforço. */
export async function avisosDoIncidente(incidentId: number): Promise<AvisoVinculado[]> {
  const rows = await consultar<AvisoVinculado>(
    `SELECT a.id AS avisoId, a.acronym, a.url, a.captured_at AS capturedAt, ia.trecho
       FROM incidente_aviso ia
       JOIN avisos a ON a.id = ia.aviso_id
      WHERE ia.incident_id = ?
      ORDER BY a.captured_at DESC`,
    [incidentId]
  );
  return rows.map((r) => ({ ...r }));
}
