# Atendimento WhatsApp com IA

Backend em **Node.js + TypeScript** que recebe mensagens de clientes via **Meta WhatsApp Cloud API**, processa com **OpenAI (LLM)** e responde automaticamente — de forma **assíncrona, segura e multi-tenant**.

```
Cliente WhatsApp
     │  (mensagem)
     ▼
Meta WhatsApp Cloud API (ou mock-meta-server)
     │  POST /webhook (assinado com HMAC-SHA256)
     ▼
┌──────────────────────────────────┐
│  SERVIDOR HTTP (Fastify)         │
│  1. Valida assinatura            │
│  2. Persiste mensagem (idemp.)   │
│  3. Enfileira job no BullMQ      │
│  4. Responde 200                 │
└──────────────┬───────────────────┘
               │  fila (Redis)
               ▼
┌──────────────────────────────────┐
│  WORKER (BullMQ Consumer)        │
│  - Monta contexto + KB + hist.   │
│  - Chama OpenAI (com function    │
│    calling para order status)    │
│  - Envia resposta via Meta API   │
└──────────────────────────────────┘
```

---

## 🔧 Como Rodar

```bash
# 1. Infraestrutura (Postgres, Redis, LocalStack, mock Meta)
docker compose up -d

# 2. Verifique o mock
curl http://localhost:8001/health

# 3. Configure o ambiente
cp .env.example .env
# Edite o .env com sua OPENAI_API_KEY

# 4. Dependências e banco
npm install
npm run db:migrate
npm run db:seed

# 5. Inicie os serviços (dois terminais)
npm run dev           # Servidor HTTP → porta 8000
npm run dev:worker    # Worker de processamento

# 6. Simule uma mensagem
curl -X POST http://localhost:8001/simulate/inbound \
  -H "Content-Type: application/json" \
  -d '{ "from": "5511999990000", "text": "Quais são os planos de vocês?" }'
```

---

## 🏗️ Arquitetura — Decisões e Trade-offs

### Clean Architecture (Ports & Adapters)

```
src/
├── domain/            # Entidades e interfaces (Ports) — zero dependências externas
├── use-cases/         # Casos de uso orquestrando o fluxo
├── adapters/          # Implementações concretas (controllers, services, repositories)
└── infrastructure/    # Frameworks, banco, logger, middlewares, configuração
```

**Por quê?** Isola o núcleo de negócio de frameworks e bibliotecas. Trocamos Fastify por Express? Trocamos Drizzle por Prisma? Trocamos BullMQ por SQS? Tudo acontece nos adapters — o domínio e os use cases nem percebem. O custo é maior boilerplate inicial, mas o ganho em testabilidade e manutenção a longo prazo compensa.

### Webhook: 200 rápido, sempre

O `handleIncoming` retorna `200` mesmo em erro interno. A Meta reentrega webhooks com backoff, então o pior que acontece é a mensagem ser processada com atraso. Se retornássemos `500`, a Meta bombardearia o endpoint — o que poderia causar cascata de falhas e consumo desnecessário de recursos.

### Fila: BullMQ (Redis) vs SQS (LocalStack)

| Critério | BullMQ + Redis | SQS + LocalStack |
|----------|---------------|-----------------|
| Setup local | Mais leve (1 container) | 2 containers |
| Retry nativo | Backoff exponencial integrado | DLQ + redrive manual |
| Observabilidade | UI (Bull Board) | AWS Console |
| Latência | Sub-milissegundo | ∼10ms (rede) |

**Escolha: BullMQ.** Para um cenário single-instance local, Redis é mais simples e performático. Em produção multi-região, SQS seria a escolha — sem necessidade de gerenciar Redis, sem risco de perda de dados, e com escalabilidade horizontal nativa.

### ORM: Drizzle vs Prisma

| Critério | Drizzle | Prisma |
|----------|---------|--------|
| Bundle | Leve (∼100KB) | Pesado (∼15MB) |
| Runtime queries | SQL puro com type-safe | Engine binário Rust |
| Migrations | SQL gerado + manual | Prisma Migrate |
| Multi-schema | Suporte nativo | Limitado |

**Escolha: Drizzle.** Mais leve, sem engine runtime, e com type safety comparável ao Prisma. A contrapartida: ecossistema menor e migrations menos maduras.

### LLM: Interface vs Implementação Direta

A `ILLMService` abstrai a chamada à OpenAI. Isso permite:
- **Testar** com mocks sem chamar a API real (e gastar tokens)
- **Stub** para desenvolvimento offline
- **Trocar** de provedor (Anthropic, Ollama local) sem alterar casos de uso

### Multi-tenant: Isolamento por API Key

Cada tenant tem `phoneNumberId` (identifica de qual número WhatsApp a mensagem veio) e `apiKey` (para autenticação REST). As queries sempre filtram por `tenantId` — garantia em tempo de query, não confiando só na rota.

---

## 🔐 Segurança

- **Validação HMAC-SHA256**: `X-Hub-Signature-256` verificada com `timingSafeEqual` (proteção contra timing attack) usando o `META_APP_SECRET`.
- **Autenticação REST**: `Authorization: Bearer <api_key>` → lookup do tenant → `request.tenantId` injetado.
- **Rate limiting**: 100 req/min/IP via `@fastify/rate-limit` (proteção contra abuso e consumo excessivo de tokens da OpenAI).
- **Raw body preservado**: O payload do webhook é assinado sobre o corpo cru — se o parser JSON modificar espaços, a assinatura quebra. Usamos um parser customizado que preserva `rawBody`.

---

## ⚡ Assincronicidade e Resiliência

1. **Webhook recebe → persiste → enfileira → responde 200** (tudo num raio de ∼50ms)
2. **Worker consome** → processa com retry (5 tentativas, backoff exponencial 2s → 4s → 8s → 16s → 32s)
3. **Se OpenAI falha**: job volta pra fila, retry acontece
4. **Se Meta API falha no envio**: mesma lógica — mensagem marcada como `FAILED` após exaurir tentativas
5. **Erro não silenciado**: exceção propaga pro BullMQ, que gerencia o retry automaticamente

### Idempotência

- Mensagens têm `wa_message_id` único da Meta
- Constraint `UNIQUE` no banco impede duplicatas
- Se o insert retorna duplicata, o job **não** é enfileirado
- O job também é enfileirado com `jobId = messageId` no BullMQ — fila também ignora duplicatas

---

## 🤖 Integração com a LLM

### RAG via System Prompt

A `knowledge-base/` (arquivos `.md`) é carregada na inicialização e injetada no system prompt. A instrução é clara: se a resposta não existir na base, o bot **diz que não sabe** — não inventa.

### Function Calling (Tool Use)

A ferramenta `check_order_status` é registrada no modelo. Quando o cliente pergunta "Qual o status do pedido PED-1002?":

1. LLM devolve `tool_call` com `{ orderId: "PED-1002" }`
2. Worker executa `orderRepo.findById(tenantId, orderId)`
3. Resultado é passado de volta ao modelo
4. LLM formula resposta final com o status real do pedido

### Controle de Custo

- `temperature: 0.3` — respostas mais determinísticas, menos tokens desperdiçados
- Histórico limitado a 20 mensagens por conversa
- Modelo `gpt-4o-mini` — custo ∼15x menor que `gpt-4o`
- Knowledge base carregada como string única (sem chunking) — gasto maior de tokens, mas sem complexidade de vector search. O trade-off consciente: com <5kb de FAQ, o custo adicional por chamada é centavos de dólar por mês.

---

## 📊 Observabilidade

- **Logs estruturados** com Pino (formato JSON em produção, `pino-pretty` em dev)
- Cada job inclui `messageId`, `conversationId`, `tenantId` nos metadados — rastreabilidade ponta a ponta
- `LOG_LEVEL` configurável via `.env`

---

## 🧪 Testes

3 suites com **Vitest**, cobrindo:

| Teste | O que cobre |
|-------|------------|
| `signature.test.ts` | HMAC válido, inválido, mal formatado |
| `ReceiveWebhookUseCase.test.ts` | Tenant não encontrado, fluxo feliz, mensagem duplicada |
| `ProcessMessageJobUseCase.test.ts` | Fluxo feliz (LLM → envio), mensagem já processada (pula) |

```bash
npm test              # Executa uma vez
npm run test:watch    # Modo watch
```

---

## 📌 Premissas Assumidas

1. **`messageId` (wamid.XXX) é globalmente único** — pilar da idempotência. Se a Meta mudar esse formato, precisamos de outra estratégia.
2. **Tenant "NeoFibra" pré-existe** — criado no seed com `phoneNumberId: 123456789012345` alinhado com o mock.
3. **Uma conversa por par (tenant, contact)** — se um mesmo contato abrir múltiplas conversas, o sistema mantém o histórico linear. Em produção seria necessário suporte a múltiplas conversas simultâneas (ex: `conversationId` vindo no webhook).
4. **Apenas mensagens de texto** — mídia, áudio e documentos são ignorados. O webhook atual ignora `type !== 'text'`.

---

## 🔮 O Que Deixei para Depois (e Por Quê)

1. **Vector Search / Chunking da Knowledge Base**
   Injetar toda a KB no system prompt não escala — com 50+ páginas de FAQ, o custo de tokens explode e a qualidade da resposta degrada. A evolução natural é chunking + `pgvector` para busca de similaridade, injetando só os trechos relevantes.
   *Por que deixei:* Para o volume atual (3 arquivos, ~5KB), o custo extra é irrelevante. A complexidade de implementar embedding e vector search não se justifica agora.

2. **Múltiplos canais (Instagram, Messenger, SMS)**
   Cada canal tem formato de webhook diferente. A `IMetaService` poderia ser generalizada para `IChannelService`, mas o desafio é especificamente WhatsApp.
   *Por que deixei:* YAGNI — até que o produto precise de outro canal.

3. **Cache de Conversação (Redis)**
   Hoje o histórico é lido do Postgres a cada job. Para alta escala, um cache Redis com TTL reduziria latência e carga no banco.
   *Por que deixei:* O Postgres aguenta dezenas de milhares de conversas sem problema. Cache adiciona complexidade de invalidação.

4. **Gestão de Limites de Taxa da Meta**
   A Meta tem limites de mensagens por segundo por número de telefone. Um `rate-limiter` interno para envios evitaria bloqueios.
   *Por que deixei:* O mock da Meta não impõe limites, e a implementação real depende do tier do WABA.

5. **Webhook Replay / Dead Letter Queue**
   Mensagens que falham permanentemente vão para uma DLQ para inspeção manual.
   *Por que deixei:* BullMQ já oferece esse mecanismo, mas configurar a DLQ e um dashboard de replay adiciona complexidade de UI que não estava no escopo.

6. **Testes de Integração com Containers**
   Testes com Postgres e Redis reais via Testcontainers dariam mais confiança que os mocks atuais.
   *Por que deixei:* O setup de containers em CI aumenta o tempo de execução. Os testes unitários já cobrem a lógica de negócio.

---

## 📦 Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor HTTP com hot-reload (tsx watch) |
| `npm run dev:worker` | Worker com hot-reload |
| `npm run build` | Compilação TypeScript |
| `npm test` | Testes unitários (Vitest) |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:migrate` | Executa migrations pendentes |
| `npm run db:seed` | Popula tenant e dados iniciais |
| `npm run db:generate` | Gera migrations do schema Drizzle |
