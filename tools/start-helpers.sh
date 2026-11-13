#!/bin/sh
# Starts the demo's helper server next to the app, if it is not running:
#   8765  carrier tracking (MCP + REST)      tools/carrier-mcp/server.py
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
for i in $(seq 1 60); do up 8765 && break; sleep 2; done
up 8765 && echo "port 8765 up" || echo "port 8765 DOWN"
