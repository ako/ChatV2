#!/bin/sh
# Starts the demo's helper servers next to the app, if they are not running:
#   8765  carrier tracking (MCP + REST)      tools/carrier-mcp/server.py
#   9092  the agent bus's Kafka broker       duckgraphlake (also SQL, SPARQL, OData and
#   9495  MCP at :9495/mcp, web UI at :9495)  MCP over every message on the bus)
#         Not in the repository: set DUCKGRAPHLAKE to the binary (default
#         /opt/duckgraphlake/duckgraphlake, from the release archive with its
#         extensions/ folder). Its data folder is .agentbus/ (git-ignored).
# The product graph needs no server: the runtime answers SPARQL itself
# (mdlsource/25-sparql-in-runtime.mdl).
# Logs go to /tmp/servicedesk-<name>.log. Run from the project root.
cd "$(dirname "$0")/.." || exit 1
up() { (echo > "/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
start() { # port name command...
  port=$1; name=$2; shift 2
  if up "$port"; then echo "$name: already running on $port"; return; fi
  setsid nohup "$@" > "/tmp/servicedesk-$name.log" 2>&1 &
  echo "$name: starting on $port"
}
start 8765 carrier python3 tools/carrier-mcp/server.py
DGL="${DUCKGRAPHLAKE:-/opt/duckgraphlake/duckgraphlake}"
if [ -x "$DGL" ]; then
  mkdir -p .agentbus
  start 9092 duckgraphlake "$DGL" .agentbus --pg-port 5433
else
  echo "duckgraphlake: not found at $DGL; the agent bus stays off"
fi
for p in 8765 9092; do
  for i in $(seq 1 60); do up $p && break; sleep 2; done
  up $p && echo "port $p up" || echo "port $p DOWN"
done
