# Slice: 03-mcp

<!-- mxcli-brain -->

Requirements for this slice. Anchors point FORWARD, at what the slice
will build — an anchor that does not resolve yet means not built, not
stale. `mxcli brain plan` counts them against the model.

## The app publishes order and ticket lookup as an MCP service secured with OAuth 2.0, callable from Claude Desktop or Claude Code

Anchors: `@ServiceDesk.ServiceDeskMCP` · id `e9d7d4` · 2026-11-08

## The support agent uses tools from an external MCP server via a consumed MCP service

Anchors: `@ServiceDesk.ExternalMCP` · id `0e188f` · 2026-11-08

## The app publishes order status and ticket search over MCP, plus a ticket-reply prompt

Anchors: `@ServiceDesk.MCP_Initialize` · id `27c8e1` · 2026-11-08
