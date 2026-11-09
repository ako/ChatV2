# ServiceDesk

<!-- mxcli-brain -->

Decisions anchored to the ServiceDesk module. Loaded when ServiceDesk is in play,
not otherwise.

## Security runs at Production level with demo users enabled

Anchors: `@ServiceDesk.Customer` · id `70e8b4` · 2026-11-08

The blank template ships with security Off, which ignores every access rule and creates no demo users. Prototype enforces page and microflow access but not entity XPath rules, so customers saw every order. Production is the only level where a customer sees only their own data. Demo users stay on because this is a demo app (lint SEC003 is expected).

## SupportAgent and Admin read all service-desk rows on purpose

Anchors: `@ServiceDesk.Ticket` · id `1b9de2` · 2026-11-08

Staff work across all customers, so their entity access has no XPath constraint. Lint CONV007/SEC008 on these roles is expected; only the Customer role is row-constrained.

## The seed creates the demo_customer account itself

Anchors: `@ServiceDesk.SUB_EnsureDemoCustomerAccount` · id `10285b` · 2026-11-08

The runtime had not created demo users when the after-startup microflow ran, so the Customer link stayed empty. SUB_EnsureDemoCustomerAccount creates the account with the Customer role when it is missing, then SUB_SeedCustomers links it to Ada Jansen.

## A new agent needs scripts/apply-agents.sh once, to set its selected model

Anchors: `@ServiceDesk.SupportAgent` · id `b486f6` · 2026-11-08

Since mxcli nightly 2026-11-09 (ako/mxcli#2037, #2038), 07-agents.mdl writes tool microflow references, tool approval and streaming, and create or modify keeps fields it does not model. Only selectedModel cannot be written yet (ako/mxcli#2031); without it Agent Editor refuses the agent and aborts the import of all agents. scripts/apply-agents.sh runs the script and then scripts/patch-agent-documents.py, which sets selectedModel from scripts/agent-document-fields.json where it is missing. An older mxcli drops these fields again on every exec.

## SupportAgent runs on Claude Sonnet 5.5, TriageAgent on Claude Haiku 5.5, without temperature

Anchors: `@ServiceDesk.SupportModel` · id `76c0ef` · 2026-11-08

Both come from the one Mendix Cloud GenAI text resource (11 Claude models). Claude 5.5 models reject a temperature parameter with HTTP 400, so neither agent sets one. Haiku keeps the frequent triage calls cheap.

## The knowledge base tool is not attached until a knowledge-base key exists

Anchors: `@ServiceDesk.PolicyKnowledgeBase` · id `2d15b5` · 2026-11-08 · OPEN

GENAI_TEXT_KEY is a text-generation key; a Mendix Cloud GenAI knowledge base needs its own resource and key (constant ServiceDesk.MxGenAIKnowledgeBaseKey). Attach the PolicyKnowledgeBase tool to SupportAgent once that key is available.

## Workflow and attachment microflows call agents through Agent Commons by name, not by agent document

Anchors: `@ServiceDesk.SUB_GetAgent` · id `a8ec2e` · 2026-11-08

SUB_Ticket_ApplyTriage and SUB_Attachment_SaveAndAnalyse retrieve the imported AgentCommons.Agent by _QualifiedName and call AgentCommons.Agent_Call_WithoutHistory. check --references resolves agent-document references, and the dependency cycle tool -> workflow -> agent -> tool would otherwise make a fresh run of the scripts fail in any order.

## Ticket status mirrors the workflow; the workflow is the source of truth

Anchors: `@ServiceDesk.WF_TicketHandling` · id `7dd2d0` · 2026-11-08

WF_TicketHandling sets Status through WFA_ microflows at each step so the ticket lists and the customer can see progress. Triage only moves an Open ticket to Triaged, so re-triaging from the chat tool never moves a ticket backwards.

## Customers' new tickets are linked to them in SUB_Ticket_Submit

Anchors: `@ServiceDesk.SUB_Ticket_Submit` · id `202886` · 2026-11-08

The Customer role may not write Ticket_Customer, so a ticket created from the page was saved without a customer and disappeared from the customer's own list. The save microflow links it to the signed-in customer.

## The MCP server uses runtime configuration with app-account authentication, not OAuth

Anchors: `@ServiceDesk.MCP_Initialize` · id `8c8860` · 2026-11-08

MCP_Initialize registers the server with MCPServer.CreateMCPServer / AddTool / AddPrompt (pattern from ako/mxcli#2041) because MDL cannot write a Published MCP Service document yet (ako/mxcli#2020). Clients authenticate with Username and Password headers checked by MCP_Authenticate, so tools run as that user and a customer only reaches their own data. OAuth 2.0 needs an authorization server (AuthorizationServerUrl, Scopes) and is not set up in this demo.

## The external MCP server is a local stand-in carrier (tools/carrier-mcp), consumed through ServiceDesk.CarrierTracking

Anchors: `@ServiceDesk.CarrierTracking` · id `e2f7f0` · 2026-11-09

A Python MCP SDK 2.x server on 127.0.0.1:8765 serves track_parcel for the demo orders' tracking codes, so the demo needs no outside network. MDL cannot write a consumed MCP service's endpoint constant or credentials microflow yet; scripts/patch-agent-documents.py sets the endpoint (ServiceDesk.CarrierMcpEndpoint) once, and create or modify keeps it. track_parcel is not scoped to the signed-in customer: a tracking code works like a shared secret, as it does with real carriers.
