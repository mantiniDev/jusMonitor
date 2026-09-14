# JusMonitor

Monitoramento de indisponibilidade dos sistemas processuais brasileiros, com
registro auditável e emissão de certidão para o operador de direito.

## O problema

As coletas de processos dependem do acesso contínuo aos sistemas dos tribunais.
Quando um deles cai, dois problemas aparecem: a coleta falha em silêncio e — mais
grave — o prazo do parceiro corre risco.

Quando o sistema fica indisponível no último dia do prazo, a lei prorroga o
vencimento. Mas a prorrogação depende de **demonstrar o horário** da queda. Sem
histórico persistido com hora certa, não há o que juntar aos autos.

Monitorar status de tribunal não é novidade. O que este projeto faz de diferente
é registrar a indisponibilidade **com hora certa** e ligá-la a um documento
utilizável no processo.

## Duas fontes, um registro

```
SONDAGEM (183 endpoints de acesso)  ──┐
  "está fora agora?"                  ├──►  LEDGER  ──►  CERTIDÃO
AVISOS (páginas oficiais)           ──┘    de incidentes
  "o tribunal anunciou?"
```

A sondagem mede. Os avisos mostram o que o tribunal declara. Uma queda que
aparece nas duas fontes sustenta uma petição muito melhor do que a nossa medição
isolada — e a certidão transcreve o comunicado quando ele existe.

## Princípios de projeto

Três decisões governam o código, e vale entendê-las antes de alterar qualquer
coisa.

**O horário de início é retroagido à primeira falha.** Um incidente só é
confirmado após três observações ruins seguidas, mas o `started_at` gravado é o
da *primeira* falha da sequência, não o da confirmação. A indisponibilidade
começou quando o sistema caiu, não quando concluímos que ele havia caído. Essa
diferença de minutos é o que decide uma prorrogação.

**Na dúvida, a culpa é nossa.** Atribuir ao tribunal uma indisponibilidade que
não houve produz prova falsa; atribuir a nós uma queda real custa apenas um
alerta a investigar. Por isso um 403 sem a tela do sistema é bloqueio nosso, não
queda do tribunal, e um timeout — que de um único ponto de observação não
distingue queda de falha de rede — não gera certidão.

**Sondagem funcional, não ping.** Um PJe em manutenção devolve HTTP 200 com
página de aviso. Checar só o código produziria um falso "disponível", que é o
pior erro possível num sistema cuja saída vira prova.

## Estados e classificação

| Estado | Significado |
|---|---|
| `AVAILABLE` | tela do sistema carregou |
| `DEGRADED` | respondeu, sem a tela esperada |
| `UNAVAILABLE` | 5xx, conexão recusada ou manutenção declarada |
| `BLOCKED` | WAF barrou nosso acesso — nada se sabe do tribunal |
| `ERROR` | sem resposta: timeout, DNS, TLS |
| `RESTRICTED` | endpoint que só aceita rede interna; não é sondado |

Cada incidente recebe uma atribuição de culpa, e só as três primeiras admitem
certidão:

| Tipo | Admite certidão | Origem |
|---|---|---|
| `EXTERNA_BLOQUEANTE` | sim | tribunal fora do ar |
| `EXTERNA` | sim | instabilidade do tribunal |
| `PROGRAMADA` | sim | manutenção que o tribunal anunciou |
| `INDETERMINADA` | não | sem resposta; culpa não estabelecida |
| `INTERNA` | não | bloqueio ou falha nossa |

Um incidente aberto pode ser reclassificado para um tipo **menos** atribuível ao
tribunal quando uma observação posterior revela isso. Nunca no sentido inverso.

## Salvaguardas

**Anti-flap.** Três falhas seguidas para abrir, duas recuperações para fechar.
Uma oscilação isolada não vira registro.

**Canário de rede.** Antes de cada varredura, confirma conectividade com
destinos fora do Judiciário. Sem internet, a varredura aborta e nada é gravado:
não saber é honesto, gravar 177 quedas inexistentes não é.

**Suspeita de falha massiva.** Acima de 70% de falhas, o painel avisa que a
causa provável somos nós — tribunais independentes não caem juntos.

**Hash de integridade.** Cada certidão traz um SHA-256 do conteúdo certificado.
Reemitir a mesma certidão reproduz o mesmo código.

## Limitação conhecida: reputação de IP

Os tribunais bloqueiam faixas de datacenter. Medido em 14/09/2026, na mesma
amostra e no mesmo período:

| Ponto de observação | Bloqueados | Timeouts | Avisos alcançados |
|---|---|---|---|
| Rede corporativa/residencial | 0 | 0 | 12 de 12 |
| Vercel | 11 | 6 | 6 de 12 |
| GitHub Actions (Azure) | 14 | 5 | 0 de 6 |

Trocar um provedor de nuvem por outro não resolve: o bloqueio é contra a
natureza do IP, não contra um fornecedor. O sistema **classifica esses casos
corretamente** como `INTERNA` ou `INDETERMINADA`, então não gera certidão falsa
— mas a cobertura efetiva de um deploy em nuvem é parcial, e isso precisa estar
claro para quem interpreta o painel.

O caminho correto é sondar de uma rede com acesso reconhecido — a mesma de onde
as coletas já saem — e enviar as observações ao aplicativo hospedado, que passa a
apenas ingerir e exibir. Não implementado.

## Como rodar

Não há nada a configurar localmente: sem `LIBSQL_URL`, grava em
`data/jusmonitor.db`; sem `SWEEP_TOKEN`, as rotas de varredura ficam abertas.

```bash
npm install
npm run dev
```

Para publicar, ver [DEPLOY.md](DEPLOY.md) — em hospedagem serverless o disco é
somente leitura e o banco precisa ser hospedado.

## Testes

```bash
npm run typecheck
npm run test:probes     # assinatura dos sistemas, manutenção, WAF
npm run test:scraper    # classificação de resposta
npm run test:ledger     # anti-flap, retroação, reclassificação
npm run test:certidao   # emissão e recusas
npm run test:avisos     # extração das páginas oficiais
```

Os testes de ledger e certidão gravam num banco descartável:

```bash
JUSMONITOR_DB_PATH=./.tmp.db npm run test:ledger
```

Sem framework de propósito — o projeto não tem um, e estas asserções cobrem
exatamente as regras que sustentam a certidão.

## Estrutura

```
src/lib/
  courts.ts       catálogo dos 183 endpoints (tribunal × sistema × grau)
  probes.ts       assinatura funcional de cada sistema
  scraper.ts      sondagem e classificação de resposta
  canary.ts       verificação de conectividade própria
  incidents.ts    máquina de estado do ledger
  monitor.ts      varredura com pool de concorrência
  avisos.ts       captura das páginas oficiais
  correlacao.ts   cruzamento entre medido e declarado
  certidao.ts     emissão, recusas e hash
  db.ts           persistência via libSQL

src/app/api/
  monitor/sweep   dispara varredura        (POST, protegido)
  avisos          consulta fontes oficiais (GET público, POST protegido)
  ledger          resumo, abertos, histórico
  incidents/[id]  detalhe, evidência e certidão
  status, check   status ao vivo do painel
```

## Fora de escopo

**Certidão sem assinatura digital.** O hash prova integridade contra alteração,
não prova origem. Para valor probatório mais forte diante de um juízo
contestador, faltaria assinatura ICP-Brasil ou carimbo de tempo.

**Sem endpoint de conferência.** Quem recebe a certidão não tem onde validar o
hash.

**Catálogo de avisos parcial.** Doze fontes verificadas. De uma lista inicial de
63 endereços, 41 davam 404 e sete apontavam para consulta processual em vez de
página de avisos; entraram apenas os que respondem e trazem o conteúdo esperado.

**Sem camada de prazo.** Cruzar incidente com o processo e o prazo do cliente é a
peça que fecha a proposta, e depende de dado que este repositório não tem.

**Sem corroboração de segundo ponto.** É o que permitiria promover um timeout de
`INDETERMINADA` a indisponibilidade atestável.
