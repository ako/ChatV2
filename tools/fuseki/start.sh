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
# Two read-only datasets from the same file:
#   /products  the whole graph, orders included: only the app queries it,
#              server-side, after checking who is asking
#   /catalog   the same graph without orders: what the product-graph MCP
#              server (and so the AI) can reach, whatever it asks
mkdir -p "$FUSEKI_BASE"
CATALOG="$FUSEKI_BASE/catalog.ttl"
sed '/^# ---- Orders/,$d' "$DATA" > "$CATALOG"   # the orders are the file's last section
CONFIG="$FUSEKI_BASE/servicedesk-config.ttl"
cat > "$CONFIG" <<CFG
@prefix fuseki: <http://jena.apache.org/fuseki#> .
@prefix rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix ja:     <http://jena.hpl.hp.com/2005/11/Assembler#> .
[] rdf:type fuseki:Server .
<#products> rdf:type fuseki:Service ; fuseki:name "products" ;
    fuseki:endpoint [ fuseki:operation fuseki:query ; fuseki:name "sparql" ] ;
    fuseki:endpoint [ fuseki:operation fuseki:query ] ;
    fuseki:dataset <#dsProducts> .
<#dsProducts> rdf:type ja:MemoryDataset ; ja:data <file://$DATA> .
<#catalog> rdf:type fuseki:Service ; fuseki:name "catalog" ;
    fuseki:endpoint [ fuseki:operation fuseki:query ; fuseki:name "sparql" ] ;
    fuseki:endpoint [ fuseki:operation fuseki:query ] ;
    fuseki:dataset <#dsCatalog> .
<#dsCatalog> rdf:type ja:MemoryDataset ; ja:data <file://$CATALOG> .
CFG
nohup java -jar "$FUSEKI_JAR" --localhost --port=3030 --config="$CONFIG" \
  > "$(dirname "$FUSEKI_JAR")/fuseki.log" 2>&1 &
for i in $(seq 1 40); do
  if curl -fs -o /dev/null "http://localhost:3030/products/sparql?query=ASK%7B%7D" && curl -fs -o /dev/null "http://localhost:3030/catalog/sparql?query=ASK%7B%7D"; then
    echo "Fuseki ready: http://localhost:3030/products/sparql (full) and http://localhost:3030/catalog/sparql (no orders)"; exit 0
  fi
  sleep 2
done
echo "Fuseki did not start; see $(dirname "$FUSEKI_JAR")/fuseki.log" >&2; exit 1
