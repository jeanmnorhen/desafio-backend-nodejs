# Atendimento WhatsApp com IA (NeoFibra)

Backend em **Node.js + TypeScript** desenvolvido para resolver o desafio de atendimento assíncrono do WhatsApp usando **Meta API** e **OpenAI**. 

O sistema recebe mensagens via Webhook, processa de maneira assíncrona (com **BullMQ**) injetando conhecimento (RAG) da base local e responde de forma automatizada ao cliente final.

## 🚀 Como Rodar o Projeto

1. **Suba a infraestrutura (Postgres, Redis, Mock Meta)**
   ```bash
   docker-compose up -d
   ```

2. **Configure o ambiente**
   Copie o `.env.example` para `.env` e certifique-se de inserir sua chave da OpenAI.
   ```bash
   cp .env.example .env
   # Edite o .env colocando sua OPENAI_API_KEY
   ```

3. **Instale as dependências e prepare o banco de dados**
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

4. **Inicie os serviços**
   Em um terminal, inicie o servidor HTTP (porta 8000):
   ```bash
   npm run dev
   ```
   
   Em outro terminal, inicie o Worker do BullMQ:
   ```bash
   npm run dev:worker
   ```

5. **Simule uma mensagem do cliente**
   ```bash
   curl -X POST http://localhost:8001/simulate/inbound \
     -H "Content-Type: application/json" \
     -d '{ "from": "5511999990000", "text": "Quais são os planos de internet disponíveis?" }'
   ```
   *O mock da Meta (porta 8001) assinará a mensagem e fará um POST para o seu servidor Fastify na porta 8000. O Worker lerá a mensagem da fila, chamará a OpenAI e enviará a resposta.*

---

## 🏗️ Decisões de Arquitetura

O projeto foi construído utilizando **Clean Architecture** (Ports and Adapters) visando alto desacoplamento, testabilidade e separação clara de responsabilidades.

- **Domain Layer (`src/domain`)**: Contém as Entidades ricas de negócio (`Tenant`, `Contact`, `Conversation`, `Message`, `Order`) e as Interfaces (Ports) para repositórios e serviços. Nenhuma dependência externa.
- **Use Cases Layer (`src/use-cases`)**: Orquestra a lógica de aplicação (ex: `ReceiveWebhookUseCase` garante a idempotência e enfileira o job; `ProcessMessageJobUseCase` faz a ponte com a LLM e RAG).
- **Adapters Layer (`src/adapters`)**: Implementação concreta das interfaces.
  - Repositórios com **Drizzle ORM** (escolhido por ser type-safe, leve e não ter overhead pesado de runtime).
  - Serviços Externos: **OpenAI**, **Meta API**, e **BullMQ**.
- **Infrastructure Layer (`src/infrastructure`)**: Frameworks web (**Fastify**), banco de dados (`postgres.js`), configuração de filas e logs estruturados com **Pino**.

### Resiliência, Escalabilidade e Multi-tenancy
- **Assincronismo:** O servidor Fastify apenas processa, valida o HMAC da assinatura da Meta, salva a mensagem original no BD para garantir **idempotência** (via restrição `UNIQUE` no banco) e joga para uma fila do Redis.
- **Worker (BullMQ):** O processo de worker puxa as mensagens garantindo retry (exponencial) caso a OpenAI ou a Meta caiam. 
- **Multi-tenancy Isolado:** Todas as entidades possuem a coluna `tenantId`. A API REST exige o envio de `Authorization: Bearer <API_KEY>` para identificar e isolar o Tenant em tempo de requisição.

### IA, RAG e Function Calling
- A base de dados de FAQ da empresa (arquivos Markdown na pasta `knowledge-base`) é injetada no System Prompt, instruindo a IA a não alucinar e a ser um agente focado.
- A ferramenta (Tool) `check_order_status` foi fornecida ao GPT. Quando o cliente pergunta "Qual o status do meu pedido PED-1002?", a IA pausa, dispara a função, o Worker vai ao banco de dados ler os pedidos (`orders` daquele tenant), e devolve o contexto para a IA formular a resposta final.

---

## 📌 Premissas Assumidas

- **Idempotência**: Assumimos que o campo `messageId` (ex: `wamid.XXX`) que vem da Meta é globalmente único e é o pilar da verificação de dupla entrega. Se uma requisição falhar no parse, mas já tiver o messageId salvo, é descartada.
- **Tenant Default**: O script de seed (`npm run db:seed`) já deixa um Tenant (NeoFibra) criado de antemão e alinhado com o `phoneNumberId` enviado no *mock* (`123456789012345`).
- **Logando JSON**: Em ambiente de desenvolvimento, o Pino foi instruído a usar `pino-pretty` para fácil leitura. Em produção, ele exporta NDJSON puramente otimizado.
- **Context Window**: Por simplicidade, estamos enviando as últimas 20 mensagens como histórico para a LLM, além de todo o texto das FAQs.

---

## 🔮 O que eu deixaria para depois (Evoluções)

1. **Chunking Avançado da Base de Conhecimento (Vector DB):** Em vez de jogar 100% da base no System Prompt (o que gasta tokens absurdamente e afeta o foco da LLM se a empresa crescer muito), o ideal seria armazenar o conteúdo em um banco de dados Vetorial (como Qdrant, Pinecone ou pgvector no próprio Postgres) e fazer busca semântica em tempo real para injetar apenas as 3 FAQs mais relevantes do tema.
2. **Rate Limiting no Fastify**: Adicionar limite de chamadas na API Webhook como medida extra de segurança contra ataques DDoS, usando o plugin oficial `@fastify/rate-limit`.
3. **Múltiplos Canais**: Como o núcleo é Clean Architecture, poderíamos facilmente suportar Telegram ou Instagram apenas implementando novos Controllers de entrada e um Service de envio genérico implementando a mesma Port.
