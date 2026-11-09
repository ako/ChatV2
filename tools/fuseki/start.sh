#!/bin/sh
# Start Apache Jena Fuseki with the bike shop's product knowledge graph
# (products.ttl), read-only, at http://localhost:3030/products/sparql.
# The product-graph MCP server (tools/product-graph-mcp) queries it; the app
# never talks to it directly. Development use only: in-memory, no auth.
#   FUSEKI_JAR  the server jar (default ~/fuseki/jena-fuseki-server-$FUSEKI_VERSION.jar;
#               downloaded from Maven Central when missing)
# Fuseki 6 needs Java 21+.
set -e
FUSEKI_VERSION="${FUSEKI_VERSION:-6.2.0}"
FUSEKI_JAR="${FUSEKI_JAR:-$HOME/fuseki/jena-fuseki-server-$FUSEKI_VERSION.jar}"
DATA="$(cd "$(dirname "$0")" && pwd)/products.ttl"
if [ ! -f "$FUSEKI_JAR" ]; then
  mkdir -p "$(dirname "$FUSEKI_JAR")"
  curl -fsSL -o "$FUSEKI_JAR" "https://repo1.maven.org/maven2/org/apache/jena/jena-fuseki-server/$FUSEKI_VERSION/jena-fuseki-server-$FUSEKI_VERSION.jar"
fi
# Fuseki writes its run directory (config, logs) to FUSEKI_BASE, else the current directory.
export FUSEKI_BASE="${FUSEKI_BASE:-$(dirname "$FUSEKI_JAR")/run}"
# --file serves the data read-only (no --update): the graph is a system of record, not a scratchpad.
nohup java -jar "$FUSEKI_JAR" --localhost --port=3030 --file="$DATA" /products \
  > "$(dirname "$FUSEKI_JAR")/fuseki.log" 2>&1 &
for i in $(seq 1 40); do
  if curl -fs -o /dev/null "http://localhost:3030/products/sparql?query=ASK%7B%7D"; then
    echo "Fuseki ready: http://localhost:3030/products/sparql"; exit 0
  fi
  sleep 2
done
echo "Fuseki did not start; see $(dirname "$FUSEKI_JAR")/fuseki.log" >&2; exit 1
