#!/bin/sh
# Starts the demo's helper servers next to the app, if they are not running:
#   8765  carrier tracking (MCP + REST)      tools/carrier-mcp/server.py
#   3030  SPARQL over the app database      tools/sparql-duckdb/server.py
#         (after setup-reader.sh: the read-only role it attaches with; needs the app's tables)
#   8766  product graph MCP server           tools/product-graph-mcp/server.py
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
up 3030 || sh tools/sparql-duckdb/setup-reader.sh
start 3030 sparql python3 tools/sparql-duckdb/server.py
start 8766 product-graph python3 tools/product-graph-mcp/server.py
for i in $(seq 1 60); do up 8765 && up 3030 && up 8766 && break; sleep 2; done
for p in 8765 3030 8766; do up "$p" && echo "port $p up" || echo "port $p DOWN"; done
