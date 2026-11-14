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

## Return requests run as WF_ReturnRequest: AI agent tasks decide eligibility (enum outcome drives the path, NeedsReview on any failure) and draft the reply; people review unclear cases and approve every reply. The eligibility agent gets the policy text in its prompt, not the knowledge base tool

Anchors: none · id `2af278` · 2026-11-12

## The AI's product tools (ProductTools.java: agent tools and the app's MCP server) only reach the order-free catalog dataset; order contents reach the AI only through app tools that check the user (GetOrderProducts, GetOrderStatus). Never give an AI-callable tool the products or app dataset.

Anchors: none · id `d3f527` · 2026-11-12

## The product graph is SPARQL over the app database, run inside the Mendix runtime (DuckDB via duckdb_jdbc + rdf extension + R2RML mapping in resources/sparql; 25-sparql-in-runtime.mdl), not a separate triple store or sidecar; catalog data lives in Product/Supplier/KnownIssue/OrderLine

Anchors: none · id `e316af` · 2026-11-13

## A bike's 3D model is data: MountSlot (per bike, fit size), BomLine (Fitted/Standard), PartModel + ShapePart primitives (26-bike-bom.mdl), served by GET rest/productgraph/v1/models/{ref}; the BOM is also the single source of shop:hasComponent. Change a part's look or mount in data (tools/product-catalog/bike_models.py seed), never by SKU rules in bike.ts

Anchors: none · id `f0ee5b` · 2026-11-14

## Catalog master data is edited in the Catalog workspace (27-catalog-workspace.mdl) by the CatalogManager role; saves discard the GraphNode snapshot rather than rebuild it, because SPARQL (own DuckDB connection) cannot see the saving transaction's uncommitted changes

Anchors: none · id `06d0eb` · 2026-11-14
