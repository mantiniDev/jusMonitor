import type { Certidao } from './certidao';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renderiza a certidão como documento imprimível.
 *
 * O destino é o processo: o advogado abre, confere e salva em PDF para juntar
 * aos autos. Daí a formatação sóbria, a tabela de observações completa e o
 * hash visível ao pé — é ele que permite conferir o documento depois.
 */
export function certidaoHtml(c: Certidao): string {
  const periodo = c.emCurso
    ? `${esc(c.inicio)} — <strong>em curso</strong>`
    : `${esc(c.inicio)} até ${esc(c.fim)}`;

  const linhas = c.observacoes
    .map(
      (o) => `<tr>
      <td>${esc(o.momento)}</td>
      <td class="num">${o.httpStatus ?? '—'}</td>
      <td class="num">${o.latenciaMs ?? '—'}</td>
      <td>${esc(o.descricao)}</td>
    </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certidão de Indisponibilidade ${esc(c.numero)}</title>
<style>
  :root { --verde:#007A5F; --escuro:#004D3B; --tinta:#101729; --suave:#383F49; --linha:#D9E0E6; }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:32px; background:#fff; color:var(--tinta);
    font-family:'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size:13px; line-height:1.55;
  }
  .folha { max-width:760px; margin:0 auto; }
  header { border-bottom:2px solid var(--verde); padding-bottom:14px; margin-bottom:22px; }
  .selo { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--verde); font-weight:600; margin:0 0 4px; }
  h1 { font-size:21px; font-weight:600; margin:0 0 6px; line-height:1.2; }
  .numero { font-size:12px; color:var(--suave); font-variant-numeric:tabular-nums; }
  h2 { font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--verde); margin:22px 0 8px; font-weight:700; }
  dl { display:grid; grid-template-columns:170px 1fr; gap:5px 14px; margin:0; }
  dt { color:var(--suave); font-size:12px; }
  dd { margin:0; font-weight:500; }
  p { margin:8px 0; }
  .destaque { background:#F1F4F8; border-left:3px solid var(--verde); padding:11px 14px; border-radius:0 6px 6px 0; margin:10px 0; }
  table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
  th, td { text-align:left; padding:6px 9px; border-bottom:1px solid var(--linha); vertical-align:top; }
  thead th { background:#F1F4F8; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--suave); }
  td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  ol, ul { margin:6px 0; padding-left:20px; }
  li { margin-bottom:4px; color:var(--suave); }
  footer { margin-top:26px; padding-top:12px; border-top:1px solid var(--linha); font-size:11px; color:var(--suave); }
  .hash { font-family:ui-monospace, 'Cascadia Code', Consolas, monospace; font-size:10.5px; word-break:break-all; color:var(--tinta); }
  @media print {
    body { padding:0; font-size:11px; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="folha">
  <header>
    <p class="selo">Certidão de indisponibilidade de sistema processual</p>
    <h1>${esc(c.tribunal)}${c.sistema ? ` — ${esc(c.sistema)}` : ''}${c.grau ? ` — ${esc(c.grau)}` : ''}</h1>
    <p class="numero">Documento nº ${esc(c.numero)} · emitido em ${esc(c.emitidaEm)} (horário de Brasília)</p>
  </header>

  <h2>Objeto</h2>
  <p>Certifica-se que o monitoramento automatizado registrou a ocorrência abaixo descrita no sistema processual identificado nesta certidão.</p>

  <h2>Identificação</h2>
  <dl>
    <dt>Tribunal</dt><dd>${esc(c.tribunal)}</dd>
    <dt>Sistema</dt><dd>${esc(c.sistema ?? '—')}</dd>
    <dt>Instância</dt><dd>${esc(c.grau ?? '—')}</dd>
    <dt>Endereço monitorado</dt><dd>${esc(c.endereco ?? '—')}</dd>
  </dl>

  <h2>Ocorrência</h2>
  <dl>
    <dt>Início</dt><dd>${esc(c.inicio)}</dd>
    <dt>Término</dt><dd>${c.emCurso ? 'sem registro de normalização até a emissão' : esc(c.fim)}</dd>
    <dt>Duração registrada</dt><dd>${c.duracaoMinutos} minuto(s)</dd>
    <dt>Observações</dt><dd>${c.observacoes.length}</dd>
  </dl>
  <div class="destaque">
    <strong>Período:</strong> ${periodo}<br>
    ${esc(c.natureza)}
  </div>

  <h2>Observações registradas</h2>
  <table>
    <thead>
      <tr><th>Momento (Brasília)</th><th class="num">HTTP</th><th class="num">Latência (ms)</th><th>Resultado</th></tr>
    </thead>
    <tbody>
${linhas || '      <tr><td colspan="4">Nenhuma observação registrada.</td></tr>'}
    </tbody>
  </table>

${
  c.avisosOficiais.length === 0
    ? ''
    : `  <h2>Comunicado do tribunal</h2>
  <p>O período certificado é coberto por publicação do próprio tribunal:</p>
${c.avisosOficiais
  .map(
    (a) => `  <div class="destaque">
    <strong>${esc(a.acronym)}</strong> — consultado em ${esc(
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(a.capturedAt))
    )}<br>
    <em>&ldquo;${esc(a.trecho)}&rdquo;</em><br>
    <span style="font-size:11px;color:var(--suave)">Fonte: ${esc(a.url)}</span>
  </div>`
  )
  .join('\n')}
`
}
  <h2>Metodologia</h2>
  <ol>${c.metodologia.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>

  <h2>Ressalvas</h2>
  <ul>${c.ressalvas.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>

  <footer>
    <p>Código de integridade (SHA-256) do conteúdo certificado:</p>
    <p class="hash">${esc(c.hash)}</p>
    <p>A reemissão da certidão referente ao mesmo registro deve reproduzir idêntico código de integridade.</p>
  </footer>
</div>
</body>
</html>`;
}
