# Slice: 02-triage-workflow

<!-- mxcli-brain -->

Requirements for this slice. Anchors point FORWARD, at what the slice
will build — an anchor that does not resolve yet means not built, not
stale. `mxcli brain plan` counts them against the model.

## A triage task agent classifies a ticket's priority and category, called from a microflow without chat history

Anchors: `@ServiceDesk.TriageAgent` · id `2882c1` · 2026-11-08

## A user can upload a PDF or screenshot to a ticket and the agent extracts fields or describes the problem

Anchors: `@ServiceDesk.Attachment` · id `46d995` · 2026-11-08

## Tickets go through triage, assignment and resolution as a workflow with an AI Agent Task and a human approval step

Anchors: `@ServiceDesk.WF_TicketHandling` · id `5eaf60` · 2026-11-08

## Refund approval is a user task for a SupportAgent

Anchors: `@ServiceDesk.WF_TicketHandling` · id `2f7e3b` · 2026-11-08

## The support agent can call the triage agent as a tool (agent-as-tool)

Anchors: `@ServiceDesk.SupportAgent` · id `77b04d` · 2026-11-08
