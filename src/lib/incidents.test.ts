/**
 * Testes da máquina de estado do ledger.
 *
 * Rodar:  npm run test:ledger
 *
 * Sem framework de propósito: o projeto ainda não tem um, e estas asserções
 * cobrem exatamente as regras que sustentam a certidão — confirmação por
 * N falhas e retroação do horário de início.
 */
import assert from 'node:assert/strict';
import { CourtStatus } from './courts.ts';
import type { CheckResult } from './scraper.ts';
import {
  recordCheck,
  listIncidents,
  getEvidence,
  CONFIRM_FAILURES,
  CONFIRM_RECOVERIES,
  atestavel,
} from './incidents.ts';

const down = (): CheckResult => ({
  status: CourtStatus.UNAVAILABLE,
  message: 'HTTP 503 — sistema com erro/manutenção',
  httpStatus: 503,
  latencyMs: 120,
});

const up = (): CheckResult => ({
  status: CourtStatus.AVAILABLE,
  message: 'HTTP 200 — sistema respondendo',
  httpStatus: 200,
  latencyMs: 80,
});

/** Instantes fixos de 1 em 1 minuto, para asserções determinísticas. */
const t = (minute: number) => new Date(Date.UTC(2026, 8, 13, 10, minute, 0));

let passed = 0;
const testes: [string, () => Promise<void>][] = [];
function check(name: string, fn: () => Promise<void>) {
  testes.push([name, fn]);
}

console.log('\nledger / anti-flap\n');

// ---------------------------------------------------------------- oscilação
check('falha isolada não abre incidente', async () => {
  const court = 'flap01';
  await recordCheck(court, down(), t(0));
  await recordCheck(court, up(), t(1));
  assert.equal((await listIncidents({ courtId: court })).length, 0);
});

check('falhas abaixo do limiar não abrem incidente', async () => {
  const court = 'flap02';
  for (let i = 0; i < CONFIRM_FAILURES - 1; i++) await recordCheck(court, down(), t(i));
  assert.equal((await listIncidents({ courtId: court })).length, 0);
});

check('sucesso no meio da sequência zera a contagem', async () => {
  const court = 'flap03';
  await recordCheck(court, down(), t(0));
  await recordCheck(court, down(), t(1));
  await recordCheck(court, up(), t(2));   // zera
  await recordCheck(court, down(), t(3));
  await recordCheck(court, down(), t(4));
  assert.equal((await listIncidents({ courtId: court })).length, 0);
});

// ------------------------------------------------------------- confirmação
check(`incidente abre na ${CONFIRM_FAILURES}ª falha seguida`, async () => {
  const court = 'open01';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  const found = await listIncidents({ courtId: court });
  assert.equal(found.length, 1);
  assert.equal(found[0].ended_at, null, 'deve estar aberto');
  assert.equal(found[0].kind, 'EXTERNA_BLOQUEANTE');
});

check('início é retroagido à primeira falha, não à confirmação', async () => {
  const court = 'open02';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  const [incident] = await listIncidents({ courtId: court });
  assert.equal(incident.started_at, t(0).toISOString(), 'started_at = 1ª falha');
  assert.equal(
    incident.confirmed_at,
    t(CONFIRM_FAILURES - 1).toISOString(),
    'confirmed_at = momento da confirmação'
  );
  assert.notEqual(incident.started_at, incident.confirmed_at);
});

check('evidência recolhe todas as falhas da sequência', async () => {
  const court = 'open03';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  const [incident] = await listIncidents({ courtId: court });
  assert.equal((await getEvidence(incident.id)).length, CONFIRM_FAILURES);
});

check('falha após abertura acumula evidência sem abrir novo incidente', async () => {
  const court = 'open04';
  for (let i = 0; i < CONFIRM_FAILURES + 2; i++) await recordCheck(court, down(), t(i));
  const found = await listIncidents({ courtId: court });
  assert.equal(found.length, 1, 'continua sendo um só incidente');
  assert.equal((await getEvidence(found[0].id)).length, CONFIRM_FAILURES + 2);
});

// ---------------------------------------------------------------- encerramento
check(`incidente fecha na ${CONFIRM_RECOVERIES}ª recuperação seguida`, async () => {
  const court = 'close01';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  for (let i = 0; i < CONFIRM_RECOVERIES; i++) {
    await recordCheck(court, up(), t(CONFIRM_FAILURES + i));
  }
  const [incident] = await listIncidents({ courtId: court });
  assert.notEqual(incident.ended_at, null, 'deve estar encerrado');
});

check('fim é retroagido ao primeiro sucesso', async () => {
  const court = 'close02';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  const firstOk = CONFIRM_FAILURES;
  for (let i = 0; i < CONFIRM_RECOVERIES; i++) await recordCheck(court, up(), t(firstOk + i));
  const [incident] = await listIncidents({ courtId: court });
  assert.equal(incident.ended_at, t(firstOk).toISOString(), 'ended_at = 1º sucesso');
});

check('uma recuperação isolada não encerra o incidente', async () => {
  const court = 'close03';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  await recordCheck(court, up(), t(CONFIRM_FAILURES));       // 1 só
  await recordCheck(court, down(), t(CONFIRM_FAILURES + 1)); // volta a cair
  const [incident] = await listIncidents({ courtId: court });
  assert.equal(incident.ended_at, null, 'segue aberto');
});

check('nova queda depois de encerrado abre um segundo incidente', async () => {
  const court = 'cycle01';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(i));
  for (let i = 0; i < CONFIRM_RECOVERIES; i++) await recordCheck(court, up(), t(10 + i));
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, down(), t(20 + i));
  const found = await listIncidents({ courtId: court });
  assert.equal(found.length, 2);
  assert.equal(found.filter((i) => i.ended_at === null).length, 1, 'só o novo está aberto');
});

// ------------------------------------------------------------ classificação
const timeout = (): CheckResult => ({
  status: CourtStatus.ERROR,
  message: 'Timeout: sem resposta em 9s',
  latencyMs: 9000,
});

check('timeout fica INDETERMINADA: de um ponto so nao se sabe de quem e a culpa', async () => {
  const court = 'kind01';
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, timeout(), t(i));
  const [inc] = await listIncidents({ courtId: court });
  assert.equal(inc.kind, 'INDETERMINADA');
  assert.equal(atestavel(inc.kind), false, 'nao pode virar certidao sem corroboracao');
});

check('tela ausente com 200 segue sendo instabilidade do tribunal', async () => {
  const court = 'kind02';
  const degradado = (): CheckResult => ({
    status: CourtStatus.DEGRADED, message: 'respondeu sem a tela esperada', httpStatus: 200, latencyMs: 300,
  });
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, degradado(), t(i));
  const [inc] = await listIncidents({ courtId: court });
  assert.equal(inc.kind, 'EXTERNA');
  assert.equal(atestavel(inc.kind), true);
});

// --------------------------------------------------- reclassificacao em curso
check('incidente aberto e reclassificado quando a culpa se revela nossa', async () => {
  const court = 'recl01';
  const queda = (): CheckResult => ({
    status: CourtStatus.UNAVAILABLE, message: 'HTTP 503', httpStatus: 503, latencyMs: 10,
  });
  const bloqueio = (): CheckResult => ({
    status: CourtStatus.BLOCKED, message: 'HTTP 400 — requisicao recusada', httpStatus: 400, latencyMs: 10,
  });
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, queda(), t(i));
  assert.equal((await listIncidents({ courtId: court }))[0].kind, 'EXTERNA_BLOQUEANTE');

  await recordCheck(court, bloqueio(), t(CONFIRM_FAILURES));
  const [depois] = await listIncidents({ courtId: court });
  assert.equal(depois.kind, 'INTERNA', 'deve seguir a observacao mais recente');
  assert.equal(atestavel(depois.kind), false, 'deve deixar de oferecer certidao');
});

check('reclassificacao nao anda para tras', async () => {
  const court = 'recl02';
  const bloqueio = (): CheckResult => ({
    status: CourtStatus.BLOCKED, message: 'WAF', httpStatus: 403, latencyMs: 10,
  });
  const queda = (): CheckResult => ({
    status: CourtStatus.UNAVAILABLE, message: 'HTTP 503', httpStatus: 503, latencyMs: 10,
  });
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(court, bloqueio(), t(i));
  await recordCheck(court, queda(), t(CONFIRM_FAILURES));
  const [inc] = await listIncidents({ courtId: court });
  assert.equal(inc.kind, 'INTERNA', 'culpa nossa ja estabelecida nao vira culpa do tribunal');
});

check('endpoint restrito não gera observação nem incidente', async () => {
  const court = 'restr01';
  const restricted: CheckResult = {
    status: CourtStatus.RESTRICTED,
    message: 'Acesso restrito a IPs externos',
    latencyMs: 0,
  };
  for (let i = 0; i < CONFIRM_FAILURES + 3; i++) await recordCheck(court, restricted, t(i));
  assert.equal((await listIncidents({ courtId: court })).length, 0);
});

// ---------------------------------------------------------------- filtros
check('filtro open separa abertos de encerrados', async () => {
  const abertos = await listIncidents({ open: true });
  const fechados = await listIncidents({ open: false });
  assert.ok(abertos.every((i) => i.ended_at === null));
  assert.ok(fechados.every((i) => i.ended_at !== null));
});

async function main() {
  for (const [nome, fn] of testes) {
    await fn();
    passed++;
    console.log(`  ok  ${nome}`);
  }
  console.log(`
${passed} asserções passaram
`);
}
main();
