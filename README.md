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

Then start the app. The Mendix Cloud GenAI key is read from the `GENAI_TEXT_KEY` environment variable and never written to a file:

```bash
./mxcli run --local --watch --detach --ensure-db -p ServiceDeskCopilot.mpr --runtime-setting ApplicationRootUrl=http://localhost:8080/ --constant Encryption.EncryptionKey=@file:.mxcli/encryption.key --constant ServiceDesk.MxGenAIKey=@env:GENAI_TEXT_KEY --constant ServiceDesk.OAuthClientSecret=local-dev-introspection-secret
```

The MCP server needs `ApplicationRootUrl`, which `run --local` otherwise leaves unset. Without it the app still starts, without the MCP server.

Run the scripts in `mdlsource/` in file order. Change the agents with `scripts/apply-agents.sh`, not by running `mdlsource/07-agents.mdl` on its own. The script also fills in the agent fields mxcli does not write yet; see `FINDINGS.md`.

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
| demo_customer | Tickets → New ticket | The ticket-handling workflow starts, and AI triage fills in category, priority and summary. |
| demo_customer | Ticket → Add attachment | Upload a PDF or image. The document agent writes a summary of it. |
| demo_agent | My tasks | Claim *Resolve the ticket*, choose Resolved or Refund needed, then approve or reject the refund. |
| demo_agent | Assistant | "How urgent is ticket 1005?" The support agent calls the triage agent as a tool. |
| demo_agent | Assistant (OpenRouter) | The same questions, answered by the runtime agent on a free OpenRouter model. |
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

The API key:
- **In this Claude Code environment** it is a saved network secret for `openrouter.ai`, injected by the proxy. The Mendix runtime only uses that proxy when started with:

  ```bash
  PORT=$(echo "$HTTPS_PROXY" | sed -E 's#.*:([0-9]+)/?$#\1#')
  JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=$PORT" ./mxcli run --local ... (as above)
  ```

- **Elsewhere,** pass the key: `--constant ServiceDesk.OpenRouterApiKey=@env:OPENROUTER_API_KEY`.

Free models are often rate-limited. If the assistant answers with an error, try again, or set `ServiceDesk.OpenRouterModel` to another free model that supports tool calls.
