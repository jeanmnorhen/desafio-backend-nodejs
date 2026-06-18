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

## 🧪 Cobertura de Testes

3 suites com **Vitest** — **7 cenários** no total, cobrindo validação criptográfica, fluxos de idempotência, e o pipeline completo LLM + envio.

### 1. `signature.test.ts` — Validação de Assinatura HMAC-SHA256

Arquivo: `src/infrastructure/http/middlewares/__tests__/signature.test.ts`

| # | Caso de teste | O que valida | Asserções |
|---|--------------|-------------|-----------|
| 1 | Assinatura válida | Gera HMAC-SHA256 com `crypto.createHmac` sobre o raw body e compara com `sha256=<hash>` | `verifySignatureRaw` retorna `true` |
| 2 | Assinatura inválida | Passa um hash qualquer (`sha256=invalidhash12345`) com secret correto | `verifySignatureRaw` retorna `false` |
| 3 | Assinatura mal formatada/vazia | Testa string vazia (`''`) e formato inválido sem prefixo (`'invalid'`) | `verifySignatureRaw` retorna `false` em ambos |

### 2. `ReceiveWebhookUseCase.test.ts` — Caso de Uso: Recebimento do Webhook

Arquivo: `src/use-cases/__tests__/ReceiveWebhookUseCase.test.ts`

| # | Caso de teste | O que valida | Asserções |
|---|--------------|-------------|-----------|
| 1 | Tenant não encontrado | Quando `findByWaPhoneNumberId` retorna `null` | Retorna `{ ignored: true, reason: 'Unknown tenant' }`; `contactRepo.findOrCreate` **não** é chamado |
| 2 | Fluxo feliz | Tenant, contato e conversa existem; mensagem é criada com `direction: 'INBOUND'` | Retorna `{ duplicate: false, messageId, conversationId }`; `queueService.enqueue` é chamado com `{ tenantId, messageId, conversationId, contactWaId }` |
| 3 | Idempotência (mensagem duplicada) | `messageRepo.create` retorna `null` simulando violação de UNIQUE no `wa_message_id` | Retorna `{ duplicate: true }`; `queueService.enqueue` **não** é chamado; `logger.info` registra `'Duplicate message received, ignoring'` |

### 3. `ProcessMessageJobUseCase.test.ts` — Caso de Uso: Processamento da Mensagem

Arquivo: `src/use-cases/__tests__/ProcessMessageJobUseCase.test.ts`

| # | Caso de teste | O que valida | Asserções |
|---|--------------|-------------|-----------|
| 1 | Fluxo feliz completo | Mensagem `RECEIVED` → busca tenant + histórico → chama LLM → cria OUTBOUND → envia via Meta | `updateStatus('msg-1', 'PROCESSING')` chamado; `llmService.chat` chamado; `messageRepo.create` chamado com `{ direction: 'OUTBOUND', body }`; `metaService.sendMessage` chamado com `(phoneNumberId, to, body)`; `updateStatus('msg-out-1', 'SENT')` chamado |
| 2 | Mensagem já processada | Mensagem com status `PROCESSING` (não `RECEIVED`) é ignorada | `tenantRepo.findById` **não** é chamado; `logger.info` registra `'Message already processed or processing'` |

### Resumo

```bash
npm test              # vitest run — executa todos os 7 cenários
npm run test:watch    # vitest — modo watch para desenvolvimento
```

**Estratégia de mocks:** Todos os testes usam `vi.fn()` para isolar o caso de uso das dependências externas (banco, fila, LLM, Meta API). Nenhuma chamada real a serviço externo acontece durante os testes.

---

## 📌 Premissas Assumidas

- **Idempotência**: Assumimos que o campo `messageId` (ex: `wamid.XXX`) que vem da Meta é globalmente único e é o pilar da verificação de dupla entrega. Se uma requisição falhar no parse, mas já tiver o messageId salvo, é descartada.
- **Tenant Default**: O script de seed (`npm run db:seed`) já deixa um Tenant (NeoFibra) criado de antemão e alinhado com o `phoneNumberId` enviado no *mock* (`123456789012345`).
- **Logando JSON**: Em ambiente de desenvolvimento, o Pino foi instruído a usar `pino-pretty` para fácil leitura. Em produção, ele exporta NDJSON puramente otimizado.
- **Context Window**: Por simplicidade, estamos enviando as últimas 20 mensagens como histórico para a LLM, além de todo o texto das FAQs.

---

### Segurança e Qualidade (Testes e Limites)
- **Rate Limiting (Anti-DDoS):** A aplicação Fastify conta com o plugin oficial `@fastify/rate-limit` já configurado nativamente, aplicando um limite de 100 requisições/minuto por IP para proteger nosso faturamento da OpenAI e banco de dados.
- **Suíte de Testes (Vitest):** A arquitetura foi validada com testes unitários cobrindo desde a barreira criptográfica (`signature.ts`) até o comportamento completo dos Casos de Uso (Idempotência, Fluxos de Falha e Sucesso com a Fila). Foram utilizados *mocks* do Vitest para isolar as dependências e validar puramente a lógica do negócio.

---

## 🔮 O que eu deixaria para depois (Evoluções)

1. **Chunking Avançado da Base de Conhecimento (Vector DB):** Em vez de jogar 100% da base de FAQs no System Prompt (o que gasta tokens e afeta o desempenho da LLM à medida que o conhecimento cresce), o ideal seria implementar uma busca vetorial (RAG autêntico) usando `pgvector` no PostgreSQL ou um banco como o Pinecone. O worker faria uma busca de similaridade e injetaria apenas os trechos relevantes.


