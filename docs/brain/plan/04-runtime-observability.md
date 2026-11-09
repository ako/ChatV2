# Slice: 04-runtime-observability

<!-- mxcli-brain -->

Requirements for this slice. Anchors point FORWARD, at what the slice
will build — an anchor that does not resolve yet means not built, not
stale. `mxcli brain plan` counts them against the model.

## Administrators see token usage and traces of model, tool, knowledge base and MCP calls

Anchors: `@ServiceDesk.Admin_Observability` · id `1df8e4` · 2026-11-08

## An admin dashboard shows open tickets per category and priority and refund totals

Anchors: `@ServiceDesk.TicketStats`, `@ServiceDesk.RefundTotals` · id `0233aa` · 2026-11-08

## Does streaming work with the OpenAI connector?

Anchors: none · id `614887` · 2026-11-08 · OPEN

The Agent Commons docs say only Mendix Cloud GenAI streams; the 11.14 release post lists OpenAI 9.2+. Must be tested.

## The same support agent is rebuilt in the Agent Commons runtime builder, with versions, health check, bulk test runs and export/import

Anchors: `@ServiceDesk.ASU_SeedRuntimeAgent` · id `c6665c` · 2026-11-08

## An OpenAI-compatible endpoint is tested as the model for a runtime agent, with PgVector for its knowledge base

Anchors: `@ServiceDesk.ASU_ConfigureOpenAICompatible` · id `e9f0cf` · 2026-11-08

## Solved with a mixed setup: the runtime agent's chat model is on OpenRouter (free), and its PgVector knowledge base is embedded with a Mendix Cloud GenAI embeddings key (ServiceDesk.MxGenAIEmbeddingsKey). The vectors live in a local servicedesk_vectors database with pgvector 0.6 (apt postgresql-16-pgvector). Verified 2026-11-09: the OpenRouter agent answered the e-bike return question from PgVector, with references.

Anchors: none · id `d4584c` · 2026-11-09

Resolves: PgVector knowledge base on the OpenAI-compatible endpoint is not possible with OpenRouter

OpenRouter lists no embedding models (free or paid), and the local Postgres 16 has no vector extension. The knowledge-base half of the OpenAI-compatible requirement needs another embeddings provider, for example a Mendix Cloud GenAI knowledge base key or a local embeddings server.

## The runtime agent answers policy questions from a PgVector knowledge base, embedded with a Mendix Cloud GenAI embeddings model and loaded from the same Policy documents page

Anchors: `@ServiceDesk.ASU_ConfigurePgVector`, `@ServiceDesk.SUB_RuntimeAgent_AttachPolicies` · id `a49174` · 2026-11-09

## The app reads the PgVector database over SQL with the External Database Connector, as a read-only user: chunks per policy document on a page, and chunk counts as a staff-only agent tool

Anchors: `@ServiceDesk.VectorDatabase` · id `a24e41` · 2026-11-09
