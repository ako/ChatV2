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
- [ako/mxcli#2024](https://github.com/ako/mxcli/issues/2024) No native **`call agent`** microflow action. The workaround is calling the AgentCommons
  Java actions.

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
