/**
 * Testes da classificação de resposta.
 *
 * Rodar:  npm run test:scraper
 *
 * É aqui que se decide se uma resposta vira "queda do tribunal" e, por
 * consequência, se pode virar certidão. O princípio sob teste: na dúvida a
 * culpa é nossa, porque atribuir ao tribunal uma indisponibilidade que não
 * houve produz prova falsa.
 */
import assert from 'node:assert/strict';
import { CourtStatus } from './courts.ts';
import { classificarResposta } from './scraper.ts';
import type { ProbeEvaluation } from './probes.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const ok: ProbeEvaluation = { verdict: 'FUNCTIONAL', matched: 'loginForm' };
const nada: ProbeEvaluation = { verdict: 'UNEXPECTED' };
const waf: ProbeEvaluation = { verdict: 'BLOCKED', matched: 'CloudFront bloqueou' };
const manut: ProbeEvaluation = { verdict: 'MAINTENANCE', matched: 'em manutenção' };

console.log('\nclassificação de resposta\n');

// --------------------------------------------------- culpa do tribunal
check('5xx é indisponibilidade do tribunal', () => {
  assert.equal(classificarResposta(503, nada, 'PJe').status, CourtStatus.UNAVAILABLE);
});

check('manutenção declarada é indisponibilidade, com qualquer código', () => {
  assert.equal(classificarResposta(200, manut, 'PJe').status, CourtStatus.UNAVAILABLE);
});

check('200 sem a tela esperada é degradado', () => {
  // Caso real do portal do TJRJ: responde 200 e aborta antes do corpo.
  assert.equal(classificarResposta(200, nada, 'Prop').status, CourtStatus.DEGRADED);
});

// ------------------------------------------------------- culpa nossa
check('WAF é bloqueio nosso', () => {
  assert.equal(classificarResposta(403, waf, 'PJe').status, CourtStatus.BLOCKED);
});

check('403 sem a tela do sistema é bloqueio nosso, não queda', () => {
  const r = classificarResposta(403, nada, 'PJe');
  assert.equal(r.status, CourtStatus.BLOCKED, 'não pode culpar o tribunal');
  assert.equal(r.verdict, 'BLOCKED');
});

check('400 sem a tela do sistema é bloqueio nosso', () => {
  // Caso real do TRT23 a partir do Vercel: 400 para IP de datacenter enquanto
  // o tribunal servia a página normalmente a um navegador comum.
  assert.equal(classificarResposta(400, nada, 'PJe').status, CourtStatus.BLOCKED);
});

check('405 sem a tela do sistema é bloqueio nosso', () => {
  // Caso real do TJSE eProc a partir do Vercel.
  assert.equal(classificarResposta(405, nada, 'eProc').status, CourtStatus.BLOCKED);
});

// ------------------------------------- códigos atípicos com tela presente
check('403 COM a tela do sistema é parede de autenticação, sistema no ar', () => {
  assert.equal(classificarResposta(403, ok, 'PJe').status, CourtStatus.AVAILABLE);
});

check('400 COM a tela do sistema é sistema no ar', () => {
  // eProc atrás do SSO do PDPJ responde 400 "Cookie not found" e está operante.
  assert.equal(classificarResposta(400, ok, 'eProc').status, CourtStatus.AVAILABLE);
});

// --------------------------------------------------------------- normais
check('200 com a tela esperada é disponível', () => {
  assert.equal(classificarResposta(200, ok, 'PJe').status, CourtStatus.AVAILABLE);
});

check('302 com a tela esperada é disponível', () => {
  assert.equal(classificarResposta(302, ok, 'eSAJ').status, CourtStatus.AVAILABLE);
});

// -------------------------------------------------------------- precedência
check('bloqueio precede 5xx', () => {
  // Se o WAF nos barrou, o 5xx pode ser da borda, não do tribunal.
  assert.equal(classificarResposta(503, waf, 'PJe').status, CourtStatus.BLOCKED);
});

check('manutenção precede o código de erro de requisição', () => {
  assert.equal(classificarResposta(400, manut, 'PJe').status, CourtStatus.UNAVAILABLE);
});

check('nenhum caminho devolve AVAILABLE sem tela ou 2xx', () => {
  // Rede de segurança: um falso "operante" é o pior erro possível aqui.
  for (const codigo of [400, 401, 403, 405, 406, 500, 502, 503]) {
    const r = classificarResposta(codigo, nada, 'PJe');
    assert.notEqual(r.status, CourtStatus.AVAILABLE, `HTTP ${codigo} não pode ser "disponível"`);
  }
});

console.log(`\n${passed} asserções passaram\n`);
