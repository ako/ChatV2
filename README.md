# ServiceDeskCopilot

A demo Mendix app to try out the **agent and chat features of Mendix 11.16** (Agents Kit 2),
built with [mxcli](https://mxcli.org).

## What it is for

A demo app for testing the Mendix 11.16 Agents Kit 2 features. Service-desk staff chat
with an AI support agent that looks up orders and tickets, answers from a policy and FAQ
knowledge base, and creates tickets or refunds after the user approves. A triage agent
classifies incoming tickets and uploaded documents. The app also publishes its tools over
MCP and uses tools from an external MCP server.

## What it keeps track of

- **Customer**, who has many **Orders**
- **Ticket**, linked to a Customer and optionally an Order. A Ticket has many **Attachments**.
- **RefundRequest**, one per Order
- Steps people act on: ticket triage, then assignment, then resolution, with refund
  approval. This is modelled as a **workflow** that includes an AI Agent Task.
- Counts across records: open tickets per category and priority, and refund totals.
  These are **view entities** feeding an admin dashboard.
- Agents, chat history, traces and token usage come from the Agents Kit modules
  (GenAI Commons, Agent Commons, Conversational UI, Agent Editor and others).

## Who logs in

| Role | May do |
|---|---|
| Customer | Chat with the agent; see only their own orders and tickets |
| SupportAgent | See all tickets; approve agent actions; handle workflow tasks |
| Administrator | Configure agents, models, keys, MCP and knowledge bases; view traces and token usage |

## Build details

- Mendix **11.16.0**, theme **signal**
- Every MDL script in `mdlsource/` starts with `mdl 1;`
- Scope, split into slices: `docs/brain/plan/` (run `./mxcli brain plan` for progress)
- Research findings and tooling notes: `FINDINGS.md`

## Run it

Generate a local encryption key once. The file is git-ignored, and a fresh container needs a new one:

```bash
python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)), end='')" > .mxcli/encryption.key
```

Then start the app. Keys are read from environment variables and never written to a file:

| Constant | Environment variable | Needed for |
|---|---|---|
| `ServiceDesk.MxGenAIKey` | `GENAI_TEXT_KEY` | Mendix Cloud GenAI text model (design-time agents) |
| `ServiceDesk.MxGenAIKnowledgeBaseKey` | `MX_KB_KEY` | Mendix Cloud GenAI knowledge base (SupportAgent) |
| `ServiceDesk.MxGenAIEmbeddingsKey` | `MX_EMBEDDINGS_KEY` | embeddings for the PgVector knowledge base (runtime agent) |
| `ServiceDesk.OpenRouterApiKey` | `OPENROUTER_KEY` | the runtime agent on OpenRouter |

Each one is optional: without it, that part is skipped and the app still starts. The two local-only secrets go in git-ignored files, so `mxcli run restart` works:

```bash
(umask 077; printf mendix > .mxcli/pgvector.password; printf local-dev-introspection-secret > .mxcli/oauth-client.secret)
```

To share a preview, run with `--hub https://hub.mxcli.org` instead of `--local` (with `MXCLI_HUB_KEY` set), and leave out `ApplicationRootUrl`, because the hub sets it. While the hub is on, test locally at `http://127.0.0.1:8080`, not `localhost`. Chat streaming fails on `localhost` then; see `FINDINGS.md`.

```bash
./mxcli run --local --watch --detach --ensure-db -p ServiceDeskCopilot.mpr --runtime-setting ApplicationRootUrl=http://localhost:8080/ --constant Encryption.EncryptionKey=@file:.mxcli/encryption.key --constant ServiceDesk.MxGenAIKey=@env:GENAI_TEXT_KEY --constant ServiceDesk.MxGenAIKnowledgeBaseKey=@env:MX_KB_KEY --constant ServiceDesk.MxGenAIEmbeddingsKey=@env:MX_EMBEDDINGS_KEY --constant ServiceDesk.PgVectorPassword=@file:.mxcli/pgvector.password --constant ServiceDesk.VectorDbReaderPassword=@file:.mxcli/vectordb-reader.password --constant ServiceDesk.OAuthClientSecret=@file:.mxcli/oauth-client.secret --constant ServiceDesk.OpenRouterApiKey=@env:OPENROUTER_KEY
```

The MCP server needs `ApplicationRootUrl`, which `run --local` otherwise leaves unset. Without it the app still starts, without the MCP server.

Run the scripts in `mdlsource/` in file order. They need an mxcli built from `main` after 2026-11-10 13:45 UTC, or a nightly from 2026-11-11 on: `07-agents.mdl` writes each agent's selected model and the MCP services' endpoints, which older builds reject.

Live model tests cost GenAI units, so they are kept apart from `tests/`. Start the app as above with `--test-endpoint`, then run:

```bash
./mxcli test tests-live/ -p ServiceDeskCopilot.mpr --attach
```

Demo users:

| User | Password | Role |
|---|---|---|
| demo_customer | DemoCustomer1! | Customer, linked to Ada Jansen |
| demo_agent | DemoAgent1234! | SupportAgent |
| demo_administrator | DemoAdmin1234! | Administrator |

## What to try

| As | Where | What happens |
|---|---|---|
| demo_customer | Assistant | Ask about an order (SO-10001 to SO-10003), ask where a late parcel is (uses the carrier MCP server), or ask for a refund. The refund waits for your Confirm. |
| demo_customer | Assistant | Your chats are listed on the left: pick an earlier chat, start a **New chat**, or delete one. Opening the assistant again, or the floating chat on Tickets, continues your latest chat. |
| demo_customer | Tickets → New ticket | The ticket-handling workflow starts, and AI triage fills in category, priority and summary. |
| demo_customer | Ticket → Add attachment | Upload a PDF or image. The document agent writes a summary of it. |
| demo_agent | My tasks | Claim *Resolve the ticket*, choose Resolved or Refund needed, then approve or reject the refund. |
| demo_agent | Assistant | "How urgent is ticket 1005?" The support agent calls the triage agent as a tool. |
| demo_customer | Assistant | "Is the e-bike from my order SO-10003 affected by any recall, and which suspension seat post fits it?" The answer comes from the product knowledge graph (SPARQL, through an MCP server). The battery recall covers batch B2603 only, and this bike is batch B2605. |
| demo_agent | Assistant | "Are both policy documents in the knowledge base?" The GetKnowledgeBaseStatus tool reads the PgVector database over SQL. Customers are refused. |
| demo_agent | Policy documents → Chunks (SQL) | The chunks stored for a document, read from the PgVector database through the External Database Connector. |
| demo_agent | Assistant (OpenRouter) | The same questions, answered by the runtime agent on a free OpenRouter model. |
| demo_agent | Policy documents | Upload `docs/demo-policies/*.md` and click *Load into knowledge base*. After about two minutes, ask either assistant "Can a customer return an e-bike after 10 days and 30 km?" |
| demo_agent / demo_administrator | Dashboard | Open tickets per category and priority, and refund totals. |
| demo_administrator | Token usage, Traces, Agents | GenAI usage, traces and the imported agents. |

## MCP servers

The support agent also **uses** an external MCP server: a stand-in parcel carrier in `tools/carrier-mcp/` (Python MCP SDK 2.x). Start it next to the app so the agent can track parcels:

```bash
python3 tools/carrier-mcp/server.py
```

The app itself **publishes** an MCP server too:

The app publishes `get_order_status`, `search_tickets` and a `ticket_reply` prompt at `http://localhost:8080/servicedesk/mcp` (streamable HTTP, protocol 2025-03-26). Clients sign in with an app account, sent as `Username` and `Password` headers. Tools run as that user, so a customer only reaches their own orders and tickets. An MCP client config for Claude Code:

```json
{ "mcpServers": { "servicedesk": { "type": "http", "url": "http://localhost:8080/servicedesk/mcp",
  "headers": { "Username": "demo_customer", "Password": "DemoCustomer1!" } } } }
```

### OAuth 2.0 (Keycloak)

A second copy of the server, `http://localhost:8080/servicedesk-oauth/mcp`, takes OAuth 2.0 bearer tokens instead of app passwords. The issuer is a local Keycloak with the same demo users:

```bash
sh tools/keycloak/start.sh
```

MCP clients find the issuer themselves: the 401 response points to the protected-resource metadata, which names `http://localhost:8280/realms/servicedesk`. Sign in with client `mcp-client` (authorization code + PKCE, scope `mcp:tools`). Tokens without that scope, or issued to another client, get 401. `python3 tests-live/mcp/oauth_test.py` runs the whole flow headlessly. The Keycloak admin console is at http://localhost:8280/admin (admin/admin). Everything here is a local development setup: plain HTTP, and a known client secret.

## Runtime agent on OpenRouter (free models)

"Assistant (OpenRouter)", for support agents and administrators, chats with **Support Agent (runtime)**. It is built at runtime in Agent Commons and runs on a free OpenRouter model (`ServiceDesk.OpenRouterModel`) through the OpenAI Connector. It is created at startup from Agent Commons export JSON. Administrators can then change it, add versions and run tests on the **Agents** page without a redeploy.

Pass the API key per run: `--constant ServiceDesk.OpenRouterApiKey=@env:OPENROUTER_KEY`.

Free models are often rate-limited. If the assistant answers with an error, try again, or set `ServiceDesk.OpenRouterModel` to another free model that supports tool calls.

## Policy knowledge bases

*Load into knowledge base* on the **Policy documents** page splits a document into paragraphs and loads them twice:

- into a **Mendix Cloud GenAI** knowledge base (collection `policies`), used by the design-time SupportAgent. It needs `MX_KB_KEY`.
- into a **PgVector** knowledge base in a local PostgreSQL database, used by the runtime agent. It is embedded by a Mendix Cloud GenAI embeddings model, because OpenRouter has no embedding models. It needs `MX_EMBEDDINGS_KEY` and a database with pgvector. Set the database up once, on the app's local PostgreSQL 16:

```bash
apt-get install -y postgresql-16-pgvector
```

```bash
su postgres -c "psql -c 'create database servicedesk_vectors owner mendix' -d postgres && psql -d servicedesk_vectors -c 'create extension vector'"
```

Change the database with the `ServiceDesk.PgVectorJdbcUrl`, `ServiceDesk.PgVectorUser` and `ServiceDesk.PgVectorPassword` constants.

## Product knowledge graph (SPARQL, through MCP)

The support agent's product answers are grounded in a **product knowledge graph**: products, parts and compatibility, suppliers, known issues and recalls, and what each order contains (with battery production batches). The graph is `tools/fuseki/products.ttl`, served read-only by **Apache Jena Fuseki** (Apache 2.0). The agent reaches it through an **MCP server**, `tools/product-graph-mcp`. The MCP server decides what the agent can see. It offers curated tools (`order_products`, `find_product`, `compatible_parts`, `known_issues`) plus a read-only `sparql_query` that refuses anything but SELECT and ASK. This follows the pattern in Mendix's [agentic apps with a knowledge graph](https://www.mendix.com/blog/beyond-chatbots-building-agentic-apps-with-altair-mendix/) post.

Start both next to the app (Fuseki needs Java 21+ and downloads itself from Maven Central the first time):

```bash
sh tools/fuseki/start.sh
```

```bash
setsid nohup python3 tools/product-graph-mcp/server.py > /tmp/product-graph.log 2>&1 &
```

The SPARQL endpoint is `http://localhost:3030/products/sparql`, and the MCP endpoint is `http://127.0.0.1:8766/mcp` (constant `ServiceDesk.ProductGraphMcpEndpoint`). `python3 tests-live/mcp/product_graph_test.py` checks every tool. The graph does not know who is asking, so the agent is told to find an order with `GetOrderStatus`, which applies the app's access rules, before calling `order_products`. That guard is in the prompt only.

### Product graph page (SPARQL from the app)

Support agents and administrators also get a **Product graph** page: an outline of the whole graph, built with the Tree node widget. Open a class (Part, Order, Supplier...) to see its members, and a member to see its facts. → is a link to another node, and ← is a node that links here, such as the orders containing a part or the recall affecting it.

The app reads the graph itself, without the MCP server (`mdlsource/14-product-graph-outline.mdl`). It POSTs one SPARQL SELECT (`tools/fuseki/queries/outline.rq`) to `ServiceDesk.ProductGraphSparqlEndpoint`. A JSLT data transformer flattens the SPARQL JSON results, and an import mapping stores the rows as `GraphNode` objects; each row carries its parent's key. The outline loads the first time the page opens. **Reload from graph** replaces it, and keeps the last snapshot (with a message) when Fuseki is down.

## SQL to the vector database

The app also reads the PgVector database (`servicedesk_vectors`) with plain SQL, through Mendix's **External Database Connector** (`mdlsource/06b-vector-db-sql.mdl`), as a read-only user. Create the user once, with its password in a git-ignored file:

```bash
(umask 077; python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(24)), end='')" > .mxcli/vectordb-reader.password)
```

```bash
su postgres -c "psql -d servicedesk_vectors -c \"create role servicedesk_reader login password '$(cat .mxcli/vectordb-reader.password)'; grant connect on database servicedesk_vectors to servicedesk_reader; grant usage on schema public to servicedesk_reader; grant select on all tables in schema public to servicedesk_reader; alter default privileges for role mendix in schema public grant select on tables to servicedesk_reader\""
```

## Rich chat answers (cards)

Agent answers show **cards** instead of a wall of text: an order or parcel with its tracking timeline, a product, a recall, a ticket, a refund. The agents are told (in their system prompts) to put the key facts from their tool results in a ` ```card ` block of JSON. The chat renders the block as a card and renders the rest as markdown.

The cards come from the app's own pluggable widget, **ChatRichText** (`widgets-src/ChatRichText`, React + markdown-it, raw HTML escaped). `mdlsource/13-chat-rich-text.mdl` puts it in place of both Markdown viewers in Conversational UI's message snippet. **That customises a Marketplace module:** run the script again after updating Conversational UI. The runtime agent gets the card rules at startup, unless its prompt already has them, so an administrator's other prompt edits are kept.

Build the widget after changing it, then reinstall it:

```bash
cd widgets-src/ChatRichText && npm install && npm test && npm run build
```

```bash
cp widgets-src/ChatRichText/dist/1.0.0/com.servicedesk.widgets.ChatRichText.mpk widgets/ && ./mxcli widget init -p ServiceDeskCopilot.mpr
```

## Delivery statistics, charts and product outlines in the chat

Ask the assistant "On average, how long did my orders take to deliver?" or "Where is most time spent delivering my parcels?" and the answer is a **chart card**. Ask for "an overview of the EB-200" and it is a **product outline card**: a collapsible tree of what the product ships with, what fits it, what it fits on, and its known issues and recalls.

- **Delivery data** comes from the carrier. `tools/carrier-mcp/server.py` serves each parcel's scans over MCP (`track_parcel`, for the agent) and over plain REST (`GET /api/parcels`, for systems). The app syncs them at startup (`mdlsource/16-delivery-statistics.mdl`) into `Shipment` and `TrackingEvent`, and labels each scan with the leg it ends: warehouse, to the hub, at the hub, last mile. View entities (OQL) aggregate the legs per carrier, hub and customer. The agent tool **GetDeliveryStatistics** reads them, scoped to the customer's own orders, so the model reports numbers the database computed.
- **Demo history**: `python3 tools/demo-data/generate_deliveries.py` writes the carrier's `parcels.json` and the matching seed of 48 historical delivered orders (`mdlsource/15-order-history-seed.mdl`, generated; SO-10101 and up). DHL's Venlo hub is slow on purpose.
- **Clickable references**: any card field, item, chart label or outline node with a `ref` (a SKU, supplier, issue id or order number) is a link. Clicking it loads that node's details from the product graph, through `GET rest/productgraph/v1/nodes/{ref}` (`mdlsource/17-graph-node-api.mdl`). The endpoint uses the signed-in user's session, and a customer never sees another customer's orders in it.
- The outline card comes ready-made from the product graph MCP server's `product_outline` tool.

## Return requests: a workflow with agent steps

A customer asks the assistant to return something ("I'd like to return the child seat from order SO-10001, it doesn't fit"). The assistant looks the item up and starts the return once the customer confirms. Then the **WF_ReturnRequest** workflow (`mdlsource/18-return-requests.mdl`) runs:

1. **AI: check eligibility.** The ReturnEligibilityAgent reads the returns policy and the order's delivery facts (delivered on, days since delivery), and decides **Eligible**, **Not eligible** or **Needs review**. Its decision picks the workflow's path. When it cannot answer, the return goes to a person.
2. **Review the return** (support agent, only for Needs review): accept or decline, and write the reason the reply is based on.
3. **AI: draft the reply.** The ReturnReplyAgent writes the message, with a return label code for an accepted return.
4. **Approve the reply** (support agent): edit and send it, or **Ask AI to rewrite** with instructions, which loops back to step 3.
5. For an accepted return: **Confirm the parcel is back**, with a weekly reminder to the customer (at most 3). Then the refund is requested for a support agent to approve, and the return closes.

Customers follow their returns on the **Returns** page and can ask the assistant about them (tool GetReturnStatus). Support agents find the tasks under **My tasks**.

Start the helper servers (carrier, product graph, product graph MCP) with `sh tools/start-helpers.sh`; a recycled container stops them.

## Product explorer and graph cards

The product graph can be explored as a network, not only as an outline:

- **Product explorer** (menu, all roles; `mdlsource/19-product-explorer.mdl`, widget `widgets-src/GraphExplorer`). Search for a product, part, supplier, issue or order, and click a node to show its neighbours (dashed nodes are not expanded yet). Switch relation types on and off with the buttons above the graph. The panel shows the selected node's values and links. Colours mark the kind: bike, part, accessory, supplier, known issue, recall, order. Open it on a node with `p/product-explorer?ref=BAT-418`.
- **Graph cards in the chat**: ask "how is the BAT-418 battery connected to other products?" and the answer carries a small network around it, expandable in place, with a link to open it in the explorer.

Both draw with Cytoscape.js from one shared component (`widgets-src/shared/graph`, copied into each widget by its prebuild step). They read the graph through the reference API: `GET rest/productgraph/v1/nodes/{ref}` for a node and its links, and `GET rest/productgraph/v1/nodes?q=` to search. The API uses the signed-in user's session, so a customer finds and sees no orders but their own.

Build the widgets after changing them (`npm install` once in each):

```bash
cd widgets-src/ChatRichText && npm run build && cd ../GraphExplorer && npm run build
```

```bash
cp widgets-src/*/dist/1.0.0/*.mpk widgets/ && ./mxcli widget init -p ServiceDeskCopilot.mpr
```

Restart the app after installing a new widget package: the watch loop does not pick up `.mpk` changes.
