# Publicação

## Por que existe um banco hospedado

O ledger de incidentes é a base da certidão: sem o histórico de observações com
horário, não há evidência a atestar. Funções serverless no Vercel rodam em
sistema de arquivos somente leitura, e `/tmp` é efêmero e não compartilhado
entre invocações — um SQLite em disco perderia todo incidente e zeraria a
sequência do anti-flap a cada requisição.

Por isso o acesso ao banco passa por libSQL, que fala tanto com arquivo local
quanto com Turso hospedado. O mesmo código serve aos dois ambientes.

## Passos

### 1. Criar o banco

```bash
turso db create jusmonitor
turso db show jusmonitor --url
turso db tokens create jusmonitor
```

O schema é criado sozinho na primeira conexão.

### 2. Configurar as variáveis no Vercel

Em *Settings → Environment Variables*:

| Variável | Valor |
|---|---|
| `LIBSQL_URL` | `libsql://...turso.io` |
| `LIBSQL_AUTH_TOKEN` | token gerado acima |
| `SWEEP_TOKEN` | segredo à sua escolha |

`SWEEP_TOKEN` protege as rotas de varredura. Elas disparam centenas de
requisições aos tribunais em nome da instituição: expostas sem proteção numa URL
pública, qualquer um poderia acioná-las em rajada e fazer bloquearem nosso IP.
Com o token definido, os botões de varredura da interface passam a responder que
a varredura é do agendador — o visitante vê os dados, não dispara coleta.

### 3. Agendar as varreduras

O cron do Vercel no plano Hobby roda no máximo uma vez por dia, o que não serve
para monitoramento on-call. O workflow em `.github/workflows/varredura.yml`
resolve isso pelo GitHub Actions, gratuitamente.

Em *Settings → Secrets and variables → Actions* do repositório:

| Secret | Valor |
|---|---|
| `APP_URL` | `https://jus-monitor.vercel.app` |
| `SWEEP_TOKEN` | o mesmo valor configurado no Vercel |

Cadência: sondagem a cada 15 minutos, consulta às páginas oficiais de hora em
hora. Para reagir mais rápido, reduza o cron — lembrando que cada varredura são
177 requisições aos tribunais.

Quem estiver no plano Pro do Vercel pode usar o cron nativo no lugar do
workflow; o `maxDuration = 300` das rotas já pressupõe esse plano.

## Desenvolvimento local

Nada a configurar: sem `LIBSQL_URL`, grava em `data/jusmonitor.db` e, sem
`SWEEP_TOKEN`, as rotas de varredura ficam abertas.

```bash
npm install
npm run dev
```

## Testes

```bash
npm run typecheck
npm run test:probes     # sondagem funcional
npm run test:ledger     # anti-flap e retroação de horário
npm run test:certidao   # emissão e recusa
npm run test:avisos     # extração das páginas oficiais
```

Os testes de ledger e certidão gravam num banco temporário:

```bash
JUSMONITOR_DB_PATH=./.tmp.db npm run test:ledger
```
