# Findings

Lab notebook for this project. Append as work proceeds; newest sections at the bottom.

## Environment (2026-11-08)

- Mendix 11.16.0. MxBuild and the runtime were already cached in the session image at
  `~/.mxcli/mxbuild/11.16.0`, and both tarballs return HTTP 200 on cdn.mendix.com.
- mxcli `nightly-20261107-6e1f4e7db`, pre-installed at `/usr/local/bin/mxcli`.
  - The seed prompt's `curl` of the nightly binary from GitHub Releases failed with
    **HTTP 504**. The pre-installed binary was used instead, and `./mxcli` is a symlink to it.
- `MENDIX_PAT` is set on the environment; `mxcli auth status` validates it, so Marketplace
  installs are possible.
- MDL scripts are `mdl 1`.
- `mxcli run --local --setup --ensure-db` started local Postgres and created database
  `servicedeskcopilot` without problems.
- `mxcli init` warns that branch `claude/magical-davinci-0stz2t` has no upstream, and that
  Studio Pro 11.13 cannot open a project in that state. Pushing the branch resolves it.

## Research: Agents Kit 2 on Mendix 11.16 (2026-11-08)

Sources: docs.mendix.com/agents/agents-kit-2/ and the Mendix 11.12 to 11.16 release blog
posts. Versions were taken from the Agents Kit 2 landing page; check the Marketplace
before pinning them.

### Latest module versions (Studio Pro 11.12+)

| Module | Version |
|---|---|
| Agent Commons | 4.4.0 |
| Agent Editor | 2.6.0 |
| Conversational UI | 7.4.0 |
| GenAI Commons | 7.3.0 |
| Mendix Cloud GenAI Connector | 7.4.0 |
| MCP Client | 4.4.0 |
| MCP Server | 5.4.0 |
| OpenAI (incl. Microsoft Foundry) | 9.4.0 |
| Amazon Bedrock | 11.3.0 |
| Google Gemini | 2.2.0 |
| Mistral | 2.2.0 |
| PgVector Knowledge Base | 7.1.0 |
| Blank GenAI App | 5.4.0 |
| Agent Builder Starter App | 2.1.1 |
| GenAI Showcase App | 10.6.0 |

### Features by release

- **11.12 (LTS)** — Agents Kit 2.0. Agent Editor, where agents are Studio Pro documents,
  becomes the preferred way to build agents. Mendix Cloud GenAI gains multi-model access
  (Claude Haiku, Sonnet and Opus behind one key; connector 6.2.0+). Traces and
  human-in-the-loop arrive, and the MCP client gains bearer-token auth.
- **11.13** — Azure AI Foundry is available as a provider in Agent Editor. `SKILL.md` files
  ship in GenAI Commons, Agent Commons, Conversational UI and the MxCloud connector. A
  scheduled agent health check flags versions missing a model, knowledge base or tool.
- **11.14** — Human-in-the-loop per tool and per knowledge base (show, hide or require
  approval) plus tool name and description override, in Agent Editor. Word-by-word
  streaming (Agent Editor 2.2.1+, Agent Commons 2.2.0+, Conversational UI 7.2.0+; connectors
  MxCloud 7.2+, OpenAI 9.2+, Gemini 2.1+, Mistral 2.1+; Bedrock later). Claude Sonnet 5 and
  Opus 5 added to the resource packs.
- **11.15** — Maia "make me an agent" creates and edits Agent, Model, KB, consumed MCP and
  published MCP documents.
- **11.16** — OAuth 2.0 for Published MCP Service documents (Agent Editor 2.6.0 +
  MCP Server 5.4.0). Maia plan mode, Playwright UI testing in Maia.
- The docs version numbers conflict: the 11.9 post requires Agent Commons 3.0.1+ for
  human-in-the-loop, while the 11.14 post requires Agent Commons 2.2.0+ for streaming. This
  is likely a typo and does not matter on 4.4.0.
- No dedicated evaluation module exists. Agent Commons has single and bulk test runs with
  comparison of results.

### Provider limits

- **Agent Editor** supports text generation from Mendix Cloud GenAI and Azure AI Foundry
  only, and knowledge bases from **Mendix Cloud GenAI only**. OpenAI and Bedrock are
  "planned". There is no bring-your-own provider.
- **Agent Commons** (runtime agents) accepts any GenAI Commons connector.
- Streaming per the Agent Commons docs is "currently only Mendix Cloud GenAI". This
  contradicts the 11.14 post, which lists OpenAI 9.2+ and others. Not yet verified.
- Agent Editor MCP tools are whole-server only, and published MCP services expose tools
  only (no prompts).
- Agent Commons and Agent Editor do not have the same features yet, especially for
  human-in-the-loop.

### OpenAI-compatible APIs (LiteLLM, vLLM, Ollama, OpenRouter, ...)

- OpenAI Connector 9.4 offers the API types `OpenAI` and `AzureOpenAI`. The Endpoint field is
  free text, and the connector uses Chat Completions (no Responses API).
- "OpenAI-compatible" endpoints are **not documented**. They probably work when the gateway
  implements `/chat/completions` and passes tool calls through. Must be tested.
- They are usable **only with Agent Commons**, not with Agent Editor, the AI Agent Task in
  workflows, the Studio Pro playground, or Maia agent creation.
- The OpenAI connector does not store knowledge bases (except Azure AI Search). The
  documented alternative is OpenAI embeddings stored in PgVector Knowledge Base, which works
  with Agent Commons only.

### Local testing with Mendix Cloud GenAI resources

- Supported. The key is held in a String constant, so the local value can differ from the
  cloud value ("you can locally connect to a text generation resource using a different
  key"). No IP allowlist or Mendix-Cloud-only restriction is documented.
- The Agent Editor **Test** button runs calls through the locally running app. It requires
  no consistency errors, the app running, `ASU_AgentEditor` having run, and the model being
  reachable. Restart the app after editing an agent.
- The playground does not show streaming or per-tool and per-knowledge-base permissions.
- Mac support is limited; Mendix recommends Windows.
- There is no trial or free tier. Resource packs are paid with Cloud Tokens:
  - 1 token = 100 GenAI Units per month, and unused units do not roll over.
  - A resource is blocked at 100% usage, with alerts at 80% and 100%.
  - Price per 1M tokens, input/output, in GenAI Units: Haiku 5.5 17.9/89.5,
    Sonnet 4.6 107/537, Opus 4.8 179/895.
  - The Standard knowledge base costs 48 tokens.
- Advice: use a separate Test resource and key for local development, and Haiku for routine
  testing.
- Unknown: whether a key is bound to the environment chosen at provisioning.
- Connector docs recommend at least JDK 11.0.5 to avoid TLS `record_overflow` errors.

## mxcli support for the agent stack (2026-11-08)

Checked with `mxcli syntax agents*`, `list features`, and the `agents` and
`download-marketplace-content` skills.

Supported:
- CREATE, ALTER, DROP, DESCRIBE and LIST for **AI Model**, **Knowledge Base**,
  **Consumed MCP Service** and **Agent** documents (11.9+).
- The **AI Agent Task** workflow activity (11.9+).
- `mxcli marketplace install` for the 7-module stack. A worked example on 11.12.1 shows that
  `--version` is required and that `mxcli fix widgets` and `mxcli fix design-properties` are
  needed afterwards.

Gaps, filed on ako/mxcli:
- [ako/mxcli#2020](https://github.com/ako/mxcli/issues/2020) No **Published MCP Service** document. Without it, the app's microflows cannot be exposed
  as MCP tools, so the 11.16 OAuth 2.0 feature cannot be tested.
- [ako/mxcli#2021](https://github.com/ako/mxcli/issues/2021) Agent tools and knowledge bases have no **user access / approval** properties (HiddenForUser,
  VisibleForUser, UserConfirmationRequired) and no tool **name/description override**
  (Agent Editor 2.2+).
- [ako/mxcli#2022](https://github.com/ako/mxcli/issues/2022) No **streaming** setting on AI Model documents (11.14).
- [ako/mxcli#2023](https://github.com/ako/mxcli/issues/2023) The `Provider` value is free-form and unvalidated. No documented value for **Azure AI
  Foundry**, and a typo only shows up when Studio Pro opens the document.
- [ako/mxcli#2024](https://github.com/ako/mxcli/issues/2024), corrected 2026-11-08: Studio Pro's "Call Agent" toolbox actions
  are exposed Java actions (`AgentEditorCommons.Agent_CallDocument_WithHistory` / `_WithoutHistory` /
  `ChatContext_Create_ForAgentDocument`), and `call java action` already writes them. Only the agents
  skill is out of date.

## Quality baseline, blank app (2026-11-08)

These are the numbers for the unmodified template, before any of our own work.

- `mxcli lint`: 8 issues — 0 errors, 0 warnings, 8 info, all in `MyFirstModule`.
  - Example: QUAL004, the unused `MyFirstLogic`.
- `mxcli report`: overall score 99/100.

| Category | Score |
|---|---|
| Security | 99 |
| Quality | 95 |
| Architecture | 100 |
| Performance | 100 |
| Naming | 99 |
| Design | 100 |
| Other | 99 |

- Boot check: `mxcli run --local --watch --detach` came up, and http://127.0.0.1:8080/ returns HTTP 200.
- Already tracked: `marketplace install` does not install module dependencies and leaves CE0463
  widget definitions behind ([ako/mxcli#1409](https://github.com/ako/mxcli/issues/1409)).
- Not a gap: MCP Client 4.4 supports protocol v2025-11-25. mxcli's `ProtocolVersion` is free-form, so
  the value passes through; only `v2024_11_05` and `v2025_03_26` are documented.

## Agents Kit install (2026-11-08)

Installed with `mxcli marketplace install <id>`; each resolved to the latest release, which
is compatible with 11.16.0:

- CommunityCommons 11.5.1
- GenAI Commons 7.3.0
- Encryption 11.1.2
- Mendix Cloud GenAI Connector 7.4.0
- MCP Client 4.4.0
- Markdown viewer and Events (widgets)
- Conversational UI 7.4.0
- Agent Commons 4.4.0
- MCP Server 5.4.0
- **Agent Editor 2.7.0**, published 2026-11-06. This is newer than the 2.6.0 the docs list.

Notes:
- Agent Commons failed once with `TLS handshake timeout` against marketplace.mendix.com and
  worked on retry.
- Each install fixed widget definitions (CE0463) and design properties (CE6087) itself, so no
  separate `mxcli fix` run was needed.
- `mxcli docker check` (mxbuild 11.16.0) afterwards reports **0 errors**.
- The 11.12.1 worked example in the skill needed `--version` pins. On 11.16.0 the latest
  versions install as they are.

## Step A: data, security, pages, setup (2026-11-08)

Built from `mdlsource/01-domain-model.mdl` to `04-pages.mdl`, and `tests/01-chat-agent.test.mdl`.
Each script runs twice, and the second run writes nothing.

Gates:
- `check`: clean.
- `lint`: 0 errors, 15 warnings, 57 info. The warnings are deliberate demo choices recorded in
  the brain:
  - SEC003: demo users at Production level.
  - SEC008 and CONV007: staff read all rows.
  - CONV006: create and delete from pages.
  - ARCH003: no business keys.
- `report`: 78/100. Security 40, Architecture 82, Quality 85. Down from the blank app's 99,
  for the reasons above.
- `docker check` (mxbuild 11.16.0): 0 errors.
- `test --local`: 4/4 pass.
- `run --local` boots with HTTP 200.
- `mxcli playwright check` per role:
  - SupportAgent and Administrator: all 6 pages render, with 10 tickets and 15 orders.
  - Customer (demo_customer): 2 tickets and 3 orders, only their own. Customers, Refunds and
    Policies are refused with 403, which is correct.

Surprises:
- **The blank template ships with Security level Off.** `check`, `lint` and `mx check` all passed
  while every entity access rule was ignored. The demo customer saw all 10 tickets and the
  Customers page, and no demo users were created, so `demo_agent` could not log in.
  `playwright check` per role was the only gate that caught it.
  - Prototype level fixes page access but still shows the customer every row, because it does
    not enforce entity access.
  - Production level is needed for row-level XPath. It surfaced 2 new CE2729 errors (a file
    manager without write access), which are now fixed.
- **Marketplace install does not download managed Java dependencies.** `mx check` passed, but
  `test --local` failed with "An error occurred while compiling Java actions": the MCP SDK,
  Jackson and Reactor JARs were missing from `vendorlib/`.
  - Fix: `~/.mxcli/mxbuild/11.16.0/modeler/mx sync-java-dependencies ServiceDeskCopilot.mpr`,
    with `LD_PRELOAD` set to the system libfreetype.
  - The first attempt failed with "Failed to find some hosts". Maven Central returned 429 to curl
    at the same time; the second attempt worked.
- **Demo users do not exist yet when the after-startup microflow runs** on a fresh database. The
  seed creates `demo_customer` itself.
- MDL: the enumeration value `New` is reserved (MDL010). `AutoCreatedDate` attributes are always
  named `CreatedDate`, and a custom name is discarded (MDL022). A hyphenated icon name has to be
  quoted: `Atlas_Core.Atlas."shopping-cart"`.
- The encryption key is passed per run from a git-ignored file:
  `--constant Encryption.EncryptionKey=@file:.mxcli/encryption.key`.
- Filed:
  - [ako/mxcli#2027](https://github.com/ako/mxcli/issues/2027): security level Off passes every gate.
  - [ako/mxcli#2028](https://github.com/ako/mxcli/issues/2028): marketplace install does not sync managed
    Java dependencies.

## Step B: agents and chat (2026-11-08)

What it adds:
- `mdlsource/05-agent-tools.mdl` to `07-chat.mdl`.
- `scripts/apply-agents.sh` and `scripts/patch-agent-documents.py`.
- 6 tool tests in `tests/`, and a live model test in `tests-live/`.

Verified live with `GENAI_TEXT_KEY`, passed per run as `--constant ServiceDesk.MxGenAIKey=@env:GENAI_TEXT_KEY`:
- **The key works from outside Mendix Cloud.** It imported into a `run --local` app in a Claude Code
  cloud container and exposed 11 Claude models: Haiku 4.5 and 5.5, Sonnet 4.5, 4.6, 5 and 5.5,
  Opus 4.6, 4.7, 4.8, 5 and 5.5.
- **Chat as `demo_customer`:** "Where is my order SO-10002?" called `GetOrderStatus` and answered
  with the real order data.
- **Refund request:** the request for a refund stopped at a **Confirm / Reject** prompt, so
  human-in-the-loop works. After Confirm, `IssueRefund` created a RefundRequest of EUR 10, status
  Requested, which OQL confirms.
- **Triage task agent** (Haiku 5.5) returns `{"category","priority","summary"}` JSON
  (`tests-live/`, passes with `--attach`).
- **Admin pages:** Token consumption monitor, Traces and Agents render. Traces show the Sonnet 5.5
  call with 2,800 tokens and 1 tool call.

Gates:
- `check`: clean.
- `docker check`: 0 errors.
- `test --local`: 10/10.
- `lint`: 0 errors, 14 warnings. The 2 new ones are CONV010 on `ACT_Ticket_AddAttachment` and
  `MxTest` noise while the test endpoint runs.
- `report`: 76/100.
- `playwright check` per role: Customer sees 2 tickets and 3 orders; SupportAgent and
  Administrator see 10 and 15.

mxcli gaps found. These block Agent Editor agents written with mxcli from
working at all:
1. [ako/mxcli#2030](https://github.com/ako/mxcli/issues/2030): **`create agent` drops `Document:` on microflow tools.** Only MCP tools get their document
   reference written (`mdl/executor/cmd_agenteditor_write.go`). Tool `id` is left empty and
   `userAccessApproval` is never written. As a result, the Mendix Cloud GenAI connector sends the
   tools without a `toolSpec` wrapper, and Bedrock rejects the call with HTTP 400 ("property 'name'
   is not defined in the schema"). `describe agent` does print `Document:` once it is present.
2. [ako/mxcli#2031](https://github.com/ako/mxcli/issues/2031): **No `selectedModel` on agents.** With multi-model resources (11.12+), the agent document holds
   `selectedModel: {id, name}`, and the import matches `id` against the deployed model ID. Without
   it the import refuses the agent ("Model with name  is referenced but could not be found") and
   the **whole agent import aborts**.
3. `create or modify agent` rebuilds the JSON and drops any field it does not model, so these
   have to be re-applied after every exec.
4. [ako/mxcli#2022](https://github.com/ako/mxcli/issues/2022) (commented): streaming is stored on the **agent** (`enableBackendStreaming`, `enableUIStreaming`), not the
   model. The Agent Editor import honours it, which the OQL on `AgentCommons.Version` confirms.
5. [ako/mxcli#2023](https://github.com/ako/mxcli/issues/2023) (commented): provider values accepted by `AgentEditorCommons.ImportDeployedModel`: `MxCloudGenAI`, `Azure`
   (Azure AI Foundry) and `Fuse`.

Workaround: `scripts/patch-agent-documents.py` writes items 1, 2 and 4 into the agent unit's JSON.
It fixes the BSON length prefixes and the unit's `ContentsHash`, which is base64 SHA-256 of the
`.mxunit` file. `mxcli diag --check-units` and `docker check` stay clean. `scripts/apply-agents.sh`
runs it after `06-agents.mdl`.

Other surprises:
- **Claude 5.5 models reject `temperature`**: HTTP 400 "`temperature` is deprecated for this
  model". The agents set none.
- Microflow tests run as a system session, so `'[%CurrentUser%]'` in XPath throws. The tools use
  `$currentUser` with an empty-check, which is also safe for workflow and background calls.
- `GenAICommons.StoreTraces` defaults to false. It is now true in the Default configuration.
  Chat calls are traced; a direct `Agent_CallDocument_WithoutHistory` from a microflow test is not.
- The connector logs `404 - file not found for file: llm-streaming` on the first streaming call.
  That is it registering its request handler, and the reply still arrives.
- `mxcli run --test-endpoint` writes `javasource/mxtest/`, which got committed once in Step A. It
  is now git-ignored.
- Demo-user passwords only take effect after a runtime restart.
- The knowledge base is defined but not attached: `GENAI_TEXT_KEY` is a text-generation key, and
  a knowledge base needs its own resource and key (`ServiceDesk.MxGenAIKnowledgeBaseKey`).
- The model once said it had answered "before looking up" the order, although the tool span shows
  the call ran first. It looks like a model quirk; worth watching once streaming is visible in the UI.
- [ako/mxcli#2021](https://github.com/ako/mxcli/issues/2021) (commented): `userAccessApproval` is stored per tool in the
  agent document. When it is absent, the import defaults the tool to `HiddenForUser`.

## Slice 02: ticket workflow, attachments, agent-as-tool, dashboard (2026-11-08)

What it adds:
- `mdlsource/05-ticket-workflow.mdl`, with the scripts renumbered: tools are now 06, agents 07,
  chat 08.
- The dashboard view entities, in `04-pages.mdl`.
- The `DocumentAgent` and the `TriageTicket` tool, in 06 and 07.
- 6 more tests in `tests/02-triage-workflow.test.mdl`.

Verified live in the browser with `GENAI_TEXT_KEY`:
- **Customer creates a ticket** → `WF_TicketHandling` starts → the **AI Agent Task** runs the
  TriageAgent (Haiku 5.5) → the ticket gets category, priority and summary, and moves to In
  progress. Examples: "Invoice charged twice" → Billing/High; "Wrong colour helmet" → Product/High.
- **Support agent** → My tasks → *Resolve the ticket* → Assign to me → **Refund needed** → *Approve
  the refund* → **Approve** → the ticket is Resolved and the requested refund is set to Approved.
- **Attachment:** a PDF invoice uploaded by the customer is read by the DocumentAgent through a
  GenAI Commons FileCollection. It found "two approved card charges of EUR 249.95 for a single
  item".
- **Agent-as-tool:** asking the chat "How urgent is ticket 1005?" made the SupportAgent call
  `TriageTicket`, which runs the TriageAgent. Answer: Product / Urgent.
- **Dashboard:** the view entities `TicketStats` (open tickets per category and priority) and
  `RefundTotals` (count and sum per status) are computed by the database. Staff only; customers
  get 403.

Gates:
- `check`: clean.
- `docker check`: 0 errors.
- `test --local`: 16/16.
- `lint`: 0 errors, 16 warnings.
- `report`: 72/100. Architecture fell to 58 because of ARCH001 on task pages, see below.
- `playwright check` per role passes.
- A second exec of every script writes nothing, except `07-agents.mdl`, which mxcli rewrites
  (ako/mxcli#2031).

Surprises:
- **`check --references` resolves agent-document names** passed to
  `Agent_CallDocument_*(Agent = 'Module.Agent')`. Combined with the dependency cycle tool →
  workflow → agent → tool, no script order works on a fresh project. The workflow and attachment
  microflows therefore retrieve `AgentCommons.Agent` by `_QualifiedName` and call
  `AgentCommons.Agent_Call_WithoutHistory`, which is what `Agent_CallDocument_*` does internally.
- **The Customer role cannot write `Ticket_Customer`**, so a ticket created on the page was saved
  without a customer and vanished from the customer's own list. Only browser rows per role caught
  it. `SUB_Ticket_Submit` now links it.
- [ako/mxcli#2033](https://github.com/ako/mxcli/issues/2033): **`mxcli run --test-endpoint` triggers a second build right after boot**, about 30 seconds of
  "Failed to fetch dynamically imported module …/dist/pages/*.js" 404s and a forced client
  reload. Without `--test-endpoint` the app stays on build #1.
- [ako/mxcli#2034](https://github.com/ako/mxcli/issues/2034): **Lint ARCH001 flags `System.WorkflowUserTask` on task pages and the task inbox.** Mendix
  requires that parameter on a task page, so these 3 warnings are false positives.
- A `create or modify microflow` that changes a decision's nesting is refused (MDL-V1-REBUILD).
  `ACT_Ticket_Save` had to be dropped and recreated once.
- An import mapping with an object root must not use `first` (MDL-MAP04: it builds, then throws
  at runtime).
- Microflow tests roll back per test, so data-count tests see the seeded state.

## Slice 03: publishing the app as an MCP server (2026-11-08)

What it adds:
- `mdlsource/09-mcp-server.mdl`, which follows the runtime-configuration pattern of the mcp-server skill in
  [ako/mxcli#2041](https://github.com/ako/mxcli/pull/2041):
  - `MCP_Initialize` calls `MCPServer.CreateMCPServer`, then `AddTool` twice and `AddPrompt` once.
  - It runs from `ASU_App`, which now lives in this script.
- MCP Server **5.4.0** still has that runtime API. Its 5.x additions are `AuthorizationServerUrl`, `Scopes` and `Title`.
- **Tools:** `get_order_status` and `search_tickets` reuse the agent tool microflows, which return String.
- **Prompt:** `ticket_reply`.
- **Endpoint:** `http://localhost:8080/servicedesk/mcp`, protocol `v2025_03_26`, streamable HTTP.

Verified with a raw MCP client (Python, streamable HTTP):
- No credentials, or a wrong password → **401**.
- As `demo_customer`, initialize works and the server lists 2 tools (with titles) and 1 prompt.
- `get_order_status SO-10002` (own order) → status and tracking.
- `get_order_status SO-10004` (Bram's order) → "No order found … for this user". **The tools run as
  the authenticated user**, so `$currentUser` is set and customer scoping works.
- `prompts/get ticket_reply` fills in the ticket.
- The server survives an mxcli hot reload, and a full restart re-registers it.

Gates:
- `docker check`: 0 errors.
- `test --local`: 16/16.
- `lint`: 0 errors, 20 warnings. The 4 new ones are CONV013 on the MCP Java action calls, which come
  straight from the skill's example.

Surprises:
- **`MCPServer.CreateMCPServer` throws an NPE under `mxcli run --local`.** It builds its endpoint from
  `ApplicationRootUrl`, which `run --local` leaves unset when the model holds the stock
  `http://localhost:8080/`. The after-startup microflow failed, and so did the whole app start.
  - Fix for a local run: `--runtime-setting ApplicationRootUrl=http://localhost:8080/`.
  - `MCP_Initialize` now logs the failure and lets the app start, so `mxcli test --local`, which has no
    such flag, keeps working.
- Under `mdl 1;`, a string literal `'\n'` is stored as written, so Mendix wrote a literal backslash-n
  into the search result. The ticket search now separates results with `; `.
- After the container was recycled, the local Postgres was gone. `run --local --ensure-db` re-provisions
  it, and the persisted data directory kept the seeded data.
- OAuth 2.0 is not set up: it needs an external authorization server. The Published MCP Service
  document (model configuration) is still not writable from MDL ([ako/mxcli#2020](https://github.com/ako/mxcli/issues/2020)).

## Switched to mxcli nightly 2026-11-09 (2026-11-09)

ako/mxcli [#2037](https://github.com/ako/mxcli/pull/2037) and [#2038](https://github.com/ako/mxcli/pull/2038)
are merged and in `nightly-20261109-a88c4d94f`. It is installed in place of the pre-installed 11-07
build, which is also an ako/mxcli nightly. Note that `.claude/bootstrap-mxcli.sh` downloads from
`mendixlabs/mxcli` when no mxcli is present.

What changed:
- `mdlsource/07-agents.mdl` now writes tool approval (`UserAccessApproval`) and streaming
  (`EnableBackendStreaming`, `EnableUIStreaming`) itself.
- `scripts/agent-document-fields.json` holds only `selectedModel`, which mxcli still cannot write
  ([#2031](https://github.com/ako/mxcli/issues/2031)).

Verified:
- A second exec of **every** script, 01–09 including the agents, writes nothing. That is the first
  time the whole sequence is idempotent without the patch step.
- `docker check`: 0 errors. `test --local`: 16/16. `lint`: unchanged at 0 errors and 20 warnings.
- Live: all three agents import. The approval settings in Agent Commons match the script. A chat
  question calls GetOrderStatus. The MCP server answers.
- The same tests on a copy, with mxcli built from merged `main`:
  - Recreating the agents from the script alone stores each tool's document, id and approval, plus
    the streaming switches.
  - `selectedModel` stays empty until the patch sets it, and later execs keep it.

## Slice 03: consuming an external MCP server (2026-11-09)

What it adds:
- `tools/carrier-mcp/server.py`: a stand-in parcel carrier that publishes `track_parcel` and
  `list_carriers` over MCP. It uses the Python MCP SDK 2.3 (`mcp.server.mcpserver.MCPServer`; FastMCP
  was renamed in 2.x), runs streamable HTTP on `127.0.0.1:8765/mcp`, and knows the tracking codes of
  the demo orders.
- `mdlsource/07-agents.mdl`:
  - the constant `ServiceDesk.CarrierMcpEndpoint`;
  - the consumed MCP service `ServiceDesk.CarrierTracking`;
  - an `mcp service` block on the SupportAgent, with `UserAccessApproval: VisibleForUser`.

Verified live as `demo_customer`:
- Question: "My parcel for order SO-10002 still has not arrived. Where is it and why is it late?"
- The agent called `GetOrderStatus`, then **`track_parcel` on the carrier server**; its log shows the
  MCP session and the calls.
- Answer: delayed at the DHL hub in Venlo because of a sorting backlog, expected 2026-11-10.
- Sonnet 5.5 again added an odd "I used the tracking code before I had confirmed it" note. Its
  answer was correct.

Gates:
- A second exec of every script writes nothing.
- `docker check`: 0 errors. `test --local`: 16/16. `lint`: unchanged.

Gap ([ako/mxcli#2060](https://github.com/ako/mxcli/issues/2060)):
- `create consumed mcp service` cannot write `endpoint` (a String-constant reference) or
  `authenticationMicroflow`. Without `endpoint` the service connects nowhere.
- `scripts/patch-agent-documents.py` now sets both from `scripts/agent-document-fields.json`. The
  #2037 carry keeps them on later execs.

Note: `track_parcel` answers for any tracking code; it is not scoped to the signed-in customer, as
with real carriers. To run the demo, start the carrier server next to the app:
`python3 tools/carrier-mcp/server.py`.

## Slice 03: OAuth 2.0 on the published MCP server, with a local Keycloak (2026-11-09)

What it adds:
- **`tools/keycloak/`**:
  - `start.sh` downloads Keycloak 26.4.2 when it is missing and runs `start-dev` on port 8280 with
    Java 25. Docker is installed, but its daemon is not running.
  - `servicedesk-realm.json` imports the realm. It holds the demo users with the app's names and
    passwords and the `mcp:tools` client scope, whose audience mapper adds `servicedesk-mcp`. Its
    clients:

    | Client | Type | Purpose |
    |---|---|---|
    | `mcp-client` | public | auth code + PKCE; also password grant for tests |
    | `servicedesk-mcp` | confidential | the app introspects tokens with it |
    | `other-app` | public | a negative control |
- **`mdlsource/09-mcp-server.mdl`**:
  - a second server, `/servicedesk-oauth/mcp`, created with `AuthorizationServerUrl` and
    `Scopes = mcp:tools`;
  - `MCP_Authenticate_OAuth`, which introspects the bearer token (RFC 7662) through an inline
    REST call with basic auth. It requires `active`, `aud = servicedesk-mcp` and the scope, then
    maps `preferred_username` to the app user. It never throws, so failures become 401;
  - `SUB_MCP_RegisterTools`, which both servers share.
- **`tests-live/mcp/`**: `basic_auth_test.py` and `oauth_test.py`.

Verified with `tests-live/mcp/oauth_test.py`, which acts as an MCP client using only discovery:
- **Discovery:**
  - no token → 401 with `WWW-Authenticate: Bearer resource_metadata="…/servicedesk-oauth/.well-known/oauth-protected-resource", scope="mcp:tools"`;
  - the metadata names Keycloak as the authorization server, with scope `mcp:tools`;
  - Keycloak's metadata offers PKCE S256.
  - The MCP Server module publishes all of this itself once `AuthorizationServerUrl` is set.
- **Authorization code + PKCE login,** submitting Keycloak's form as a browser would, with
  `resource` = the MCP URL:
  - as `demo_customer`, SO-10002 is found and Bram's SO-10004 is "not found";
  - as `demo_agent`, both orders are found.
- **Refused with 401:** a garbage token, a token from `other-app` (no audience), and an `mcp-client`
  token without `mcp:tools`. The same client with `mcp:tools` gets 200.

Gates:
- A second exec of every script writes nothing.
- `docker check`: 0 errors. `test --local`: 16/16 (the first run printed no summary; the re-run
  passed). `lint`: 0 errors, 20 warnings.

Notes:
- Keycloak sets its login cookies `Secure`. Browsers send those to `http://localhost`, but Python's
  cookie jar does not, so the test client uses a cookie policy that accepts them.
- A realm import that defines `clientScopes` replaces Keycloak's built-in scopes (`profile`,
  `email`). `preferred_username` therefore comes from a mapper on `mcp:tools`.
- Introspection returns `aud` as a string when there is one audience. A token with several audiences
  returns an array, which the import mapping cannot read, so it is refused. That is safe, but
  stricter than necessary.

## Slice 04: runtime agent on an OpenAI-compatible endpoint (OpenRouter, free models) (2026-11-09)

What it adds:
- **OpenAI Connector 9.4.0** (Marketplace 220472). Its Java dependency sync failed once with "Failed
  to find some hosts" and worked on retry.
- **`mdlsource/10-runtime-agent.mdl`**, run at startup:
  - `ASU_ConfigureOpenAICompatible` creates or updates the OpenAI Connector configuration
    "OpenRouter" (ApiType OpenAI, endpoint `https://openrouter.ai/api/v1`) and a text deployed model
    with tool calling;
  - `ASU_SeedRuntimeAgent` creates "Support Agent (runtime)" with `AgentCommons.Agent_GetCreate_Json`,
    Agent Commons' own export/import JSON, holding the four tools and their approval settings;
  - a chat for staff on it, under the menu item "Assistant (OpenRouter)".
- **`mdlsource/99-app-shell.mdl`**: the after-startup microflow and the navigation menu, which
  reference every other script, now run last.
- **OpenRouter key:** the `OPENROUTER_KEY` variable was **expired** (401 "API key expired"). A new key
  was saved as an environment network secret. The proxy injects it, and
  `ServiceDesk.OpenRouterApiKey` holds only a placeholder.

Model choice:
- 14 of 463 OpenRouter models are free and list tool support.
- Of four tried with a real tool call, only `nvidia/nemotron-3.5-super-vl:free` answered with a
  correct `GetOrderStatus` call. The Gemma models returned 429 (rate-limited upstream), and the
  Nemotron ultra model returned 502.

Verified live as `demo_agent`, under "Assistant (OpenRouter)":
- "Where is my order SO-10002?" → `GetOrderStatus` → the correct order details.
- A refund request for SO-10006 showed **Confirm / Reject**. After Confirm, a refund of EUR 5 was
  recorded with status Requested, so tool approval works on the runtime agent too.

Gates:
- A second exec of every script writes nothing.
- `docker check`: 0 errors. `test --local`: 16/16. `lint`: 0 errors, 20 warnings.

Surprises:
- **Mendix's Call REST did not go through the proxy.** The runtime JVM gets
  `JAVA_TOOL_OPTIONS` with `https.proxyHost`/`https.proxyPort`, but the OpenAI connector's REST call
  went direct, and OpenRouter answered the placeholder key with "Missing Authentication header" (401).
  - Running the app with `JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=<port of $HTTPS_PROXY>"`
    routes it through the proxy, which injects the key.
  - Mendix Cloud GenAI had worked all along because this container also allows direct connections.
- **The test runtime has no encryption key**, so `Configuration_Commit` (it encrypts the API key)
  threw and stopped the whole startup. Optional setup is now wrapped in error handlers
  (`SUB_SetUpRuntimeAgent`), and it logs "OpenAI-compatible endpoint not configured" instead.
- **PgVector is not possible here.** OpenRouter has **no embedding models**, and the local Postgres 16
  has no `vector` extension. This is recorded as an open question in the brain.
- A `retrieve` XPath cannot reference a constant (MDL-XPATH03 / CE0161); assign it to a variable first.

## Knowledge bases: Mendix Cloud GenAI and PgVector (2026-11-09)

The environment now provides three more keys: a knowledge-base key (`MX_KB_KEY`), an embeddings
key (`MX_EMBEDDINGS_KEY`) and a fresh `OPENROUTER_KEY`. Each is passed per run as a constant
(`@env:`) and never written to a file.

What was built (`mdlsource/11-knowledge-base.mdl`):
- **PolicyDocument** pages for staff: upload a `.txt` or `.md` file, then "Load into knowledge base".
- The load splits the document into paragraphs. Each paragraph becomes one chunk, prefixed with the
  title and linked to the document, so a reload replaces that document's chunks. The chunks go into
  **both** knowledge bases:
  - **Mendix Cloud GenAI**, collection `policies`, used by the design-time `SupportAgent` (the
    `PolicyDocs` knowledge base in its agent document).
  - **PgVector**, knowledge base `policies` in a local `servicedesk_vectors` database, embedded by a
    Mendix Cloud GenAI embeddings model. The runtime agent on OpenRouter uses this one.
- At startup `ASU_ConfigurePgVector` registers the embeddings key
  (`MxGenAIConnector.Configuration_RegisterByString`). It then creates or updates the PgVector
  `DatabaseConfiguration`, sets its password through `DatabasePassword_GetCreate` and
  `DatabaseConfiguration_Commit` (which encrypts it), and links it to the embeddings model.
  `SUB_RuntimeAgent_AttachPolicies` then adds a `PolicyDocs` knowledge base to the runtime agent's
  in-use version, if it is not there yet. Both steps are skipped without the keys and wrapped in
  error handlers, so the app still starts without them.

Database: `apt-get install postgresql-16-pgvector` (pgvector 0.6.0), then
`create database servicedesk_vectors owner mendix` and `create extension vector` as `postgres`. PgVector
Knowledge Base 7.1.0 creates the tables itself (`policies` with a `vector(1536)` column, plus
`policies_metadata`).

Verified live as `demo_agent`:
- **Mendix Cloud GenAI:** after loading both policies, "Assistant" answered the e-bike return
  question correctly: within 14 days, under 25 km, 10% goodwill up to EUR 25 with agent approval.
  A question asked about 30 s after loading found nothing. Chunks become searchable 60–120 s after
  loading, as the docs say; it worked at about 90 s.
- **PgVector:** the log shows "Loaded … 6 chunks; Mendix Cloud true, PgVector true" for both
  documents, and Postgres holds 12 rows for 2 documents. "Assistant (OpenRouter)" (free Nemotron model)
  answered "A customer wants to return an e-bike after 10 days; they rode it 30 km" with
  "No… must have been ridden less than 25 kilometres", citing *Returns and refunds #2, #4, #6* and
  *Delivery and warranty #4*. Retrieval runs in the app, so a model without embeddings (OpenRouter)
  can still use a vector knowledge base.
- Agent Commons shows one `PolicyDocs` row per agent version: SupportAgent v0 and v1 on Mendix
  Cloud, and the runtime agent v1 on PgVector. A restart adds no duplicates.

OpenRouter key: with the fresh key passed as `--constant ServiceDesk.OpenRouterApiKey=@env:OPENROUTER_KEY`,
the runtime agent works **without** the extra `-Dhttp.proxyHost` JVM options and without proxy key
injection. The constant's default changed from the `proxy-injected` placeholder to empty.

Gates:
- A second exec of 10, 11 and 99 writes nothing.
- `docker check`: 0 errors. `test --local`: 16/16. `lint`: 0 errors, 20 warnings (unchanged).
- `report`: 72/100.

Surprises:
- **Changing a microflow's signature, or adding a branch with a `return`, is refused as a splice**
  (MDL-V1-REBUILD) for `SUB_PolicyDocument_Ingest` and `SUB_SetUpRuntimeAgent`, even though mxcli
  wrote both. A one-off `drop microflow`, followed by the exec, rebuilds them; the grants come back
  from the script.
- `PgVectorKnowledgeBase.ChunkCollection_Replace` logs a WARNING the first time ("No knowledge base
  was found … Nothing could be deleted"). This is expected, and the insert still happens.
- The PgVector table is named after the knowledge base (`policies`), not after the configuration,
  and the vector column is `vector`, not `embedding`.

## Chats survive page navigation; streaming behind an https root URL (2026-11-09)

Reported: as a customer, switching from the chat to Tickets and back lost the conversation.

Cause: each time the chat opened (`ACT_SupportChat_Open`, the floating chat's `DS_SupportChat` and
`ACT_RuntimeChat_Open`), the app created a **new** `ChatContext`. The old one stayed in the database
(`ChatContext` is persistent): demo_customer had 7 abandoned support chats.

Fix: `SUB_Chat_GetLatest` returns the user's most recently changed chat that runs on a given action
microflow (`System.owner` = `$currentUser`, `ChatContext_ProviderConfig_Active/ProviderConfig/ActionMicroflow`).
`SUB_SupportChat_GetOrCreate` and `SUB_RuntimeChat_GetOrCreate` reuse it and only create a chat when
there is none. The page's own **Clear chat** starts over. The full-page chat and the floating chat on
Tickets now share one conversation.

Verified in the browser: question → Tickets → back. The question and the answer are still there,
for both the support agent (as demo_customer) and the OpenRouter agent (as demo_agent). The model
also gets the earlier turns: it remarked that the same question had been asked before.

Surprises:
- **Conversational UI's streaming handler picks the session cookie by the `Host` header.**
  `InitAsyncStreamHandler.create_userContext_from_session` reads `XASSESSIONID` when the host
  contains "localhost", and `__Host-XASSESSIONID` otherwise. With `run --hub`, the root URL is https,
  so the runtime issues `__Host-XASSESSIONID`. A browser on `http://localhost:8080` then makes the
  handler read the wrong cookie, and every streamed answer shows **Error**
  (`NullPointerException … UUID.fromString`). Through the hub URL, or on `http://127.0.0.1:8080`, it
  works. When testing locally while the hub is on, use 127.0.0.1, not localhost.
- `sort by ChangedDate` on a module entity fails with CE1613; the system member is `changedDate`.
  `mxcli check --references` caught this before exec.
- `run restart` refuses a run that was started with a literal secret (`--constant X=value`). The local
  PgVector password and the Keycloak client secret are now passed as `@file:.mxcli/…`
  (git-ignored, mode 600).
- One watch build failed with CE0108 between the execs of two scripts (an intermediate state). A
  fresh start built cleanly, and `docker check` reports 0 errors.
- **`mxcli test --local` disturbs a `run --watch` app on the same project**
  ([ako/mxcli#2063](https://github.com/ako/mxcli/issues/2063), reproduced twice). The test run briefly
  adds the `mxtest` test-endpoint Java action. The watcher rebuilt in the middle and failed
  ("package mxtest.actions does not exist"), then recovered with a full restart, which drops browser
  sessions (also on the hub preview). It is related to ako/mxcli#2033. Until it is fixed, run the
  test gate while the app is stopped, or expect one restart.

## Chat history: pick, start and delete chats (2026-11-09)

Requested: keep a history of chats and let the user choose between them.

Built (`mdlsource/12-chat-history.mdl`):
- `Chat_WithHistory`, used by both assistants. On the left: **New chat** and the user's chats with
  the same agent, newest first, by topic. The open chat is shown in bold, and each chat has a delete
  button. On the right: the chat itself (Conversational UI's `Snippet_ChatContext_ConversationalUI`).
- The list (`DS_ChatHistory`) is filtered on owner and the chat's action microflow. Chats without a
  question yet (no topic) are left out, unless the chat is the open one.
- **New chat** does nothing while the open chat is still empty, so empty chats do not pile up.
  Deleting the open chat moves to the most recent remaining chat, or to a new chat if none is left.
- The chat topic is the first question. Conversational UI's `ChatContext_Preprocessing` sets it.
- `ACT_SupportChat_Open`, `ACT_RuntimeChat_Open` and `Ticket_Overview` moved here from 08 and 10. "New
  chat" has to create a chat for **either** agent, and the runtime agent's chat builder is only defined
  in 10.

Verified in the browser for demo_customer (Assistant) and demo_agent (Assistant (OpenRouter)): open,
New chat, ask, the new chat is listed at the top, switch to an older chat (its messages show), switch
back (the answer is there), delete another chat (the list shrinks by one), and delete the open chat. No
console errors except the known first-call `llm-streaming` 404. The test chats were removed
afterwards.

Gates:
- A second exec of 04, 08, 10 and 12 writes nothing.
- `docker check`: 0 errors. `test --local`: 16/16. `report`: 72/100.
- `lint`: 0 errors, 21 warnings. The new warning is ARCH001 on the chat data view, which uses
  Conversational UI's `ChatContext`. That is the module's own pattern
  (`ConversationalUI_FullScreenChat` does the same), and is related to ako/mxcli#2034.

Surprises:
- **The message list collapses to zero height outside the module's full-screen page.**
  `.chat-container` is `height: 100%` with a `flex: 1 1 0` message list, so it needs a parent with
  a real height. In a layout grid column, the chat showed only its input box. The text was in the
  DOM, so a text-based check passed while nothing was visible; only the screenshot showed it.
  Fixed in `themesource/servicedesk/web/main.scss` (the ServiceDesk module's theme source, which
  compiles): the column gets `height: calc(100vh - 140px)`, and the data view inside it 100%.
- **`ChatContext_Create_ForAgent`'s `ActionMicroflow` parameter is a microflow *reference*, not a
  string.** `mxcli check --references` refused passing `$ProviderConfig/ActionMicroflow` (it would have
  stored the text as the reference). So "new chat like this one" dispatches to the two known creators.
- **The trial runtime's session cap.** Test browsers that do not log out use up the trial license's
  concurrent sessions ("Maximum number of sessions exceeded"). Logins then fail for everyone,
  including the hub preview. A restart clears the sessions. Note: `GET /logout` is a 404 in Mendix,
  so a test that "logs out" by visiting it frees nothing. Log out through the client
  (`mx.logout()`) or keep test runs few.
- **The watch build reports a false CE0108** ([ako/mxcli#2064](https://github.com/ako/mxcli/issues/2064)).
  A later repro showed it is not about drop + create: it fails on an *incremental* build in an
  `mxbuild --serve` process that has already built, and the same MDL passes on a full build. Seen three times. It reported
  `ACT_RuntimeChat_Open` and `ACT_Chat_Delete` as "Variable defined but not in scope", while
  `docker check` on the same model reports 0 errors and a fresh start builds cleanly. It looks like
  `mxbuild --serve`'s incremental state going stale. Workaround: `mxcli run restart`.

## Container recycled while idle (2026-11-09)

At about 21:45 the container restarted while idle, and the app process went with it (`run status`: "exited
without cleaning up"). The project, the PostgreSQL data (including `servicedesk_vectors` and the pgvector
extension), the chats and the `.mxcli/` secret files all survived. The carrier MCP server
(`python3 tools/carrier-mcp/server.py`) and the app need starting again. Because the secrets are
passed as `@env:`/`@file:` references, one `run --hub …` command brings the preview back at the same
URL.

## Traces, Token usage and Agents pages clipped with the menu open (2026-11-09)

Reported: the Traces page does not fit the screen. The title read "races", and the Custom period button
and the Error column were cut off.

Cause: Conversational UI sizes these pages in **viewport** units: `.traces-content` and
`.traces-breadcrumb` 91vw, `.convui-pagecontainer` 95vw, `.agents-container--overview` 91vw,
`.convui-breadcrumb` 91vw. That ignores the app's sidebar. With the menu open, the content area is
narrower than the viewport, and the centered page spills over both edges. Measured with Playwright
(the widest element against the content region), with the menu open:
- at 1000×580: Traces 71 px, Token usage 182 px, Agents 142 px;
- with the menu closed: none.

Fix: `theme/web/_genai-pages.scss`, imported from `theme/web/main.scss` (compiles last), sets those
containers to `width: 100%`. The selectors are prefixed with `body`, so they also outrank the module's
rules inside media queries. It lives in the app theme, not in `themesource/conversationalui`, so a
module update does not overwrite it. After the fix: no overflow on any of the three pages, with the menu
open or closed, at 1000×580 and 2000×1150.

Not fixed (module behaviour): in a short window (about 580 px tall) the Traces chart is squashed,
because the module sets its height in `vh`.

## Agent grounded in a SPARQL product graph through MCP, and SQL to the vector database (2026-11-09)

Requested: show agent integration with a SPARQL graph that grounds the agent in data, reached through
an MCP server, as Mendix describes for agentic apps on a knowledge graph. Also add a traditional SQL
connection, to the vector database.

**Graph.** Apache Jena Fuseki 6.2.0 (Apache 2.0, a single jar from Maven Central, runs on the
container's Java 25), serving `tools/fuseki/products.ttl` read-only (`--file`, no `--update`; an update
returns HTTP 405). It holds 381 triples:
- 3 bikes, 14 parts, 7 accessories and 4 suppliers;
- compatibility, and what each bike ships with;
- 2 known issues and 1 batch-scoped recall;
- the contents of all 15 demo orders, with battery batches.

A SPARQL `SUM` over each order's lines equals the app's `TotalAmount` for all 15 orders, so the two
systems agree.

**MCP server** (`tools/product-graph-mcp/server.py`, Python MCP SDK 2.x, port 8766). It has curated tools:
- `order_products`: the lines of an order, with the issues and recalls that apply to *that unit's* batch;
- `find_product`, `compatible_parts`, `known_issues`;
- `sparql_query`: read-only. It refuses anything but SELECT and ASK, and also `SERVICE` (federation),
  and adds `LIMIT 50`.

I wrote it myself rather than using a published SPARQL MCP server (mcp-server-sparql, mcp-proto-okn,
SIB sparql-mcp). Those mostly hand the model a raw query tool for public endpoints, while the point
here is that the MCP server decides what the agent may see. `tests-live/mcp/product_graph_test.py`:
8/8, including the write and `SERVICE` refusals.

**Agent.** The consumed MCP service `ServiceDesk.ProductGraph` is on the SupportAgent only, as requested.
Its endpoint is set by `scripts/patch-agent-documents.py`, because mxcli still cannot write it
(ako/mxcli#2060). Verified in the browser as demo_customer: "Is the e-bike from my order SO-10003
affected by any recall? And which suspension seat post fits it?" The agent called `GetOrderStatus`,
`order_products` and `compatible_parts`. It answered: not affected (the recall is batch B2603, the bike
is B2605), and SSP-27 fits, EUR 129.00. For SO-10005 (another customer's order) it stopped after
`GetOrderStatus` found nothing.

**Access caveat.** The graph and its MCP server do not know the user, so `order_products` would show
any order. The guard ("look the order up with GetOrderStatus first, which applies the app's entity
access") is in the system prompt only. A production setup would pass the user's identity to the MCP
server (OAuth, as on the app's own MCP server) or keep order data out of the graph.

**SQL.** The External Database Connector, `ServiceDesk.VectorDatabase` (PostgreSQL), on
`servicedesk_vectors` as `servicedesk_reader`, which has SELECT only (a `delete` is refused). It
needed no new module: the Database Connector that PgVector installed is the one this uses, and the
PostgreSQL driver was already in `vendorlib/`. Two queries:
- `ChunksForDocument(documentId)`: matches `mxobjectid` against `CommunityCommons.getGUID`.
- `ChunkCounts`.

Verified: "Chunks (SQL)" shows 6 and 6 chunks for the two policies. The agent's
`GetKnowledgeBaseStatus` tool answered staff with both counts and load times, and refused a customer.

Gates:
- `docker check`: 0 errors. `test --local`: 16/16. `report`: 71/100.
- A second exec of 06b and 11, and of `apply-agents.sh`, writes nothing.
- `lint`: 0 errors, 23 warnings. The 2 new ones are CONV013 on the `getGUID` Java call, the same rule
  already accepted for the MCP calls.

Surprises:
- mxcli refused `$Count = find($Counts, …)` under `mdl 1` (string function versus list operation). The
  list form is `find $Counts where $currentObject/… = …`.
- A doc comment on a `database connection` cannot be stored (MDL089); it is a `--` comment now.
- `execute database query` only supports rollback error handling. The SQL calls sit in SUB microflows,
  and their callers catch errors with `on error without rollback`, so a database outage gives a
  message, not an error dialog.
- MCP servers started with `( nohup … & )` from a tool call did not survive (the carrier server was
  found dead; Fuseki, started by its script, lived). They are now started with `setsid nohup`.
- The model again said it had answered "before the lookups came back", although the trace shows the
  tool calls first; the earlier note on this quirk stands.

## Review of open mxcli gaps (2026-11-09)

Filed after reviewing which agent and MCP features work end to end, and what the skills, `syntax` and
`help` cover (mxcli `nightly-20261109-a88c4d94f`, the latest nightly):
- [ako/mxcli#2067](https://github.com/ako/mxcli/issues/2067): the agents skill and `syntax agents` do not
  say that the selected model (#2031) and the consumed MCP endpoint (#2060) cannot be written. Agents built
  by following them fail only at runtime. The issue also notes that #2030 looks fixed in this nightly.
- [ako/mxcli#2068](https://github.com/ako/mxcli/issues/2068): no skill covers the runtime side of Agents
  Kit 2: Agent Commons runtime agents, the OpenAI-compatible connector, the PgVector knowledge base,
  Conversational UI chat pages (including the collapsed-height gotcha), and StoreTraces.
- [ako/mxcli#2069](https://github.com/ako/mxcli/issues/2069): lint ARCH001 flags the data view on
  `ConversationalUI.ChatContext` that Conversational UI's chat snippet requires (same class as #2034).

Checked and not mxcli problems:
- An OQL query on `ServiceDesk.Order` fails to parse because `Order` is reserved in OQL; quote it.
- The project's skills lagged the binary only because a newer nightly was installed mid-session.
  `.claude/bootstrap-mxcli.sh` runs `init --sync-skills` at session start. A scratch sync updates 9 skills
  and adds `mcp-server`.

## The mxcli catalog and agents (2026-11-10)

Question: do the catalog tables give the agent-related information a review needs? Not yet. Filed:
- [ako/mxcli#2073](https://github.com/ako/mxcli/issues/2073): every `select … from CATALOG.AGENTS`
  prints nothing (exit 0). The 8 rows are in `.mxcli/catalog.db`, and `list agents` shows them.
- [ako/mxcli#2074](https://github.com/ako/mxcli/issues/2074): no refs from agent documents (to tools,
  model, knowledge base, MCP services, key constants), and none from microflow-typed Java action
  parameters (`ActionMicroflow`, `AuthenticationMicroflow`, `AddPrompt`'s `Microflow`).
  `show callers of ServiceDesk.Tool_GetOrderStatus` reports no callers, and `GRAPH_DEAD_ASSETS` lists all
  six agent tools, both chat action microflows, both MCP authentication microflows and the MCP prompt
  as unused. **Do not delete "dead" microflows in this app on the catalog's word.**
- [ako/mxcli#2075](https://github.com/ako/mxcli/issues/2075): the agent tables carry only name, module,
  folder and description. There are no tables for tools, knowledge bases or MCP services, and no columns
  for usage type, model, streaming or approval. `CATALOG.STRINGS` indexes only agent documentation, not
  prompts or tool descriptions.

## mxcli's agent fixes tested before adoption (2026-11-10)

Built from source: ako/mxcli PR #2086 (`fix/2060-consumed-mcp-endpoint`, open), which has current
`main` merged in (#2079, #2080, #2082, #2083, #2085). Today's nightly (10:34) only contains #2079.
Tested on a scratch clone of this project, not the real one.

| Issue | Fix | Result here |
|---|---|---|
| #2073 `CATALOG.AGENTS` empty | #2080 | Works: returns the 3 ServiceDesk agents (8 in total). |
| #2074 refs from agents and microflow-typed Java action parameters | #2079 | Works. `show callers` of `Tool_GetOrderStatus` gives SupportAgent and `SUB_MCP_RegisterTools`; of `MCP_Authenticate`, `MCP_Initialize`. No ServiceDesk microflow is listed as dead any more (11 before). |
| #2075 agent details and prompt search | #2080, #2082 | Works. New tables: `AGENT_TOOLS`, `AGENT_KNOWLEDGE_BASES`, `AGENT_MCP_SERVICES`, `PUBLISHED_MCP_SERVICES`. New columns: model, selected model, streaming, approval, collection, key constant. Values match the agent documents. `CATALOG.STRINGS` has system prompts and tool descriptions. |
| #2069 ARCH001 on the chat page | #2083 | Works after `init --sync-skills` (the rule is a bundled lint rule copied into the project). Lint: 17 warnings. |
| #2031 selected model | #2085 | Works. `SelectedModel:` in `07-agents.mdl` gives exactly the documents the patch script produced ("11 documents already in sync"). A new agent created with it needs no patch ("already up to date"). |
| #2060 consumed MCP endpoint | #2086 (open) | Works, with the same two checks as #2031, for `Endpoint: @Module.Constant`. |

All 14 scripts, run with this build, write nothing and report no errors, and `docker check` reports 0
errors. `describe` output for agents and consumed MCP services re-executes as "Unchanged".

Gaps left:
- MDL-AGENT02 (no selected model) and MDL-AGENT03 (no endpoint) only fire on a plain `create`. A
  `create or modify` of a **new** document, which is how every script here writes agents, gets no
  warning. Lint does not flag a stored agent without a selected model either, although
  `CATALOG.AGENTS.SelectedModel` now shows it empty.
- `CATALOG.AGENTS.ToolCount` (6 for SupportAgent) counts microflow tools only. `AGENT_TOOLS` also lists
  the agent's MCP services as `ToolType: MCP` rows (8), and so does `AGENT_MCP_SERVICES`.
- `CATALOG.CONSUMED_MCP_SERVICES` has no Endpoint or AuthenticationMicroflow column, even with #2086.

Filed: [ako/mxcli#2089](https://github.com/ako/mxcli/issues/2089) (MDL-AGENT02/03 skip `create or modify`
of a new document; no lint rule for stored ones) and [ako/mxcli#2090](https://github.com/ako/mxcli/issues/2090)
(ToolCount versus AGENT_TOOLS, and no endpoint column). #2086 merged at 13:45 with the code tested here;
the next nightly should carry all six fixes.

## mxcli built from main; the agent patch script is gone (2026-11-10)

`/usr/local/bin/mxcli` (which `./mxcli` points to) is now mxcli built from `main` at c0c8b4d2e
(`nightly-142-gc0c8b4d2e`), with #2085 (selected model) and #2086 (consumed MCP endpoint). The
released nightly is kept as `/usr/local/bin/mxcli.nightly-20261109`.

- `07-agents.mdl` now sets `SelectedModel:` on the three agents and `Endpoint: @…` on the two consumed
  MCP services. `scripts/patch-agent-documents.py`, `agent-document-fields.json` and `apply-agents.sh`
  are deleted.
- Exec wrote only the two MCP services' documentation text (the "set by the patch script" sentence
  was removed). Every agent document was unchanged, so the MDL produces exactly the patched documents.
  A second run writes nothing. `describe` shows the endpoints, and `CATALOG.AGENTS` the selected models.
- Live: Agent Editor's startup import finished with no "Model … could not be found". As demo_customer,
  one question used `GetOrderStatus`, `track_parcel` (carrier MCP) and `order_products` (product graph
  MCP), and answered correctly.
- Gates: `check` passed; `docker check` 0 errors; `test --local` 16/16; `lint` 0 errors, 17 warnings;
  `report` 75/100. Skills synced to the new build.

**Caveat for fresh sessions:** an mxcli older than main@80039bc64 (the 2026-11-10 nightly and earlier)
rejects `SelectedModel` and `Endpoint`, so `07-agents.mdl` fails to parse with it. The tooling stamp is
now a dev version, which the bootstrap's version guard cannot compare. A fresh container therefore
keeps whatever mxcli it gets. Use a nightly from 2026-11-11 on, or build `main`. The README and the
brain (b486f6) say the same.

## mxcli PR #2101: running tests without building (2026-11-10)

PR #2101 (`feat/test-interpreter`, open, up to date with `main`) adds `run … --test-endpoint --allow-call`.
With it, `mxcli test … --attach` compiles each test into steps that the running app executes. There is
no injecting and no mxbuild. Measured on this project's 16 tests (wall clock, PR build):

| Route | Time | Notes |
|---|---|---|
| A: `test tests/ --local` (current gate) | 149 s cold, 52 s warm | separate scratch runtime and database; test execution itself 0.3 s |
| B: `test --attach`, inject and build | about 78 s | rebuilds the running app (13 watch builds over the attach runs; one transient "client bundle not served") |
| C: `test --attach` on the `--allow-call` route | **0.26 to 0.38 s** for 11 tests | no build, no model change, no watch build; same verdicts as route A |

Routing is all-or-nothing per run. One test the interpreter cannot run sends the whole run down route B.
Here both files fell back because of list aggregates (`$n = count $list`, `sum … by`); the interpreter
refuses `AggregateList`. An association retrieve (`retrieve $C from $T/Assoc`) is not supported either.
- 11 of 16 tests run on route C unchanged.
- 3 more do after a rewrite, verified at 0.12 s: `@expect count($Customers) = 5` instead of a `count`
  statement, and a database retrieve with XPath instead of an association retrieve.
- The 2 dashboard view tests (`sum` over a view) would stay on route A. They also assume freshly seeded
  data: on the live app's database they fail (10 open tickets instead of 9; refunds 214.99 instead of
  199.99, because of demo chats).

Writes are safe on the live database: tests roll back by default (`@cleanup rollback`). The attach runs
left no "Test ticket" rows and no test refunds.

Caveats:
- `run --test-endpoint` swaps the after-startup microflow for `MxTest.RegisterEndpoint` while the app
  runs. The model shows as modified in `git status`, and the watch loop reports it as a pending change
  that never builds. `run stop` restores it. A container recycle is not a clean exit, so check
  `git status` (ProjectSettings) before committing after one.
- The app's own `ASU_App` still runs after the endpoint registers: agents imported, MCP servers created.
- `--allow-call` runs microflows in a system context. The route is POST-only, loopback-only and
  token-guarded. Under `--hub` the tunnel also arrives from loopback, so the token is the remaining
  guard.

Verdict: for the inner loop it makes the tests 150 to 300 times faster (seconds instead of a minute
or more) and leaves the running app alone (#2063). That depends on the suite avoiding list aggregates,
or the interpreter learning them. Keep `test --local` as the gate, since it starts from a scratch
database.

PR #2101 merged at 18:25 UTC (head a0e6dc24d, the commit tested above). A review with the timings, suggestions and the full list of statements the exec route does not run yet (40 of 48 statement types, plus restrictions on the 8 it does run) is posted on [ako/mxcli#2101](https://github.com/ako/mxcli/pull/2101).

## mxcli PRs #2104 and #2105, the follow-ups to the #2101 review (2026-11-10)

Tested on this project with both PRs merged onto `main` (bb14c543f, merged cleanly), app under
`run --hub --test-endpoint --allow-call`.

**#2104: per-test routing; aggregates and association retrieves in the app**
- The **unmodified** suite now runs entirely in the app: "Running 16 test(s) in the running app (no
  injection, no build)", **0.39 to 0.60 s** (about 78 s with #2101 alone, 52 s warm with `--local`). The
  same 2 live-data failures, with the same actual values as the built route (10; 214.99).
- Mixed file (2 plain tests, plus one `if` and one `call java action`): "Running 4 test(s): 2 in the
  running app, 2 as built test microflows", all pass. Refusals now name the MDL ("the statement if", "the
  statement call java action").
- `run --hub --allow-call` prints the warning that the token is the only guard.
- **Still disturbs the app when a test needs building:** the mixed run took 84 s, and the app's own
  watcher picked up the injected test microflows (build #2 failed, build #3 applied via a runtime
  restart, which drops sessions), although the run says it uses "a separate mxbuild --serve … the app's
  own is left as it is". The injected microflows were removed afterwards. Runs entirely in the app
  trigger no build.

**#2105: no phantom "change pending"; leftover endpoint**
- After boot under `--test-endpoint`, `run status` no longer says "change pending", and `run wait`
  returns in 1 s (before: a 5-minute timeout).
- With the app SIGKILLed (as in a container recycle), the model keeps `AfterStartupMicroflow:
  'MxTest.RegisterEndpoint'`. `check -p` with the PR build warns "Do not commit it" and names
  `run stop`; the installed build (control) says nothing. The next plain `run` reported "test endpoint
  removed; project restored". `git status` was clean again, with the after-startup microflow back to
  `ServiceDesk.ASU_App`.

Reviews posted: [ako/mxcli#2104](https://github.com/ako/mxcli/pull/2104) (results, plus the app restart when a test needs building) and [ako/mxcli#2105](https://github.com/ako/mxcli/pull/2105) (both fixes confirmed with controls; merged 20:08 UTC).

## mxcli rebuilt from main with #2104, #2105 and #2102 (2026-11-10)

#2105 merged at 20:25 and #2104 at 20:43, both unchanged from what was tested above. The restart of the
running app when a test needs building was not addressed, so it is filed as
[ako/mxcli#2116](https://github.com/ako/mxcli/issues/2116).

`/usr/local/bin/mxcli` is now `main` at b88dc5b9b (`nightly-174-gb88dc5b9b`); the previous build is kept as
`mxcli.main-c0c8b4d2e`. `init --sync-skills` refreshed 6 skills and added **genai-runtime** (#2102, for
#2068): the runtime side of Agents Kit 2, including the encryption-key, vector-extension, indexing-delay
and collapsed-chat gotchas found here.

Gates with this build: all 14 scripts write nothing; `lint` 0 errors, 17 warnings; `docker check` 0 errors;
`test --local` 16/16. The app runs on it, with the helper servers restarted after another container recycle.
For the inner loop, run the app with `--test-endpoint --allow-call` and use `mxcli test tests/ --attach`
(about 0.5 s for the whole suite; it runs against the live database).

## mxcli PR #2117: a test run holds the dev loop (2026-11-10)

PR #2117 (`fix/attach-holds-dev-loop`, open, `main` + 3 commits) answers ako/mxcli#2116 and #2063: a test
run writes `.mxcli/watch-hold.json`, and the dev loop's watcher waits, then absorbs the change when the
model is back as it was. Tested with a browser logged in as demo_agent during the run (it opens Tickets
afterwards; "logged in" means no redirect to sign-in):

| Run (dev loop under `--watch --hub`) | Dev-loop builds | `.mpr` byte-identical | Session survives |
|---|---|---|---|
| mixed `test --attach` (2 in app, 2 built), control `main` b88dc5b9b | 2 (failed, then applied via restart) | no | **no**: sent to sign-in |
| mixed `test --attach`, PR build | **0** | yes | **yes** |
| `test tests/ --local`, PR build | **0** | yes | **yes** |
| `test tests/ --local`, control | 2 (applied via restart) | yes | **no** |

While held, `run status` shows "held by a test run (pid …); a change waits", and afterwards
"build #1 (boot)". A real edit afterwards (a comment in the ServiceDesk theme) still built (by reload).

**Separate, pre-existing bug, filed as [ako/mxcli#2119](https://github.com/ako/mxcli/issues/2119):** with the
dev loop on `--test-endpoint`, `test --local` chains its endpoint to `MxTest.RegisterEndpoint` itself. The
scratch runtime's after-startup then recurses (StackOverflowError; no tests run). The cleanup also leaves the
project unbuildable: the after-startup setting names the removed `MxTest.RegisterEndpoint` (CE1613). It
happens with both builds. `run stop` of the dev loop restored the project from its restore record.
**Until it is fixed: stop the dev loop (or run it without `--test-endpoint`) before `test --local`.**

#2117 merged at 21:27 UTC (head 5f562c59d, as tested). Review posted on [ako/mxcli#2117](https://github.com/ako/mxcli/pull/2117).

## mxcli PRs #2115 and #2118: exec/check speed on large projects (#2094) (2026-11-10)

Built four binaries from `main` (3f3d96013): `main` itself, `main` + #2115, `main` + #2118, and `main` + both.
The merges only conflicted in CHANGELOG.md. Both PRs' unit tests pass on the combined build.
- #2115 changes the MPR v1 reader (single-file `.mpr`); this project is v2.
- #2118 changes the executor's entity and microflow lookups (v1 and v2).
- For v1, I converted a copy of this app (2,389 units) by moving each `mprcontents/` file into a `Contents`
  column of the `Unit` table. mxcli reads it (as v1); Studio Pro 11.16 would not.

Benchmark: 50 × `create microflow` with an entity parameter and return type; 50 × `create or modify`
adding one `log` activity; `check --references` of the modify script; the modify script again. Each run
on a fresh copy:

| Build | v2: create / modify / check | v1: create / modify / check |
|---|---|---|
| `main` | 9.2 / 22.2 / 8.2 s | 36.2 / 93.0 / 40.4 s |
| #2115 | 8.5 / 19.5 / 7.8 s | 10.3 / 34.7 / 11.9 s |
| #2118 | 5.5 / 5.8 / 5.6 s | 29.4 / 60.1 / 31.8 s |
| both | 5.6 / 6.1 / 6.3 s | **8.0 / 14.4 / 8.5 s** |

- Every run: 50 created, 50 modified, and the re-run writes nothing. A stored microflow's `describe`
  (layout markers stripped) is identical across all 8 runs.
- v1 with both: about 6.5× faster on modify (the PR says about 7.5×, on a larger project).
- v2: #2118 alone gives about 3.6× on modify. #2115 has no effect on v2, as expected.

This project with both PRs: all 14 scripts write nothing and report no errors; every `check --references`
passes; `docker check` 0 errors. Checking all 14 scripts takes 37 s, against 38 s on `main` (mostly
no-ops, where the per-statement cost is not what dominates).

A long-running mxcli REPL does not see a write by another process, whether a new microflow
(`show microflows` still lists 73) or a modified one (`describe` keeps the old one). This happens on v1 and
v2, with `main` as well, and there is no refresh command. It is above the reader, so it is not caused by
these PRs, and it hides #2115's change detection from a CLI test. That path (a commit by another
connection) is covered by #2115's `TestListUnitsByTypeV1ScansTableOncePerChange_Issue2094`, which passes.

Reviews posted on [ako/mxcli#2115](https://github.com/ako/mxcli/pull/2115) and [ako/mxcli#2118](https://github.com/ako/mxcli/pull/2118). The REPL staleness is filed as [ako/mxcli#2121](https://github.com/ako/mxcli/issues/2121).

## Published REST: request examples in the generated Swagger docs (2026-11-11)

Question: are there no POST body examples in the Swagger docs Mendix generates for published REST APIs ("Try it out" is empty)?

Test: a scratch clone of this app (Mendix 11.16.0) on port 8081, with the published service
`ServiceDesk.TicketTestApi` and three POST operations on the same microflow and entity, differing only in what
the import mapping is based on. The docs are at `/rest-doc/rest/tickettest/v1`, and the spec at
`/rest-doc/rest/tickettest/v1/openapi.json` (OpenAPI 3.0.4), not under the service path.

| Import mapping based on | `requestBody` schema in openapi.json | Swagger UI "Try it out" |
|---|---|---|
| message definition with `example` values | `$ref` to a schema with every property **and its example** (integers typed) | pre-filled with the examples |
| message definition without examples | `$ref` to a schema with the properties, no examples | placeholders (`"string"`, `0`) |
| JSON structure (sample has values) | `{"type": "object"}`, no properties | **`{}`, empty** |

A GET with a message-definition export mapping also documents its response with the examples. Both POST variants
accept the same request (`200 Received: …`); the JSON-structure one is only undocumented.

**Conclusion:** the report reproduces when the import mapping is based on a JSON structure. Basing the import (and
export) mapping on a message definition gives a full schema, with the example values from the message definition.

mxcli gaps found on the way (11.16 project, `main` b88dc5b9b):
- `check` passes `create message definition collection`, but `exec` refuses it ("Mendix 11.15 removed message
  definition collections").
- `mxcli syntax message-definition` documents only the collection form, not the 11.15+ standalone
  `create message definition Module.Name for Module.Entity { … }`. (I also thought it takes no `folder` clause;
  it does, before `for`. See below.)

Filed: [ako/mxcli#2139](https://github.com/ako/mxcli/issues/2139) (check/exec mismatch) and
[ako/mxcli#2140](https://github.com/ako/mxcli/issues/2140) (syntax help and `folder`).

**Fixed in mxcli `main` (PR #2144, verified 2026-11-11 with nightly-240-g9cd9ce8ee on a scratch clone):**
- #2139: `check -p` now refuses a collection on 11.16 with exec's exact text (MDL-VERSION01). `exec` refuses
  before writing anything ("Nothing was written"); before, it wrote the entity and then failed.
- #2140: `mxcli syntax message-definition` leads with the document form, and the collection form is marked
  "Mendix 10.0.0 to 11.14.99".
- Correction: the document form **does** take a folder. It goes **before** `for`
  (`create message definition M.Name folder 'ApiTest' for M.Entity { … }`), where `describe` prints it.
  I had put it after `for`, which is a parse error and still is. With the right placement the Swagger test
  script checks, execs, re-execs with 0 writes, and builds with 0 errors.

## Rich chat answers: a custom pluggable widget in Conversational UI (2026-11-11)

Replaced Conversational UI's Markdown viewer with our own pluggable widget (ChatRichText). It renders markdown plus
` ```card ` JSON blocks as cards. Built with `@mendix/pluggable-widgets-tools` 11.16.0. Swapped in with
`alter snippet … replace` (`mdlsource/13-chat-rich-text.mdl`).

Three things stood between "check passes" and "the app deploys", and every one failed with the same generic mxbuild
message, *"Deployment failed during export of pluggable widgets … are ES6 modules"*:

1. **The widget id must be `<packagePath>.<lowercase widgetName>.<widgetName>`**
   (`com.servicedesk.widgets.chatrichtext.ChatRichText`). The client loads the script from the path the id spells,
   so `com.servicedesk.widgets.ChatRichText` points at a file that is not in the mpk. Neither mxcli, `mx check` nor
   `docker check` notice. Found by comparing with the Badge and Markdown mpks.
2. **A widget whose instance has `Visible:` must declare `<systemProperty key="Visibility"/>`** (and Label, as the
   Markdown viewer does). Found by comparing the stored widget type (`mxcli bson dump`) with the original's. After
   adding them, the generated typings drop `class` and `style` from the props, although the runtime still passes
   them, so the component has to read them through a widened type.
3. **Conversational UI's message snippet has two Markdown viewers.** `markdownViewer2` renders sub-messages;
   `markdownViewer1` renders the final assistant answer. Swapping only the first changes nothing a user sees.
   `select … from catalog.widgets` (after `refresh catalog full`) lists them.

mxcli notes: `exec` needs `mxcli widget init` after copying in a new mpk ("installed but not extracted"), while
`check` passes without it. Re-running the `alter snippet` prints "Altered" even when the stored unit is
byte-identical (no file is written), so "Altered" does not mean a write.

**Verified live** as demo_customer with SupportAgent: "Where is my order SO-10002?" gives a parcel card (status
pill, fields, tracking timeline, note) and a known-issue card, with plain text between them. Both in-use agent
versions carry the card rules (OQL on `AgentCommons.Version`). The runtime OpenRouter agent could not be tried:
OpenRouter's free Nvidia provider returned 503, "content safety screening is temporarily unavailable", on every
call. That is upstream. A constant override of `OpenRouterModel` does not help, because it creates a new
deployed model while the seeded agent stays on the old one. Gates: check and re-exec clean (0 writes); lint 0
errors, 17 warnings; report 75/100; docker check 0 errors; tests 16/16.

## Product graph outline: SPARQL straight from Mendix (2026-11-11)

A staff page (`ProductGraph_Outline`) shows the Fuseki product graph as a three-level Tree node outline:
class → member → facts and links, both directions. It's built from one UNION SPARQL query whose branches all bind
the same six variables (key, parent, label, kind, detail, sort). The inline REST POST
(`application/sparql-query`) returns the JSON, a JSLT data transformer flattens `results.bindings[].var.value`
into a root-level array, and an import mapping turns that into a list of persistent `GraphNode` objects. There's
no association: each level's datasource is a microflow that retrieves `ParentKey = $Parent/NodeKey`. 286 nodes;
the reload is idempotent (count unchanged).

Found on the way:
- **Tree node's open animation clips children loaded later.** With the default `animate: true`, an expanded
  class showed 4 of 13 parts and 14 of 15 orders. The DOM had all of them, and the panel height was fixed before
  the microflow datasource returned. `animate: false` fixes it, but needs `advancedMode: true`. mxcli `check`
  caught that before the build (MDL-WIDGET10, "hidden when advancedMode is disabled … CE0463").
- **Tree node 3.4.0's loading spinner is a 404 on Mendix 11.16.** The page bundle asks for
  `widgets/com/mendix/widget/web/treenode/assets/….svg`, but the deployment has it under `dist/…`. It's harmless
  (only the spinner) and comes from the Marketplace widget and platform, not this app.
- Reshaping a microflow that has an error handler (moving the REST call into a `SUB_`) is refused by
  `create or modify` (MDL-V1-REBUILD), with nothing written. Since this one was new and mxcli-authored,
  dropping it once and letting the script recreate it was the right fix, and the grants come back from the script.
- The graph-down path is verified: with Fuseki stopped, "Reload from graph" shows the error message and the
  outline keeps the last snapshot.

Gates: check clean, and the second exec writes nothing; lint 0 errors, 18 warnings (the new one is ARCH002 on
the read-only snapshot entity); report 74/100; docker check 0 errors; tests 16/16. Customers do not see the menu
item (page and microflows are granted to SupportAgent and Admin only).

## Delivery statistics, chart and outline cards, clickable references (2026-11-12)

What was built: shipments synced from the carrier's REST API, legs computed per scan, six OQL view entities, a
scoped agent tool (GetDeliveryStatistics), chart and outline card types in ChatRichText, and a session-authenticated
REST endpoint that serves product graph node details for clickable references.

Found on the way:
- **`mxcli check` passed two OQL mistakes that `docker check` then failed with CE0174.**
  - `e.Leg != empty` in a view entity: OQL has no `empty`, it needs `is not null`.
  - An unquoted `ServiceDesk.Order` in a join path: `Order` is an OQL reserved word, so write `ServiceDesk."Order"`.
  - Separately, division in OQL is `:`, not `/`, which is the path separator.
- **A `run --watch` *reload* does not re-run the after-startup microflow.** So Agent Editor prompts that changed in
  `07-agents.mdl` were not re-imported into Agent Commons, and the agent kept answering with the old prompt. Only
  the first edit had landed, from an earlier restart. A full restart (`start-app.sh`) re-imports. Check the in-use
  prompt with OQL on `AgentCommons.Version` before blaming the model.
- **`run --watch` does not notice a new widget `.mpk`** ("no change since the boot"). After `widget init`, restart
  the app.
- **Session auth on a published REST service needs the CSRF token.** Without `X-Csrf-Token` the answer is 401. The
  token is `mx.session.getConfig("csrftoken")` in the browser, which is what the widget sends.
- **Conversational UI's markdown styles beat the widget's list layout.** The widget root also carries the
  `widget-markdown` class, so the chart legend's grid was sized to its content. The fix was higher specificity
  (`.crt-root .crt-legend …`) plus an explicit `grid-template-columns`.
- **Percentages:** the widget computed shares from rounded values (36%) while the tool said 37%. Chart points now
  carry the tool's `share`, and the widget only computes one when it is missing.
- **The model "corrected" earlier answers that were right** ("I showed these figures before calling the tool").
  Two prompt rules stopped it: call the tools before writing any of the answer, and don't comment on earlier
  answers unless asked.
- Reshaping an existing microflow (splitting the statistics tool) was refused by `create or modify` with
  MDL-V1-REBUILD. Dropping it once and letting the script recreate it was the right call for a new, mxcli-authored
  flow.

Verified live:
- **As demo_customer:**
  - "On average, how long did my orders take to deliver?" gives a bars chart per carrier (9 parcels, average 3.9
    days, fastest 2.5, slowest 6.5).
  - "Where is most time spent…" gives a stacked chart with the hub at 42% and the warehouse at 37%. The numbers
    match the view entities queried with OQL.
  - The order card's product reference opens CHS-MAXI's details.
  - The reference API returns 404 for another customer's order, and hides "in order SO-10005" (not hers) from
    BAT-418's facts.
- **As demo_agent:**
  - The all-orders statistics show 56 parcels, with the warehouse at 41% and the hub at 39%.
  - The product outline renders with 6 references, and supplier → part drill-down works.

Gates:
- `check` is clean, and the second `exec` writes nothing.
- `lint`: 0 errors, 19 warnings. The new one is ARCH003 on TrackingEvent: a scan has no natural key.
- `report`: 71/100.
- `docker check`: 0 errors.
- `test`: 20/20 pass, including 4 new ones (history seed, leg computation from a hand-made shipment, leg line,
  empty leg).
- Widget unit tests: 12/12 pass.

## Return requests workflow with agent steps (2026-11-12)

WF_ReturnRequest has two AI agent tasks (`call agent microflow`), two user tasks for people, a jump back to the AI
on "rewrite", a decision, and a repeating non-interrupting timer. The eligibility agent's enumeration answer drives
the workflow's outcomes.

Found on the way:
- **An agent description over 200 characters makes its import fail at startup, and nothing else notices.** Agent
  Commons' `Agent.Description` is String(200). Agent Editor Commons logged "tried setting a value of length 203"
  at startup and kept the *previous* version of the agent. `mxcli check`, `exec` and `docker check` were all
  clean. The symptom was the eligibility agent returning an empty answer every time. Three hypotheses
  (knowledge-base tool, streaming, the prompt) were tried before the startup log showed it. Check the startup log
  for "Agent Editor Commons" errors after changing an agent.
- **The knowledge base as a tool of a task agent was not confirmed to work** with `Agent_Call_WithoutHistory`:
  its runs were all on the stale agent. The eligibility agent now gets the policy text in its prompt
  (`SUB_ReturnPolicy_Text`, read from the same policy document the knowledge base is loaded from). That is
  simpler and deterministic.
- `grant` on entity access only adds rights. Removing create/delete took an explicit `revoke create, delete …`.
- `check` caught three workflow and microflow mistakes before the build:
  - a single-outcome user task with nested activities (MDL-WF02, else CE1876);
  - `count()` in an expression (MDL044);
  - microflows referenced by a page before their create statement.
- The chat prompt needed two corrections, both found live:
  - The assistant asked the customer for a SKU instead of looking the item up. The prompt now says to use
    order_products, and when the graph doesn't know the order's contents, to pass the item as the customer
    names it.
  - It also pre-judged eligibility. That is now the workflow's job only.
- The reply agent passed an internal note ("the eligibility check gave no usable answer") to a customer. Its
  prompt now forbids mentioning internal checks or AI, and the review page asks the reviewer to write the
  reason the reply is based on.
- Container recycles stop the helper servers. The app then answers without the product graph tools ("I can't
  open the product lookup"). `tools/start-helpers.sh` restarts whatever is down.

Verified live:
- **Customer starts returns from the chat** (with confirmation):
  - SO-10132's tyre is Not eligible: 97 days after delivery, the policy sentence quoted, and a refusal drafted.
  - SO-10001's child seat went to review.
- **Staff:**
  - Accept → the AI drafts with label RL-5001 → Send → Parcel received → a refund request of EUR 249.95 is
    created → the return is Closed and the workflow Completed.
  - Decline → Ask AI to rewrite ("under 50 words, offer a warranty ticket") → a 42-word draft that follows the
    instruction, and a new approval task.
- **Customer:** the Returns page shows the sent replies, and the assistant reports a closed return correctly.

Gates:
- `check` is clean, and the second `exec` writes nothing.
- `lint`: 0 errors, 21 warnings. The two new ones are ARCH003, a business key on ReturnRequest (Ticket has the
  same), and DESIGN001, 18 attributes, because the AI's decision fields stay with the request they judge.
- `report`: 67/100.
- `docker check`: 0 errors.
- `test`: 27/27 pass, 7 of them new. The tests cover the facts, the fallback to review when the agent can't
  answer, accept and decline, the label and the sent reply, the refund on receipt, and the tool refusing an
  order that hasn't been delivered.

## Product explorer and graph cards (2026-11-12)

An interactive network view of the product graph, as a page (GraphExplorer widget) and as a chat card
(ChatRichText `graph` card). Both use one shared Cytoscape.js component.

- **Two widgets share code by copying, not by a package.** pluggable-widgets-tools builds one widget per package
  and compiles only `src/`. A `prebuild` step copies `widgets-src/shared` into each widget's `src/shared`
  (gitignored). Each widget bundles Cytoscape: ChatRichText grew from about 110 KB to 344 KB.
- **The explorer needed little server work.** The chat's reference API already returned a node's links. It now
  adds each link's relation, direction, and the target's kind and name (so unexpanded nodes get their colour and
  label), plus a search (`?q=`) in the same response shape. Rebuilding `REST_GetGraphNode`'s loop needed a drop
  and recreate (MDL-V1-REBUILD), as before.
- **The graph snapshot is reloaded at startup now.** It used to load only when empty, so new graph data (SO-10016)
  never reached the explorer's search until someone pressed "Reload from graph".
- **Testing a canvas.** The nodes are not DOM elements, so the graph view puts its Cytoscape instance on its
  container (`.gx-canvas.__cy`). A test reads a node's rendered position from there and clicks the real canvas.

Verified live as demo_customer:
- **Explorer:**
  - It opens on `?ref=BAT-418`.
  - Expanding the supplier and switching "compatible with" off leave the supplier, component and recall links.
  - A canvas click on the recall expands it.
  - Searching "SO-10" finds only Ada's four orders.
- **Chat:** "How is the BAT-418 battery connected to other products?" gives a graph card centred on BAT-418, with
  coloured, dashed neighbours. Its link opens the explorer on BAT-418.
- No console errors in either.

Gates:
- `check` is clean, and the second `exec` writes nothing.
- `lint`: 0 errors, 21 warnings (unchanged).
- `report`: 67/100.
- `docker check`: 0 errors.
- `test`: 33/33 pass, 4 new for the link parsing. Widget unit tests: 13/13.

## Tool scoping and tool-call payloads for staff (2026-11-12)

**Scoping.** The product-graph MCP tools were scoped by the prompt only: `order_products` and the free-form
`sparql_query` could read any order, and the prompt asked the model to call GetOrderStatus first. Now:
- Fuseki serves `/products` (full) and `/catalog` (the same file without its orders section; `tools/fuseki/start.sh`).
- The MCP server only reaches `/catalog`. `order_products` was removed.
- Order contents come from the app's GetOrderProducts tool, which first finds the order through the user's
  access, then runs one SPARQL query on `/products` for that order.

The live MCP test now asserts that the catalog has no orders, including for a catch-all `?s ?p ?o` query.
Verified in the chat as demo_customer:
- SO-10005 (Bram's): "couldn't find an order SO-10005 on your account". Its raw tool results hold only "No order
  found … for this user".
- SO-10016 (Ada's): listed.
- "Which orders contain a BAT-418?": no order data. Its `sparql_query` against the catalog found nothing.

As demo_agent, SO-10005 shows the batch-matched recall.

**Payloads for staff.** Conversational UI shows a tool call as "Tool call was successful". Staff now see each call's
input and result in one collapsed "Tool call details" block right under the tool calls (a `~~~details` fence in ChatRichText). The list's
microflow returns nothing for the Customer role, and Conversational UI's own entity access is untouched.

mxcli gaps hit on the way (mxcli `main` nightly-174 and nightly-240):
- **ALTER SNIPPET cannot reach widgets inside a list view's specialization template** (`template for
  ConversationalUI.ToolMessage` in Snippet_Message_Content). `insert after container15`, `insert after accordion1`
  and `insert into accordion1 item@1` were all refused with "widget not found". The alter-page skill says
  widgets inside a template are ordinary named widgets.
- **`describe` drops the icon of an image widget of type icon** (it prints `ImageType: icon` only). So replacing
  that template with its own `describe` output (drop + insert template) left five images without an icon:
  `docker check` gave 5 × "No icon selected". The snippet unit was restored from git. The payload list went
  outside the template instead, first under the answer, then (after "the layout seems incorrect") as one
  compact collapsed block right under the tool calls (`insert after listView1`): per-call full-width sections
  at the bottom read as part of the answer.

Gates:
- `check` is clean, and a second `exec` writes nothing.
- `lint`: 0 errors, 21 warnings.
- `report`: 66/100.
- `docker check`: 0 errors.
- `test`: 37/37 pass, 4 new for GetOrderProducts. Widget unit tests: 14/14.
- Live MCP test: all pass.

## Conversation metrics in the chat (2026-11-12)

Staff open "Conversation metrics" from the chat page: tokens, estimated cost, time and the steps behind each answer, from the GenAICommons traces (`mdlsource/11b-chat-metrics.mdl`).

**How a chat finds its traces.** `GenAICommons.Trace._ConversationId` equals `ConversationalUI.ChatContext.ConversationID`, measured on the stored data: one trace per question. A tool call's span points at the model call that requested it (`Span_SubSpan`), so the steps nest without sorting by time. An agent run as a tool (TriageTicket, the document agent) writes a trace of its own under a different conversation id. It is found by its start time inside the tool span: on the two stored TriageTicket calls, exactly one trace each.

**Usage is not a per-question total.** `GenAICommons.Usage` for a trace held only the last model call's tokens (14,852 in for a question whose two model calls took 7,272 + 14,852). The panel sums the `ModelSpan`s instead.

**Input tokens grow inside one answer.** Each model call resends the conversation plus the tool results so far. One live order question: 3 model calls with 5,897, then 11,950, then 18,206 tokens in. That is why tool-heavy answers cost far more than their output suggests.

**Prices.** No list prices are seeded for the Mendix Cloud models: they are not in the data, and Mendix Cloud GenAI bills in its own units. Administrators enter them on Model prices. The free OpenRouter models are seeded at 0.

**Scripts that could not run twice.** `alter snippet … insert` and `alter page … insert` refuse a second run ("duplicate widget name"). ALTER has no insert-if-missing (ako/mxcli#1840, open). My earlier repeat-run checks counted changed files and hid exec's error output, so script 13 was reported repeatable when it was not.
- The metrics button now lives in the chat page's own definition (12). The metrics script runs before it, hence `11b`.
- The one-time insert into Conversational UI's snippet moved to `13b-tool-payloads-insert.mdl`, marked run-once.
- Every other script was then executed a second time with errors shown: no errors, 0 files written.

mxcli gaps hit on the way (mxcli `main` nightly-174):
- `check --references` passed `set $Line = $New` on an object variable, and `exec` then refused it (CE7247 rule) and rolled back the script. Filed as ako/mxcli#2176. Fixed with a sub-microflow that returns the found or new line.
- `lastIndexOf` is not a Mendix function; `findLast` is (check caught it).

Gates:
- `check` is clean, and every script's second `exec` writes nothing (errors shown).
- `lint`: 0 errors, 22 warnings. The new one is CONV006 on ModelPrice: admins create and delete from the page, like the other admin pages.
- `report`: 64/100.
- `docker check`: 0 errors.
- `test`: 42/42 pass, 5 new for the metrics.
- Live: a staff chat with two questions showed 7 model calls, 8 tool calls and a bar per question. The customer sees no button.

## Dark glass redesign: three-column chat with a details panel (2026-11-12)

The chat page was redesigned on a Claude Design canvas and built in the app:
- the **glass** theme;
- three columns: chats, conversation, details;
- a details panel that takes over the metrics popup and the in-chat tool call details;
- a new Context view of the orders a chat is about.

How it was verified:
- Screenshots as demo_agent and demo_customer at 1440×940.
- A live customer chat: the panel picked up SO-10002 six seconds after the answer, with no refresh.

**Theme from a design.** `mxcli theme create glass --from design/glass-tokens.css --base console` took the 37 `--mxt-*` tokens straight from a small tokens file read off the canvas. Two things it did not do:
- It took the glass look itself (blur, glows, translucent panels) only as far as the palette goes. That went into the theme's skin mixin.
- It vendors no font when `--from` names a family the base does not ship. It says so for Inter, but not for JetBrains Mono, which the base names but did not copy.

`theme apply glass` removed the signal theme's partial and fonts from `theme/web/`.

**Mendix `replaceAll` takes its replacement literally.** `replaceAll(s, '…"([^"]*)"…', '$1')` returned the text `$1`, not the group, measured with a microflow test. A JSON escape written Java-style (`'\\\\'`, `'\\"'`) doubled every backslash. Both now cut or replace with literal text; a test pins the escape.

**A details panel refreshes by itself.** A data view with a microflow data source and the chat as its parameter re-ran a few seconds after Conversational UI finished an answer. The refresh button stays for the other case.

**Context can't be read from the answer text.** The order numbers come from the tool calls' `Input` JSON (`{"OrderNumber": "SO-10002"}`), the one place the model states which order it looked up. Each is then found again for the current user.

Rebuilding the shape of a microflow mxcli authored still needs drop + create (MDL-V1-REBUILD), and that has knock-on effects:
- Dropping DS_ChatDetails left the page's data view pointing at the old microflow, and the watch build reported CE0115. Re-applying the page script and a clean restart cleared it; `docker check` was clean throughout.
- A variable named `$Context` in DS_ChatDetails got CE0108 ("defined but not in scope") from the watch build once. It went away after renaming it to `$ContextMarkdown`. It was not reproduced in isolation, so it is not filed.

The one-time snippet insert (13b) is gone: the payload list was dropped from Conversational UI's snippet once, and the snippet is now back to what script 13 alone produces.

Gates:
- `check` is clean, and every script's second `exec` writes nothing (errors shown).
- `lint`: 0 errors, 22 warnings.
- `report`: 64/100.
- `docker check`: 0 errors.
- `test`: 45/45 pass, 3 new for the details panel.
- Widget unit tests: 14/14.

## Glass theme across the other pages (2026-11-12)

Every menu page was screenshotted as demo_administrator (15 pages), demo_customer (5) and demo_agent, plus a ticket popup. All were dark and readable straight away. Five things were fixed:

- **The whole page was 117 px taller than the window**, so clicking a low menu item scrolled everything, top bar included (seen on Model prices and Agents). The cause was 17 menu items at 56 px each in an icon rail that did not scroll. Item rules lost to Atlas's own. A `max-height: calc(100vh - 49px)` on the rail's scroll wrapper fixed it: the document now measures exactly 900 at 900.
- **Plotly charts** (Conversational UI's Token usage and Traces) painted a white `background` on `.main-svg` inline. They need `!important` overrides, which live in the glass theme's skin.
- **Data grids** sat directly on the background. Each now gets the glass panel, and placeholders use the faint ink colour so filter boxes read.
- **Home** was a title and two buttons. It is now a hero plus tiles, and buttons whose target the role cannot open are hidden by Mendix. Checked: Ada sees 4 tiles, the administrator 6.
- **The teal tab at the right edge** that overlaps grids is Mendix's demo-user switcher. It only exists in development, so it was left alone.

Gates:
- `lint`: 0 errors, 22 warnings.
- `report`: 64/100.
- `docker check`: 0 errors.
- `test`: 45/45 pass.
- Every script's second `exec` writes nothing.

## Tool call details unreadable in the details panel (2026-11-12)

Reported: "the tool call details are not working". The panel's sections did open, but the input and result inside them were Atlas's dark code colour on the glass background, so they looked empty. The glass skin now colours `pre`/`code` from `--mxt-ink` on a dark tint, app-wide. Verified with a screenshot of the expanded section.

While checking, every sign-in started failing with "Sign in failed". The runtime log said: "Maximum number of sessions exceeded! (You are currently using a trial license)". Browser test scripts that died before `mx.logout()` had used up the trial licence's sessions. A restart cleared them. Test scripts must log out even when they fail.

## Graph animation: smooth instead of stuttery (2026-11-12)

Reported: the graph widget's animation was stuttery (Product explorer and the chat's graph card share `widgets-src/shared/graph/GraphView.tsx`). Two causes:
- Cytoscape's `cose` layout with `animate: true` redraws its iterations as it computes, with `fit` re-zooming along the way.
- New nodes appeared at random spots up to 60 px away and jumped from there.

The fix:
- **One eased move:** `animate: "end"` computes the layout first and plays it as one move (600 ms, ease-in-out-cubic), view included.
- **Fade-in:** new nodes start on the node that was clicked and fade in.
- **One layout at a time:** a layout still running is stopped before the next.
- **Pan and zoom:** `textureOnViewport` draws a cached bitmap while the view moves.

**Measuring it.** Frame rate does not show stutter. Both versions held 60 fps with no frame over 17 ms in headless Chromium, so that metric could not tell them apart. Per-frame node displacement does: sample every node's rendered position each `requestAnimationFrame` while a node expands.

| | Biggest jump in one frame | Spread over |
|---|---|---|
| Old widget (control, the committed mpk reinstalled) | 452 px | 18 frames |
| New | 38 px | 34 frames (≈ 600 ms) |

## Map cards with Leaflet (2026-11-12)

Chat cards can now carry a map: a parcel's `route` (numbered stops) or `points` sized by a value (days at each hub). Places are names, resolved to coordinates by the app (`rest/places/v1/places`). The model never writes coordinates, so it cannot put a made-up position on a map.

Verified live as demo_customer:
- **"Where is my order SO-10002?"** The order card shows a route map: Leipzig, then Venlo in amber. The details panel shows the same route, with tiles loaded.
- **"Where is most time spent … show the hubs on a map"** A map card with Venlo 2.9, Utrecht 0.9 and Eindhoven 0.6 days. These match GetDeliveryStatistics' figures, with Venlo emphasised.

**CARTO basemaps need a key now.** `basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` answers 200 to any request, but every tile is a grey image reading "API KEY REQUIRED", with or without a Referer. So a status check reports it healthy; only looking at a tile shows the problem. The map uses Esri's keyless Gray Canvas tiles (`server.arcgisonline.com/…/Canvas/World_Dark_Gray_Base` plus `_Reference` labels). OpenStreetMap's standard tiles also work keyless (light only; dark needs a CSS invert), but its tile policy asks heavy or production users to use their own tile server.

**A route stop per place, not per scan.** Three scans at two places (Leipzig picked up; Venlo arrived, then delayed) are two stops. The stop shows the latest scan at that place, so the Venlo stop carries the delay. Taking the first scan made the panel's Venlo stop teal while the chat's was amber.

**`revoke` is a one-off in a repeatable script.** Narrowing Place from admin CRUD to read-only with `revoke … from Admin` worked once. Then the roles shared one read rule, and a second run refused: the rule "also grants" other roles. From a fresh model the plain `grant read` produces the same state, so the revoke was removed from the script after it had run.

The 404 in the browser console is Conversational UI's own `llm-streaming` endpoint, present before this change.

Gates:
- `check` is clean, and every script's second `exec` writes nothing.
- `lint`: 0 errors, 22 warnings.
- `report`: 62/100.
- `docker check`: 0 errors.
- `test`: 45/45 pass.
- Widget unit tests: 18/18 pass, 4 new for map parsing, including rejecting HTML and coordinates as place names.

## 3D product viewer with a procedural bike (2026-11-12)

Verified live:
- **Product explorer** (demo_agent, Graph | 3D): the EB-200 is drawn with its battery, rear hub motor and charger, plus the tyres, tubes, disc brakes and seat post the graph lists as compatible. **Show what fits** adds the rack, basket, child seat and lights. The exploded view separates the parts. Clicking the battery highlights it and shows its price and warranty.
- **Chat** (demo_customer): "Where is the battery on my EB-200 from SO-10003, and is it affected by the battery recall? Show me on the bike." The answer has a model card with BAT-418 lit, next to the recall card. That card says "Not affected" (the unit is batch B2605, the recall is B2603), so the highlight stayed teal rather than red, as the prompt asks.

**The graph decides what the bike has, the code only where things sit.** Mapping SKU prefixes to positions keeps the model generic: the EB-500 gets its mid-drive and its battery from the graph without a model of its own. The bike's `brakes` value picks disc or rim brakes.

**The bundle grows.** three.js makes the ChatRichText package about 716 KB (was 454 KB). It is not loaded lazily: the pluggable-widget build produces a single bundle.

**Headless Chromium renders WebGL** (software), so the viewer can be screenshotted and recorded; it is only slower.

Gates:
- `check` is clean, and every script's second `exec` writes nothing.
- `lint`: 0 errors, 22 warnings.
- `report`: 62/100.
- `docker check`: 0 errors.
- `test`: 45/45 pass.
- Widget unit tests: 20/20 pass, 2 new for model cards.

## Glass theme: buttons, grid corners and filters (2026-11-12)

Reported on Tickets: no space around the buttons, square table corners against the panel's rounded ones, and broken filter fields. Measured in the browser:

- **The theme's control height was 30px** (`--mxt-control-height`, inherited from the compact console base). Dropdown filters are 30px tall with 8px padding top and bottom, which left 12px for 20px text, so "Select" was cut off. The text filter box (30px) also sat next to a 38px operator button. The glass palette now uses 38px controls and 40px rows, and the grid filters share that one height with their text centred.
- **Data Grid 2's table painted its own background** (`.widget-datagrid-grid.table`) inside the glass panel. Its square corners showed against the panel's rounded ones. The table is now transparent, and the header row has a soft tint with rounded ends inside the panel's 10px padding.
- **Buttons had no margin.** Side-by-side buttons on a page now get a gap and room below. The rule uses `:where()` (zero specificity) so a page's own layout, such as the chat's full-width "New chat" and the Home tiles, still wins.
- **Home had no page padding** (it has no layout grid). It is now padded.

Checked after the fix: on Tickets and Orders the filters are 38px tall and their text is not clipped. The New chat button keeps margin 0, and the pages are no taller than the window.

**Audit of every page afterwards.** All 17 menu pages and 5 popups (ticket, order, refund request, customer, model price; policy document opens a full page) were checked as demo_administrator. Each got an automated check (form controls too short for their text, side-by-side buttons with no gap, square painted children flush in a rounded panel's corner, horizontal overflow) and a 2x screenshot. Three more fixes came out of it:
- Traces (Conversational UI) and Agents (Agent Commons) have no layout grid, so their panel ran to the window edge. Both use a `…-page-content-container` class, now padded 24px.
- The Model prices help text was inline and ran into the "New price" button. It is now a paragraph.
- The refund popup's "Order SO-…" line sat on the Amount label. It is now a paragraph.

The remaining "touching buttons" hits are intended button groups: the grids' pager arrows and the period selectors on Token usage and Traces.

## Eleven chat additions, and talking to a person (2026-11-12)

Verified live (demo_customer and demo_agent in two browsers at once):
- **Delay notice:** after the startup sync, Ada's latest chat holds "A heads-up about order SO-10002", with an order card (Delayed, DHL, its three scans) and three suggestion chips. The runtime log shows 17 syncs since the first one (restarts plus the scheduled event); 15 posted nothing, because the ChatNotice row was there.
- **Talk to a person:** the customer asks "I want to talk to a person please". The chat appears in Live chats with its topic. When Sam opens it, the customer sees "Hi, I'm Sam de Wit…" within 7 seconds, without reloading, and Sam's reply arrives the same way. The customer's next message gets no model answer, only "Sent to Sam de Wit", and shows in Sam's transcript. "Hand back" posts "Sam de Wit has left the chat", and the model answers again.
- **Earlier batches still work** after the access changes below: a photo creates ticket #1024 with the photo attached, and a thumbs down stores an AnswerRating.

**One notice was posted twice, cause not found.** A restart at 22:23 ran 44 DDL commands. Afterwards the 21:58 ChatNotice row was gone, so the notice was posted again; Ada's chats now hold two. Measured since, with direct SQL on `servicedesk$chatnotice`, the row survives each of these:
- a control restart;
- removing NoticeKey's `unique` (3 DDL commands);
- adding it back (3 DDL commands).

The entity's and attributes' ids in `mendixsystem$entity` and `mendixsystem$attribute` equal the model's GUIDs, so no GUID was re-minted. These are mxcli-created elements, though (GUID = $ID), which cannot show a re-mint. What else was in that restart is not reconstructable from the log. If it happens again, record the DDL first.

**A Conversational UI send has a placeholder answer that must be filled, not deleted.** The client shows a "Loading" assistant message while the action microflow runs. When the action microflow skipped the model and deleted that placeholder (`delete … refresh`), the typing dots stayed in the browser. Filling it in instead ("Sent to Sam de Wit") clears them, the same way the model's answer would.

**A list sourced over an association reloads when one object of its entity is refreshed.** The live refresh is `commit $Recent refresh` on the newest message, and the CUI message list (a database source over `ChatContext → Message`) shows the new message. The refresh runs only when a message arrived in the last 8 seconds (the poll is 5), so an idle chat does not re-render.

**CUI zeroes the textarea's padding with `!important`** (`.chat-input-wrapper .form-group .form-control`). Room for the compose buttons therefore needs `!important` as well, on a more specific selector. Without it the placeholder ran under the buttons. Found by listing the matching CSS rules in the browser, not from the screenshot.

**A grant only adds rights.** Removing `create` from a `grant` line left the right in place. It takes a `revoke create on entity …`, which is a no-op ("nothing to revoke") on the next run, so scripts stay idempotent. AnswerRating, ChatHandoff, ChatPhoto and ServiceAppointment are created only in microflows now.

**Splitting an ACT_ microflow into ACT_ + SUB_ is a reshape.** Three of them hit MDL-V1-REBUILD, because their early-return decisions cannot be spliced. They were dropped once in a scratch script and recreated by the project script, which keeps the project script re-runnable.

Gates:
- `check` is clean, and every script's second `exec` writes nothing.
- `lint`: 0 errors, 31 warnings. The four batches had raised it from 22 to 64; moving logic out of the ACT_ microflows and revoking create rights brought it down. Of the rest, the new ones are no business key on ChatPhoto, ChatHandoff and AnswerRating (they have AutoNumbers), and ChatHandoff's 11 attributes.
- `report`: 50/100 (47 before these fixes, 62 before the four batches). Security scores 0: its warnings are staff reading every row of ratings, handoffs and appointments, which is what those staff pages are for.
- `docker check`: 0 errors.
- `test`: 49/49 pass, 4 new (recognising a request for a person, and a delay notice's card and chips).

## Re-recording the demo: two chat defects it found (2026-11-12)

**A new chat was not stored until its first question.** `ChatContext_Create_ForAgentDocument` returns an uncommitted chat. So a delay notice posted while the customer had a fresh chat open went into their previous chat. Of 41 stored chats, one had no topic. `SUB_SupportChat_Create` now commits the chat and its provider configs at once. The history still lists a chat without a topic only while it is open.

**A chat that opens with a message from the app could not be answered.** For an assistant message with no user message before it, Conversational UI adds an empty user message to keep the roles alternating (`Request_AddEmptyUserMessage`). Bedrock then refuses the request: "ContentBlock object at messages.0.content.0 must set one of the following keys". Found by logging the request's messages: user (empty), assistant (the notice), user (the question). Restating the notice as a user message did not help: the empty one was still first. `SUB_Request_StartWithUser`, called from the action microflow after preprocessing, now fills an empty user message with a line of text. It does so only when the chat opens with an assistant message. Verified live: the same chat, which had answered "Error" twice, then answered with a route-map card.

**`mxcli check` passes a `show message` whose text is an expression**, and mxbuild then fails with CE0117. Filed as ako/mxcli#2199. The workaround is one literal message per branch.

**A manual sync can collide with the scheduled one.** `SUB_Shipments_Sync` deletes and re-imports every shipment. "Check parcels now", run just as the 15-minute event fired, failed one of the two on the TrackingCode unique constraint. The other completed, so no data was lost. Left as is: the window is small, and the scheduled event already skips its own overlaps.

## Studio Pro: "unknown type 'agenteditor.agent'", and agent documents do not open (2026-11-13)

Reported from Studio Pro 11.16. The project had three errors in AgentEditorCommons ("The parameter 'Agent' is of an unknown type 'agenteditor.agent'"). Every agent document showed "Waiting for the document editor to be available … extension extension/agent-editor … is not loaded".

**Cause: the project, not Mendix.** The Marketplace package "Agent Editor" (257918, 2.7.0) carries two things:
- the AgentEditorCommons module;
- `modules/AgentEditor.mxmodule`, a protected add-on module whose package declares `<extension name="agent-editor"/>` and holds the extension's code under `extensions/agent-editor/`.

Studio Pro keeps such an add-on as a file in the app's `modules/` folder, with no unit in the `.mpr`. `mxcli marketplace install` imported only the AgentEditorCommons module, so the extension was never in the project. Studio Pro then knows neither the `agenteditor.agent` type nor the editor for the documents of that type.

`mx check` and the build stay green either way: neither checks the extension. Only Studio Pro shows it.

**Fix:** `modules/AgentEditor.mxmodule` taken from the 2.7.0 package (the version of the installed AgentEditorCommons) and committed. Afterwards `mxcli show modules` lists AgentEditor 2.7.0 as a packaged, protected add-on, `docker check` reports 0 errors, and the app builds and runs.

When Agent Editor is updated, the `.mxmodule` has to be updated with it. Updating through Studio Pro's Marketplace does both. The installer gap is filed as ako/mxcli#2205.

## Wiki prototype: a curated knowledge base instead of chunks (2026-11-13)

Verified live:
- **Compile.** The curator turned the two policy documents (185 and 162 words) into 8 linked pages in one 24-second run: returns, refunds, goodwill refund for late delivery, damaged items, delivery and carriers, changing the delivery address, warranty, password reset. Each came with a reason. All 8 went through review tasks into the wiki.
- **Check.** The lint run proposed 3 fixes, all real:
  - "Any item: 45 days" read as covering bikes too, which have 14 days. The source has the same ambiguity, and the vector knowledge base passes it on unchanged.
  - A rule on the password page was stated twice.
  - A summary list repeated the paragraphs above it.
- **Chat.** Four customer questions were answered from the wiki: e-bike returns, changing the address, a late order, workshop hours plus a helmet return.
  - For staff, the Tool calls tab shows WikiIndex, then WikiRead on the pages the answer used.
  - Every policy-card quote was found word for word on the cited page ("Wiki: Returns", "Wiki: Goodwill refund for late delivery", and so on).
- **Edit from the chat.** A staff request to add an "Opening hours" page became a proposal after the approval prompt. Once approved, it answered the next customer question.

Not compared: answer quality and cost against the vector knowledge base on the same questions. With two short documents both give the same facts; the differences are elsewhere:
- **Traceable answers:** every answer comes from a page a person approved.
- **Contradictions surface:** the lint pass found one in the sources.
- **People can edit the knowledge directly.**
- **Cost:** reading pages costs more tokens per question than four retrieved chunks. That was not measured.

Design decisions and what they cost:
- **The curator gets everything in its prompt and answers with JSON; it uses no tools.** Ingest is then one deterministic call, and the JSON is the proposal. It only works while the whole wiki fits in the prompt: fine for tens of pages, not for thousands. Proposals still waiting for review are included, so a second run builds on them.
- **Pages are database objects, not `.md` files.** Mendix security, history and search work on them as on any entity. Export to files or git is not built.
- **Search is a word count, not full-text or embeddings:** title and tags count double. Fine for nine pages. For hundreds, Postgres full-text through the database connector would be the next step.
- **Mendix `replaceAll` has no back-references**, so `[[slug]]` is turned into titles by a loop in a microflow (`SUB_Wiki_Render`), not by a regex replace.

Found on the way:
- **The shared `.sd-panel` style sets `height: 100%`,** which suits the chat's columns. On the review page it made both panels run into the form below them. Wiki panels now set their own height.
- **A page that customers can open must not show an entity they cannot read,** even in a grid only staff would use. mxbuild reported CE2729 for the revisions grid on the wiki page, and `mxcli check` did not catch it. The log moved to a staff-only page.
- **The assistant echoed `[[returns]]` in a chat answer.** The prompt now says to name pages by title.

## The wiki over MCP (2026-11-13)

Both MCP servers register four wiki tools (`wiki_index`, `wiki_search`, `wiki_read`, `wiki_propose_edit`) and a `wiki_answer` prompt, beside the order and ticket tools. They are the same microflows the chat assistant uses, so the MCP Server module runs them as the signed-in user. Proposing an edit checks that the caller is staff.

Verified live with `tests-live/mcp/wiki_test.py` against `/servicedesk/mcp` (9 checks pass):
- the wiki tools are listed;
- the index lists the pages;
- "return e-bike kilometres" finds the returns page first;
- reading a page gives its links and backlinks;
- "refund" suggests "refunds";
- a customer's edit is refused, and an invalid slug is refused;
- demo_agent's "Bike sizing" page became a proposal and was then approved in the app;
- the prompt carries the question and the index.

`basic_auth_test.py` still passes. The OAuth server registers the same tools through the same microflow. It was not tested live this time, because Keycloak was not running.

- **Tool output named the chat tool names** ("open a page with WikiRead"). An MCP client knows those tools as `wiki_read`, so the wording is now neutral ("with the read tool").
- **A proposal over MCP was logged as coming from the chat.** The MCP tool is a thin wrapper (`MCPTool_WikiProposeEdit`) that records "MCP, <user>"; it shares `SUB_Wiki_ProposeAsStaff` with the chat tool.
- **The live test proposes a page every run.** Each run leaves a review task: approve or reject it in My tasks.

## Wiki search: PostgreSQL full-text search (2026-11-13)

`wiki_search`, the chat's WikiSearch and the wiki page's new search box all run one SQL query. It goes over the External Database Connector (`ServiceDesk.WikiSearchDatabase`) to the app's own database. The query uses:
- a weighted `tsvector` (title and tags A, summary B, body C);
- `plainto_tsquery` with its `&` turned into `|`, so any word may match and more matches rank higher;
- `ts_rank_cd` for ranking;
- `ts_headline` for a snippet, with `StartSel=**` so the chat widget renders the matches in bold.

A GIN expression index (`wiki_fts_idx`) on the same expression is created by `tools/wiki-search/setup.sh`, with a role (`wiki_search`) that has SELECT on the wiki table only.

Verified live:
- "refunding", which no page contains, finds the refunds page first, through stemming. The word match would find nothing.
- "return e-bike kilometres" ranks the returns page first (9.2) ahead of bike sizing (1.8).
- A query of only stop words returns nothing.
- The role is refused a delete.
- `tests-live/mcp/wiki_test.py` passes 13/13, 4 of them new for full-text search.
- The search page shows ranked results with bold snippets, and opening a hit opens its page.
- **The fallback works:** the microflow test runtime has no search password. Its log says "Wiki full-text search is not available, using the word match: … the password is an empty string", and the search test passes on the word match.

Notes:
- **The snippet is built from flattened text.** Markdown headings, `[[links]]` (shown as their slug) and table rules (`|---|`) are stripped first. Otherwise the chat widget rendered the table's `---` as em dashes in the snippet.
- **The index is not ours.** It sits on a table Mendix manages, and Mendix's own sync leaves unknown indexes alone, as far as this run shows: `wiki_fts_idx` survived several restarts. If an entity change makes Mendix rebuild the table, run `setup.sh` again.
- **On Mendix Cloud the app's database is not reachable** over the External Database Connector. There, the same query would run against a separate search database that the app keeps up to date when a page is published.
- **Wrong conclusion on the way:** a screenshot script wrote relative to the working directory, and I compared a stale file for three rounds before noticing. Write test artifacts to an absolute path.

### Update: full-text search on the runtime's own connection (2026-11-13)

The External Database Connector version needed a second login to the app's own database: a role, a password constant and a setup script. It also could not run on Mendix Cloud, where the app's database is not reachable that way. The runtime API offers the app's own connection instead: `Core.dataStorage().executeWithConnection(IContext, Function<Connection, R>)` in `com.mendix.public-api.jar`. Two Java actions now use it:
- `JA_Wiki_SearchFullText` runs the same weighted query as a `PreparedStatement`, with the user's text as its only parameter, and builds `WikiSearchRow` objects.
- `JA_Wiki_EnsureSearchIndex` runs `create index if not exists wiki_fts_idx …` from `ASU_App`. It logs and returns false on a database that is not PostgreSQL, so startup never fails on it.

The connector, its three constants, the role and `tools/wiki-search/setup.sh` are gone.

Measured:
- **The startup action creates the index.** It was dropped (`pg_indexes` count 0), the app was restarted, and the count was 1.
- **PostgreSQL uses it.** `explain` with `enable_seqscan = off` gives "Bitmap Index Scan on wiki_fts_idx" for the app's expression. The index expression and the query's must match exactly; they share one Java constant.
- **The context overload matters.** With `executeWithConnection(getContext(), …)` the search sees a page the same transaction has just stored. A new microflow test stores a page and searches for it with a stemmed word, and passes. Control: switched to the overload without a context, the same test fails ("expected $Ok = true, actual: false"); switched back, it passes.
- `tests-live/mcp/wiki_test.py` 13/13, and the search page still shows ranked results with snippets.

Caveat: the SQL names Mendix's own table and columns (`"servicedesk$wikipage"`, `title`, `body`, …). Renaming the entity or an attribute means changing the Java constant too; nothing checks that at build time.
