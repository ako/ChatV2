# ServiceDeskCopilot

A demo Mendix app to try out the **agent and chat features of Mendix 11.16** (Agents Kit 2),
built with [mxcli](https://mxcli.org).

## What it is for

A demo app for testing the Mendix 11.16 Agents Kit 2 features. Service-desk staff chat
with an AI support agent that looks up orders and tickets, answers from a policy and FAQ
knowledge base, and creates tickets or refunds after the user approves. A triage agent
classifies incoming tickets and uploaded documents. The app also publishes its tools over
MCP and uses tools from an external MCP server.

## What it keeps track of

- **Customer**, who has many **Orders**
- **Ticket**, linked to a Customer and optionally an Order. A Ticket has many **Attachments**.
- **RefundRequest**, one per Order
- Steps people act on: ticket triage, then assignment, then resolution, with refund
  approval. This is modelled as a **workflow** that includes an AI Agent Task.
- Counts across records: open tickets per category and priority, and refund totals.
  These are **view entities** feeding an admin dashboard.
- Agents, chat history, traces and token usage come from the Agents Kit modules
  (GenAI Commons, Agent Commons, Conversational UI, Agent Editor and others).

## Who logs in

| Role | May do |
|---|---|
| Customer | Chat with the agent; see only their own orders and tickets |
| SupportAgent | See all tickets; approve agent actions; handle workflow tasks |
| Administrator | Configure agents, models, keys, MCP and knowledge bases; view traces and token usage |

## Build details

- Mendix **11.16.0**, theme **signal**
- Every MDL script in `mdlsource/` starts with `mdl 1;`
- Scope, split into slices: `docs/brain/plan/` (run `./mxcli brain plan` for progress)
- Research findings and tooling notes: `FINDINGS.md`

## Run it

```bash
./mxcli run --local --watch --detach -p ServiceDeskCopilot.mpr   # http://localhost:8080/
```
