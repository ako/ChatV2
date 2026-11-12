# Project

<!-- mxcli-brain -->

Decisions that are not about one module. This file is loaded every
session, so it carries the tightest cap — see `mxcli brain show`.

## A Mendix Cloud GenAI key works from outside Mendix Cloud

Anchors: none · id `e0de85` · 2026-11-08

Resolves: Is a Mendix Cloud GenAI key bound to the environment chosen at provisioning?

Verified 2026-11-08: GENAI_TEXT_KEY imported in a local run --local in a Claude Code cloud container exposed 11 Claude models and served chat, tool and task calls. Binding to the provisioning environment was not observed.

The docs do not say. Decides whether one Test-resource key can serve local runs and the cloud demo.

## Agent Editor agents use Mendix Cloud GenAI; OpenAI-compatible endpoints are only for Agent Commons agents

Anchors: none · id `acd506` · 2026-11-08

Agent Editor supports only Mendix Cloud GenAI and Azure AI Foundry for models and only Mendix Cloud GenAI for knowledge bases, so a bring-your-own endpoint cannot back a design-time agent.

## Conversational UI's message snippet is customised: both Markdown viewers are replaced by the ChatRichText widget (mdlsource/13-chat-rich-text.mdl). Re-run that script after updating Conversational UI.

Anchors: none · id `ce67f4` · 2026-11-11

## Delivery statistics come from shipments synced into the app from the carrier's REST API, aggregated by OQL view entities; the agent reports the tool's numbers and never computes averages itself

Anchors: none · id `ac79df` · 2026-11-12

## Card references are product graph node ids (SKU, supplier, issue id, order number), resolved by rest/productgraph/v1/nodes/{ref} with the user's session; customers never see other customers' orders through it

Anchors: none · id `813667` · 2026-11-12
