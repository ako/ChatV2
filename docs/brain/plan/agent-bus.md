# Slice: agent-bus

<!-- mxcli-brain -->

Requirements for this slice. Anchors point FORWARD, at what the slice
will build — an anchor that does not resolve yet means not built, not
stale. `mxcli brain plan` counts them against the model.

## Agents ask each other over Kafka (Business Events + duckgraphlake) as A2A-shaped tasks; the app both publishes and consumes AgentMessage via two services and one ChannelName topic with a blank EventBrokerSpace

Anchors: `@ServiceDesk.AgentTask` · id `6bc700` · 2026-11-20
