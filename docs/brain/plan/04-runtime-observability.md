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
