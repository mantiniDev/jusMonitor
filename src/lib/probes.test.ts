/**
 * Testes da sondagem funcional.
 *
 * Rodar:  npm run test:probes
 *
 * O caso que dá sentido ao módulo é o da manutenção com HTTP 200: a checagem
 * antiga daria "disponível" e o ledger registraria operação normal durante
 * uma queda real.
 */
import assert from 'node:assert/strict';
import { evaluateBody } from './probes.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const html = (inner: string) => `<!DOCTYPE html><html><head><title>t</title></head><body>${inner}</body></html>`;

console.log('\nprobe funcional\n');

// ------------------------------------------------------------- telas boas
check('PJe: tela de login é funcional', () => {
  const body = html(`<form id="loginForm"><input name="j_username"><input name="j_password"></form>`);
  assert.equal(evaluateBody('PJe', body).verdict, 'FUNCTIONAL');
});

check('PJe: SSO Keycloak é funcional', () => {
  const body = html(`<div id="kc-form-login"><input id="username"><input id="password"></div>`);
  assert.equal(evaluateBody('PJe', body).verdict, 'FUNCTIONAL');
});

check('eProc: tela de login é funcional', () => {
  const body = html(`<form action="externo_controlador.php"><input id="txtUsuario"><input id="pwdSenha"></form>`);
  assert.equal(evaluateBody('eProc', body).verdict, 'FUNCTIONAL');
});

check('eSAJ: tela de login é funcional', () => {
  const body = html(`<form action="/sajcas/j_spring_cas_security_check">Identificação do Usuário</form>`);
  assert.equal(evaluateBody('eSAJ', body).verdict, 'FUNCTIONAL');
});

check('Projudi: tela de login é funcional', () => {
  const body = html(`<form name="formLogin">Projudi - login e senha</form>`);
  assert.equal(evaluateBody('Projudi', body).verdict, 'FUNCTIONAL');
});

// ------------------------------------------------- manutenção com HTTP 200
check('PJe em manutenção NÃO é funcional, mesmo contendo "PJe"', () => {
  const body = html(`<h1>PJe - Processo Judicial Eletrônico</h1><p>Sistema em manutenção programada.</p>`);
  const r = evaluateBody('PJe', body);
  assert.equal(r.verdict, 'MAINTENANCE', 'manutenção precede o marcador positivo');
});

check('"sistema indisponível" é manutenção', () => {
  assert.equal(evaluateBody('eProc', html('<p>O sistema está indisponível no momento.</p>')).verdict, 'MAINTENANCE');
});

check('"fora do ar" é manutenção', () => {
  assert.equal(evaluateBody('eSAJ', html('<p>Servidor fora do ar</p>')).verdict, 'MAINTENANCE');
});

check('Service Unavailable é manutenção', () => {
  assert.equal(evaluateBody('PJe', html('<h1>Service Unavailable</h1>')).verdict, 'MAINTENANCE');
});

check('Bad Gateway é manutenção', () => {
  assert.equal(evaluateBody('PJe', html('<h1>502 Bad Gateway</h1>')).verdict, 'MAINTENANCE');
});

// ------------------------------------------------ proeminência da manutenção
check('manutenção no <title> conta', () => {
  const body = `<html><head><title>Sistema em manutenção</title></head><body>${'x '.repeat(3000)}</body></html>`;
  assert.equal(evaluateBody('eProc', body).verdict, 'MAINTENANCE');
});

check('manutenção em <h1> conta', () => {
  const body = `<html><head><title>TJ</title></head><body><h1>Sistema indisponível</h1>${'x '.repeat(3000)}</body></html>`;
  assert.equal(evaluateBody('eSAJ', body).verdict, 'MAINTENANCE');
});

check('portal grande que só MENCIONA "fora do ar" não é manutenção', () => {
  // Caso real do TJSE: portal funcionando que cita a frase numa notícia.
  const noticias = 'Confira as últimas notícias do tribunal. '.repeat(120);
  const body = `<html><head><title>Portal do Advogado e do Defensor Público</title></head>
    <body><p>${noticias}</p><p>O sistema X ficou fora do ar na semana passada.</p></body></html>`;
  const r = evaluateBody('Prop', body);
  assert.equal(r.verdict, 'FUNCTIONAL', 'menção incidental não pode derrubar um portal no ar');
});

// ------------------------------------------------------------------ SSO PDPJ
check('SSO do PDPJ pedindo cookie é funcional, não queda', () => {
  // Caso real de TJAC/TJRJ/TJSE eProc: redirecionam ao Keycloak, que responde
  // 400 "Cookie not found" porque o probe não mantém cookies.
  const body = `<html><head><title>Entrar em PDPJ</title></head>
    <body><h1>Sentimos muito...</h1><p>Cookie not found. Please make sure cookies are enabled in your browser.</p></body></html>`;
  assert.equal(evaluateBody('eProc', body).verdict, 'FUNCTIONAL');
});

check('marcador de Keycloak vale para qualquer sistema', () => {
  const body = html('<div>Keycloak realms/pje</div>');
  assert.equal(evaluateBody('Projudi', body).verdict, 'FUNCTIONAL');
});

// ------------------------------------------------------------ bloqueio nosso
check('Cloudflare challenge é bloqueio nosso', () => {
  const body = `<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>`;
  assert.equal(evaluateBody('PJe', body).verdict, 'BLOCKED');
});

check('BIG-IP "Request Rejected" é bloqueio nosso', () => {
  const body = html('<h1>The requested URL was rejected. Please consult with your administrator.</h1>');
  assert.equal(evaluateBody('eProc', body).verdict, 'BLOCKED');
});

check('Imperva/Incapsula é bloqueio nosso', () => {
  assert.equal(evaluateBody('eSAJ', html('<iframe src="/_Incapsula_Resource"></iframe>')).verdict, 'BLOCKED');
});

check('CloudFront "request could not be satisfied" é bloqueio nosso', () => {
  // Corpo real devolvido pelo TRT1 quando o WAF de borda barra a requisição.
  const body = `<HTML><HEAD><TITLE>ERROR: The request could not be satisfied</TITLE></HEAD>
    <BODY><H1>403 ERROR</H1><H2>The request could not be satisfied.</H2>
    Request blocked.<PRE>Generated by cloudfront (CloudFront)</PRE></BODY></HTML>`;
  const r = evaluateBody('PJe', body);
  assert.equal(r.verdict, 'BLOCKED', 'não pode virar "disponível" nem culpar o tribunal');
});

check('bloqueio precede manutenção', () => {
  // Se o WAF nos barrou, não sabemos nada sobre o estado do tribunal.
  const body = html('<h1>The requested URL was rejected</h1><p>sistema em manutenção</p>');
  assert.equal(evaluateBody('PJe', body).verdict, 'BLOCKED');
});

// -------------------------------------------------------------- inesperado
check('página sem marcador do sistema é UNEXPECTED', () => {
  const body = html('<p>Bem-vindo ao portal institucional.</p>');
  assert.equal(evaluateBody('PJe', body).verdict, 'UNEXPECTED');
});

check('corpo vazio é UNEXPECTED', () => {
  assert.equal(evaluateBody('eProc', '').verdict, 'UNEXPECTED');
});

check('eProc não aceita marcador de outro sistema', () => {
  const body = html('<form id="loginForm"><input name="j_username"></form>'); // isto é PJe
  assert.equal(evaluateBody('eProc', body).verdict, 'UNEXPECTED');
});

// --------------------------------------------------------- sistemas próprios
check('Portal aceita qualquer HTML sem marcador negativo', () => {
  assert.equal(evaluateBody('Portal', html('<p>conteúdo</p>')).verdict, 'FUNCTIONAL');
});

check('Portal em manutenção continua sendo manutenção', () => {
  assert.equal(evaluateBody('Prop', html('<p>Em manutenção</p>')).verdict, 'MAINTENANCE');
});

console.log(`\n${passed} asserções passaram\n`);
