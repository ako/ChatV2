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

## Agent documents need scripts/apply-agents.sh, not 06-agents.mdl alone

Anchors: `@ServiceDesk.SupportAgent` · id `b486f6` · 2026-11-08

mxcli does not write selectedModel, tool microflow references, tool approval or streaming into agent documents, and create or modify drops them again. scripts/patch-agent-documents.py fills them in from scripts/agent-document-fields.json after every exec of 06-agents.mdl; without it the agents fail to import or the model call fails with HTTP 400.

## SupportAgent runs on Claude Sonnet 5.5, TriageAgent on Claude Haiku 5.5, without temperature

Anchors: `@ServiceDesk.SupportModel` · id `76c0ef` · 2026-11-08

Both come from the one Mendix Cloud GenAI text resource (11 Claude models). Claude 5.5 models reject a temperature parameter with HTTP 400, so neither agent sets one. Haiku keeps the frequent triage calls cheap.

## The knowledge base tool is not attached until a knowledge-base key exists

Anchors: `@ServiceDesk.PolicyKnowledgeBase` · id `2d15b5` · 2026-11-08 · OPEN

GENAI_TEXT_KEY is a text-generation key; a Mendix Cloud GenAI knowledge base needs its own resource and key (constant ServiceDesk.MxGenAIKnowledgeBaseKey). Attach the PolicyKnowledgeBase tool to SupportAgent once that key is available.
