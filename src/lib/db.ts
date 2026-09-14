import { createClient, type Client, type InValue } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Acesso ao banco via libSQL.
 *
 * O mesmo cliente fala com arquivo local (`file:`) e com Turso hospedado, então
 * desenvolvimento e produção usam exatamente este código. A escolha existe
 * porque o Vercel roda em sistema de arquivos somente leitura: sem banco
 * hospedado, o ledger não persistiria e a certidão ficaria sem evidência.
 */

/** Erro de configuração, não de programação: merece resposta explicativa. */
export class BancoIndisponivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'BancoIndisponivel';
  }
}

const LOCAL_PATH = path.join(process.cwd(), 'data', 'jusmonitor.db');

function resolverUrl(): string {
  if (process.env.LIBSQL_URL) return process.env.LIBSQL_URL;
  if (process.env.JUSMONITOR_DB_PATH) return `file:${path.resolve(process.env.JUSMONITOR_DB_PATH)}`;
  return `file:${LOCAL_PATH}`;
}

/** Só faz sentido em arquivo local; no Turso a durabilidade é do serviço. */
const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

const SCHEMA = `
-- Toda observação individual de um endpoint. É a matéria-prima da evidência.
CREATE TABLE IF NOT EXISTS checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id    TEXT    NOT NULL,
  checked_at  TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  ok          INTEGER NOT NULL,
  http_status INTEGER,
  latency_ms  INTEGER,
  message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_checks_court_time ON checks (court_id, checked_at DESC);

-- Um incidente só nasce depois de confirmado pelo anti-flap.
-- started_at é retroagido à PRIMEIRA falha da sequência, não ao momento da
-- confirmação: para prova de prazo, a indisponibilidade começou quando o
-- sistema caiu, não quando nós concluímos que ele havia caído.
CREATE TABLE IF NOT EXISTS incidents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  court_id      TEXT    NOT NULL,
  kind          TEXT    NOT NULL,
  status        TEXT    NOT NULL,
  started_at    TEXT    NOT NULL,
  confirmed_at  TEXT    NOT NULL,
  ended_at      TEXT,
  closed_at     TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_message  TEXT
);
CREATE INDEX IF NOT EXISTS idx_incidents_court ON incidents (court_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_open  ON incidents (ended_at);

-- Cada observação que sustenta o incidente. É isso que vira certidão.
CREATE TABLE IF NOT EXISTS incident_evidence (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  observed_at TEXT    NOT NULL,
  status      TEXT    NOT NULL,
  http_status INTEGER,
  latency_ms  INTEGER,
  message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_incident ON incident_evidence (incident_id, observed_at);

-- Capturas das páginas oficiais de indisponibilidade dos tribunais.
-- Fonte independente da sondagem: aqui está o que o tribunal DECLARA, contra o
-- que nós MEDIMOS. Uma queda que aparece nas duas fontes é prova bem mais forte.
CREATE TABLE IF NOT EXISTS avisos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  acronym      TEXT    NOT NULL,
  url          TEXT    NOT NULL,
  captured_at  TEXT    NOT NULL,
  http_status  INTEGER,
  ok           INTEGER NOT NULL,
  content_hash TEXT,
  excerpt      TEXT,
  janelas      TEXT,
  erro         TEXT
);
CREATE INDEX IF NOT EXISTS idx_avisos_acronym ON avisos (acronym, captured_at DESC);

-- Liga o incidente que MEDIMOS ao aviso que o tribunal PUBLICOU.
CREATE TABLE IF NOT EXISTS incidente_aviso (
  incident_id INTEGER NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  aviso_id    INTEGER NOT NULL REFERENCES avisos (id)    ON DELETE CASCADE,
  trecho      TEXT,
  PRIMARY KEY (incident_id, aviso_id)
);

-- Estado do anti-flap por endpoint. Persistido para que um restart não zere a sequência.
CREATE TABLE IF NOT EXISTS court_state (
  court_id         TEXT PRIMARY KEY,
  fail_streak      INTEGER NOT NULL DEFAULT 0,
  ok_streak        INTEGER NOT NULL DEFAULT 0,
  first_fail_at    TEXT,
  first_ok_at      TEXT,
  open_incident_id INTEGER,
  last_status      TEXT,
  last_checked_at  TEXT,
  last_message     TEXT
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __jusMonitorDb: Promise<Client> | undefined;
}

async function abrir(): Promise<Client> {
  const url = resolverUrl();

  if (url.startsWith('file:')) {
    try {
      mkdirSync(path.dirname(url.slice(5)), { recursive: true });
    } catch (e) {
      // Caso típico do Vercel: disco somente leitura. Sem esta mensagem o
      // sintoma seria um 500 opaco em toda rota que toca o banco.
      throw new BancoIndisponivel(
        'Não há banco gravável. Em hospedagem serverless o disco é somente leitura: ' +
          'defina LIBSQL_URL e LIBSQL_AUTH_TOKEN apontando para um banco libSQL/Turso. ' +
          `Detalhe: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  const client = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });

  // PRAGMA não se aplica ao Turso remoto e faria a conexão falhar à toa.
  if (url.startsWith('file:')) {
    await client.executeMultiple(PRAGMAS);
  }
  await client.executeMultiple(SCHEMA);

  return client;
}

/**
 * Conexão única. Em dev o Next recarrega módulos a cada edição, então guardamos
 * a promessa no globalThis para não abrir uma conexão nova a cada hot reload.
 */
export function getDb(): Promise<Client> {
  if (!globalThis.__jusMonitorDb) {
    globalThis.__jusMonitorDb = abrir();
  }
  return globalThis.__jusMonitorDb;
}

export type Arg = InValue;

/** Executa e devolve as linhas já tipadas conforme o schema. */
export async function consultar<T>(sql: string, args: Arg[] = []): Promise<T[]> {
  const db = await getDb();
  const r = await db.execute({ sql, args });
  return r.rows as unknown as T[];
}

/** Executa e devolve a primeira linha, ou null. */
export async function consultarUm<T>(sql: string, args: Arg[] = []): Promise<T | null> {
  const linhas = await consultar<T>(sql, args);
  return linhas[0] ?? null;
}

export interface Escrita {
  rowsAffected: number;
  lastInsertRowid: number | null;
}

export async function executar(sql: string, args: Arg[] = []): Promise<Escrita> {
  const db = await getDb();
  const r = await db.execute({ sql, args });
  return {
    rowsAffected: r.rowsAffected,
    lastInsertRowid: r.lastInsertRowid === undefined ? null : Number(r.lastInsertRowid),
  };
}
