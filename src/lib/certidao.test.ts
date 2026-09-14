/**
 * Testes da certidão.
 *
 * Rodar:  npm run test:certidao
 *
 * A asserção que mais importa é a recusa de incidentes INTERNA: se um bloqueio
 * de WAF virasse certidão, estaríamos atestando queda de um tribunal que pode
 * ter permanecido no ar o tempo todo.
 */
import assert from 'node:assert/strict';
import { CourtStatus } from './courts.ts';
import type { CheckResult } from './scraper.ts';
import { recordCheck, listIncidents, CONFIRM_FAILURES, CONFIRM_RECOVERIES } from './incidents.ts';
import { emitirCertidao, CertidaoRecusada } from './certidao.ts';
import { certidaoHtml } from './certidaoHtml.ts';

let passed = 0;
const testes: [string, () => Promise<void>][] = [];
function check(name: string, fn: () => Promise<void>) {
  testes.push([name, fn]);
}

const t = (min: number) => new Date(Date.UTC(2026, 8, 13, 20, min, 0));

const queda = (): CheckResult => ({
  status: CourtStatus.UNAVAILABLE, message: 'HTTP 503 — sistema com erro', httpStatus: 503, latencyMs: 140,
});
const bloqueio = (): CheckResult => ({
  status: CourtStatus.BLOCKED, message: 'Bloqueio de acesso — CloudFront bloqueou', httpStatus: 403, latencyMs: 60,
});
const normal = (): CheckResult => ({
  status: CourtStatus.AVAILABLE, message: 'HTTP 200 — PJe operante', httpStatus: 200, latencyMs: 90,
});

/** Abre (e opcionalmente encerra) um incidente, devolvendo seu id. */
async function criarIncidente(courtId: string, falha: () => CheckResult, encerrar = false): Promise<number> {
  for (let i = 0; i < CONFIRM_FAILURES; i++) await recordCheck(courtId, falha(), t(i));
  if (encerrar) {
    for (let i = 0; i < CONFIRM_RECOVERIES; i++) await recordCheck(courtId, normal(), t(CONFIRM_FAILURES + i));
  }
  return (await listIncidents({ courtId }))[0].id;
}

console.log('\ncertidão\n');

// ------------------------------------------------------------------ recusas
check('incidente INTERNA (bloqueio nosso) é recusado', async () => {
  const id = await criarIncidente('t01', bloqueio, true);
  await assert.rejects(
    () => emitirCertidao(id),
    (e: unknown) => e instanceof CertidaoRecusada && e.motivo === 'FALHA_INTERNA'
  );
});

check('incidente inexistente é recusado', async () => {
  await assert.rejects(
    () => emitirCertidao(999999),
    (e: unknown) => e instanceof CertidaoRecusada && e.motivo === 'NAO_ENCONTRADO'
  );
});

// ------------------------------------------------------------------ emissão
check('incidente externo encerrado gera certidão', async () => {
  const id = await criarIncidente('t03', queda, true);
  const c = await emitirCertidao(id);
  assert.equal(c.tribunal, 'TRT2');
  assert.equal(c.emCurso, false);
  assert.ok(c.observacoes.length >= CONFIRM_FAILURES);
});

check('horários saem em Brasília, não em UTC', async () => {
  const id = await criarIncidente('t05', queda, true);
  const c = await emitirCertidao(id);
  // 20:00 UTC = 17:00 em Brasília (UTC-3)
  assert.match(c.inicio, /13\/09\/2026,? 17:00:00/, `esperado 17:00, veio "${c.inicio}"`);
  assert.equal(c.inicioISO, t(0).toISOString(), 'o ISO original é preservado');
});

check('duração é calculada em minutos', async () => {
  const id = await criarIncidente('t07', queda, true);
  const c = await emitirCertidao(id);
  // início em t(0), fim no primeiro sucesso em t(CONFIRM_FAILURES)
  assert.equal(c.duracaoMinutos, CONFIRM_FAILURES);
});

check('incidente em curso é marcado e ressalvado', async () => {
  const id = await criarIncidente('t09', queda, false);
  const c = await emitirCertidao(id);
  assert.equal(c.emCurso, true);
  assert.equal(c.fim, null);
  assert.ok(
    c.ressalvas.some((r) => /em curso/i.test(r)),
    'deve advertir que não houve normalização'
  );
});

check('natureza distingue queda de instabilidade', async () => {
  const idQueda = await criarIncidente('t11', queda, true);
  const instavel = (): CheckResult => ({
    status: CourtStatus.DEGRADED, message: 'respondeu sem a tela esperada', httpStatus: 200, latencyMs: 300,
  });
  const idInstavel = await criarIncidente('t13', instavel, true);

  assert.match((await emitirCertidao(idQueda)).natureza, /não foram atendidas|erro de servidor/i);
  assert.match((await emitirCertidao(idInstavel)).natureza, /instabilidade/i);
});

// ------------------------------------------------------------------ integridade
check('hash é determinístico entre emissões', async () => {
  const id = await criarIncidente('t15', queda, true);
  assert.equal((await emitirCertidao(id)).hash, (await emitirCertidao(id)).hash);
});

check('incidentes distintos produzem hashes distintos', async () => {
  const a = await criarIncidente('t17', queda, true);
  const b = await criarIncidente('t19', queda, true);
  assert.notEqual((await emitirCertidao(a)).hash, (await emitirCertidao(b)).hash);
});

check('hash tem formato SHA-256', async () => {
  const id = await criarIncidente('t21', queda, true);
  assert.match((await emitirCertidao(id)).hash, /^[0-9a-f]{64}$/);
});

// ------------------------------------------------------------------ conteúdo
check('certidão não emite juízo sobre prazo', async () => {
  const id = await criarIncidente('t23', queda, true);
  const c = await emitirCertidao(id);
  assert.ok(
    c.ressalvas.some((r) => /não contém juízo sobre a contagem/i.test(r)),
    'a ressalva de não-conclusão jurídica é obrigatória'
  );
});

check('metodologia declara o limiar de confirmação', async () => {
  const id = await criarIncidente('t25', queda, true);
  const c = await emitirCertidao(id);
  assert.ok(c.metodologia.some((m) => m.includes(String(CONFIRM_FAILURES))));
});

// ------------------------------------------------------------------ HTML
check('HTML contém número, período e hash', async () => {
  const id = await criarIncidente('t27', queda, true);
  const c = await emitirCertidao(id);
  const html = certidaoHtml(c);
  assert.ok(html.includes(c.numero));
  assert.ok(html.includes(c.hash));
  assert.ok(html.includes(c.inicio));
});

check('HTML escapa conteúdo para não injetar marcação', async () => {
  const id = await criarIncidente('t29', () => ({
    status: CourtStatus.UNAVAILABLE,
    message: '<script>alert(1)</script>',
    httpStatus: 503,
    latencyMs: 10,
  }), true);
  const html = certidaoHtml(await emitirCertidao(id));
  assert.ok(!html.includes('<script>alert(1)</script>'), 'a tag não pode sair crua');
  assert.ok(html.includes('&lt;script&gt;'), 'deve sair escapada');
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
