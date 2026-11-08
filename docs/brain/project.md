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
