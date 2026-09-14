/**
 * Testes da extração de avisos oficiais.
 *
 * Rodar:  npm run test:avisos
 *
 * Os casos vêm de texto real capturado das páginas dos tribunais. O risco a
 * conter é o falso positivo: uma janela inventada reclassificaria um incidente
 * como manutenção programada e anexaria comunicado falso a uma certidão.
 */
import assert from 'node:assert/strict';
import { extrairJanelas, extrairResumo, textoVisivel, FONTES_AVISO } from './avisos.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log('\navisos oficiais\n');

// ------------------------------------------------------------ aceita o real
check('TRT3: par com data e hora vira janela', () => {
  // Texto real capturado do portal do TRT3.
  const t = 'V12 TRT3007071202609081630 08/09/2026 00:00 13/09/2026 23:59 Instabilidade PJE - PROCESSO JUDICIAL ELETRÔNICO';
  const [j] = extrairJanelas(t);
  assert.ok(j, 'deveria extrair uma janela');
  assert.equal(j.inicio, '2026-09-08T00:00:00-03:00');
  assert.equal(j.fim, '2026-09-13T23:59:00-03:00');
});

check('TRT1: formato "às" com hora é aceito', () => {
  const t = 'Gerar Certidão Período 08/05/2026 17:00 às 08/05/2026 17:32 Motivo Manutenção Programada';
  const [j] = extrairJanelas(t);
  assert.ok(j);
  assert.equal(j.inicio, '2026-05-08T17:00:00-03:00');
  assert.equal(j.fim, '2026-05-08T17:32:00-03:00');
});

check('formato com "h" (17h30) é aceito', () => {
  const t = 'Manutenção programada de 10/09/2026 22h00 até 11/09/2026 06h00.';
  const [j] = extrairJanelas(t);
  assert.ok(j);
  assert.equal(j.inicio, '2026-09-10T22:00:00-03:00');
  assert.equal(j.fim, '2026-09-11T06:00:00-03:00');
});

// -------------------------------------------------------- rejeita os ruídos
check('texto legal da resolução NÃO vira janela', () => {
  // Caso real de TSE, TRE-SP e TRE-MG.
  const t = '11, § 4º, da Resolução-TSE nº 23.417/2014, esta página relaciona as eventuais indisponibilidades do sistema';
  assert.equal(extrairJanelas(t).length, 0);
});

check('fim anterior ao início é descartado', () => {
  // Caso real do TRT8: 23/06 seguido de 05/01.
  const t = 'Períodos de Indisponibilidade do PJe 23/06/2026 10:00 05/01/2026 12:00';
  assert.equal(extrairJanelas(t).length, 0, 'janela invertida é ruído de parser');
});

check('janela longa demais é descartada', () => {
  // Caso real do TJPE: 11/05 a 13/12, sete meses.
  const t = 'indisponibilidade 11/05/2026 08:00 13/12/2026 18:00';
  assert.equal(extrairJanelas(t).length, 0, 'sete meses não é manutenção');
});

check('datas sem hora não viram janela', () => {
  const t = 'O sistema ficou indisponível entre 02/09/2026 e 09/09/2026.';
  assert.equal(extrairJanelas(t).length, 0, 'sem hora não há janela delimitada');
});

check('data distante da palavra-chave é ignorada', () => {
  const t = 'manutenção' + ' x'.repeat(400) + ' 08/09/2026 10:00 08/09/2026 12:00';
  assert.equal(extrairJanelas(t).length, 0, 'fora do raio da palavra-chave');
});

check('notícia sem par de datas não vira janela', () => {
  // Caso real do TRT19: matéria sobre campanha.
  const t = 'Campanha será realizada de 14 a 18 de setembro em todo o país. Indisponibilidade 11/09/2026 10:00';
  assert.equal(extrairJanelas(t).length, 0, 'uma data só não delimita');
});

check('ano implausível é descartado', () => {
  const t = 'manutenção 08/09/1999 10:00 08/09/1999 12:00';
  assert.equal(extrairJanelas(t).length, 0);
});

check('janelas duplicadas não se repetem', () => {
  const t = 'manutenção 08/09/2026 10:00 08/09/2026 12:00 e novamente manutenção 08/09/2026 10:00 08/09/2026 12:00';
  assert.equal(extrairJanelas(t).length, 1);
});

// ------------------------------------------------- qualidade do trecho
check('trecho não começa no meio de uma palavra', () => {
  const t = 'Certidão de Indisponibilidade Eletrônica CINDe Lista de Indisponibilidades manutenção programada 08/09/2026 00:00 13/09/2026 23:59 encerrada';
  const [j] = extrairJanelas(t);
  assert.ok(j);
  assert.ok(!/^\w*[a-zç]\b/.test(j.trecho) || t.startsWith(j.trecho.slice(0, 6)) || /^[A-ZÀ-Ú]/.test(j.trecho),
    `trecho iniciou cortado: "${j.trecho.slice(0, 40)}"`);
});

check('trecho descarta aviso de JavaScript e paginação', () => {
  const t = 'Indisponibilidades JavaScript não está habilitada. Para o correto funcionamento habilitar o JavaScript nas configurações do navegador e recarregar! ' +
            'Pesquisar: 1 2 3 4 5 6 7 8 9 10 manutenção 08/09/2026 00:00 13/09/2026 23:59';
  const [j] = extrairJanelas(t);
  assert.ok(j);
  assert.ok(!/JavaScript/i.test(j.trecho), `sobrou aviso de JS: "${j.trecho}"`);
  assert.ok(!/1 2 3 4 5/.test(j.trecho), `sobrou paginação: "${j.trecho}"`);
});

check('trecho preserva as datas que o originaram', () => {
  const t = 'Instabilidade PJE manutenção 08/09/2026 00:00 13/09/2026 23:59 PROCESSO JUDICIAL ELETRÔNICO';
  const [j] = extrairJanelas(t);
  assert.ok(j.trecho.includes('08/09/2026'), 'a data de início deve aparecer no trecho');
  assert.ok(j.trecho.includes('13/09/2026'), 'a data de fim deve aparecer no trecho');
});

// ------------------------------------------------------------------ básicos
check('textoVisivel remove script, style e tags', () => {
  const html = '<html><head><style>a{color:red}</style><script>var x=1</script></head><body><p>Olá</p></body></html>';
  const t = textoVisivel(html);
  assert.ok(!t.includes('color:red'));
  assert.ok(!t.includes('var x'));
  assert.ok(t.includes('Olá'));
});

check('extrairResumo pega só frases do tema', () => {
  const t = 'Bem-vindo ao portal. O sistema estará indisponível amanhã. Confira o cardápio.';
  const r = extrairResumo(t);
  assert.ok(/indispon/i.test(r));
  assert.ok(!/cardápio/i.test(r));
});

check('catálogo só contém fontes verificadas', () => {
  assert.ok(FONTES_AVISO.length >= 12);
  for (const f of FONTES_AVISO) {
    assert.ok(f.url.startsWith('https://'), `${f.acronym} deve usar https`);
    assert.ok(f.acronym.length > 0 && f.nome.length > 0);
  }
});

console.log(`\n${passed} asserções passaram\n`);
