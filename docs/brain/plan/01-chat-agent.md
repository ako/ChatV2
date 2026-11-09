# Slice: 01-chat-agent

<!-- mxcli-brain -->

Requirements for this slice. Anchors point FORWARD, at what the slice
will build — an anchor that does not resolve yet means not built, not
stale. `mxcli brain plan` counts them against the model.

## A support chat agent answers customers and staff using order and ticket data

Anchors: `@ServiceDesk.SupportAgent` · id `e7082d` · 2026-11-08

## The agent can look up an order's status (tool, visible to the user)

Anchors: `@ServiceDesk.Tool_GetOrderStatus` · id `ef23b9` · 2026-11-08

## The agent can search tickets (tool, visible to the user)

Anchors: `@ServiceDesk.Tool_SearchTickets` · id `8e72c7` · 2026-11-08

## The agent can create a ticket, only after the user approves it (human-in-the-loop)

Anchors: `@ServiceDesk.Tool_CreateTicket` · id `4df568` · 2026-11-08

## The agent can request a refund, only after the user approves it (human-in-the-loop)

Anchors: `@ServiceDesk.Tool_IssueRefund`, `@ServiceDesk.RefundRequest` · id `6c01a5` · 2026-11-08

## The agent answers policy and FAQ questions from a knowledge base, citing sources

Anchors: `@ServiceDesk.PolicyKnowledgeBase` · id `f36eef` · 2026-11-08

## Responses stream word by word in the chat

Anchors: `@ServiceDesk.SupportModel` · id `db6691` · 2026-11-08

## A full-screen chat page with conversation history

Anchors: `@ServiceDesk.Chat_FullScreen` · id `eb0cf4` · 2026-11-08

## A floating pop-up chat on the ticket overview page

Anchors: `@ServiceDesk.Ticket_Overview` · id `59283b` · 2026-11-08

## Customers, Orders and Tickets exist with demo data; a Customer has many Orders, a Ticket belongs to a Customer and optionally an Order

Anchors: `@ServiceDesk.Customer`, `@ServiceDesk.Order`, `@ServiceDesk.Ticket` · id `98578d` · 2026-11-08

## The SupportAgent answers policy questions from the Mendix Cloud GenAI knowledge base, collection 'policies'

Anchors: `@ServiceDesk.SUB_PolicyDocument_Ingest` · id `344193` · 2026-11-09
