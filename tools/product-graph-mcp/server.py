"""The bike shop's product knowledge graph, published to agents over MCP.

The graph (tools/fuseki/products.ttl, served read-only by Apache Jena Fuseki)
is the system of record for product data: catalog, parts and compatibility,
suppliers, known issues and recalls, and what each order contains. The
ServiceDesk app's SupportAgent consumes this server (consumed MCP service
ServiceDesk.ProductGraph), so its answers are grounded in the graph.

This server is the catalog of what the agent may see: a few curated tools, plus
one read-only SPARQL tool that refuses anything but SELECT and ASK.

Run:  python3 tools/product-graph-mcp/server.py      (http://127.0.0.1:8766/mcp)
Needs Fuseki (sh tools/fuseki/start.sh) and the Python MCP SDK 2.x.
"""
import json
import os
import re
import urllib.parse
import urllib.request

from mcp.server.mcpserver import MCPServer

ENDPOINT = os.environ.get("PRODUCT_GRAPH_SPARQL", "http://localhost:3030/products/sparql")
MAX_ROWS = 50
PREFIXES = """PREFIX shop: <https://example.org/bikeshop#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
"""
SCHEMA = """Prefix shop: <https://example.org/bikeshop#>, labels in rdfs:label.
Classes: shop:Product with subclasses shop:Bike (shop:EBike), shop:Part, shop:Accessory; shop:Supplier;
shop:KnownIssue (subclass shop:Recall); shop:Order; shop:OrderLine.
Product properties: shop:sku, rdfs:label, shop:price (EUR), shop:warrantyYears, shop:suppliedBy (Supplier),
shop:hasComponent (parts a bike ships with), shop:compatibleWith (what a part or accessory fits on or works with),
bikes also shop:wheelSize, shop:seatPostDiameter, shop:brakes, shop:rackMount.
Known issues: shop:issueId, rdfs:label, shop:affects (Product), shop:affectsBatch (recalls only), shop:announced, shop:advice.
Orders: shop:orderNumber (e.g. "SO-10003"), shop:hasLine (OrderLine: shop:product, shop:quantity, shop:unitPrice, shop:batch)."""

server = MCPServer(
    name="ProductGraph",
    version="1.0.0",
    instructions="The bike shop's product knowledge graph: products, parts and compatibility, suppliers, known issues and recalls, and what each order contains. " + SCHEMA,
)


def _select(query: str) -> list[dict]:
    data = urllib.parse.urlencode({"query": PREFIXES + query}).encode()
    req = urllib.request.Request(ENDPOINT, data=data, headers={"Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.load(resp)
    if "boolean" in result:
        return [{"result": str(result["boolean"]).lower()}]
    return [{k: v["value"] for k, v in row.items()} for row in result["results"]["bindings"]]


def _sku(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9-]", "", text).upper()


def _issues_for(sku: str, batch: str | None = None) -> list[str]:
    rows = _select(f"""SELECT ?id ?label ?batch ?advice ?via WHERE {{
        ?p shop:sku "{sku}" .
        {{ ?i shop:affects ?p . BIND("" AS ?via) }} UNION {{ ?p shop:hasComponent ?c . ?i shop:affects ?c . ?c shop:sku ?via }}
        ?i shop:issueId ?id ; rdfs:label ?label ; shop:advice ?advice .
        OPTIONAL {{ ?i shop:affectsBatch ?batch }} }}""")
    out = []
    for r in rows:
        kind = "RECALL" if r.get("batch") else "Known issue"
        where = f" (via component {r['via']})" if r["via"] else ""
        scope = ""
        if r.get("batch"):
            if batch:
                scope = f" Affects batch {r['batch']} only; this unit is batch {batch}: " + ("AFFECTED." if batch == r["batch"] else "not affected.")
            else:
                scope = f" Affects batch {r['batch']} only."
        out.append(f"{kind} {r['id']}{where}: {r['label']}.{scope} Advice: {r['advice']}")
    return out


@server.tool(name="find_product", description="Finds products by SKU or by words in the name (e.g. 'EB-200', 'battery', 'charger'). Returns SKU, name, type, price, warranty, supplier and, for bikes, the components it ships with.")
def find_product(search: str) -> str:
    text = search.replace('"', "").strip()
    rows = _select(f"""SELECT ?sku ?name ?type ?price ?warranty ?supplier (GROUP_CONCAT(DISTINCT ?csku; separator=", ") AS ?components) WHERE {{
        ?p shop:sku ?sku ; rdfs:label ?name ; a ?t ; shop:price ?price ; shop:warrantyYears ?warranty ; shop:suppliedBy ?s .
        ?t rdfs:label ?type . ?s rdfs:label ?supplier .
        OPTIONAL {{ ?p shop:hasComponent ?c . ?c shop:sku ?csku }}
        FILTER(CONTAINS(LCASE(?sku), LCASE("{text}")) || CONTAINS(LCASE(?name), LCASE("{text}")))
    }} GROUP BY ?sku ?name ?type ?price ?warranty ?supplier ORDER BY ?sku LIMIT 20""")
    if not rows:
        return f"No product matches '{search}'."
    return "\n".join(
        f"{r['sku']}: {r['name']} ({r['type']}), EUR {float(r['price']):.2f}, warranty {r['warranty']} years, supplier {r['supplier']}"
        + (f", ships with {r['components']}" if r.get("components") else "")
        for r in rows)


@server.tool(name="compatible_parts", description="For a bike: the parts and accessories that fit it. For a part or accessory: what it fits on or works with. Input: a SKU such as EB-200 or CHG-4A.")
def compatible_parts(sku: str) -> str:
    s = _sku(sku)
    fits_it = _select(f"""SELECT ?sku ?name ?price WHERE {{ ?b shop:sku "{s}" . ?p shop:compatibleWith ?b ; shop:sku ?sku ; rdfs:label ?name ; shop:price ?price }} ORDER BY ?sku""")
    it_fits = _select(f"""SELECT ?sku ?name WHERE {{ ?p shop:sku "{s}" ; shop:compatibleWith ?t . ?t shop:sku ?sku ; rdfs:label ?name }} ORDER BY ?sku""")
    if not fits_it and not it_fits:
        return f"No compatibility data for {s}. Check the SKU with find_product."
    lines = []
    if fits_it:
        lines.append(f"Fits {s}: " + "; ".join(f"{r['sku']} {r['name']} (EUR {float(r['price']):.2f})" for r in fits_it))
    if it_fits:
        lines.append(f"{s} fits on / works with: " + "; ".join(f"{r['sku']} {r['name']}" for r in it_fits))
    return "\n".join(lines)


@server.tool(name="known_issues", description="Known issues and recalls for a product, including those on the components a bike ships with. A recall only applies to the production batch it names. Input: a SKU.")
def known_issues(sku: str) -> str:
    s = _sku(sku)
    issues = _issues_for(s)
    return "\n".join(issues) if issues else f"No known issues or recalls for {s}."


@server.tool(name="order_products", description="What an order contains according to the product graph: per line the SKU, name, quantity, unit price and production batch, plus any known issue or recall that applies to that exact unit. Input: an order number such as SO-10003.")
def order_products(order_number: str) -> str:
    n = order_number.strip().upper().replace('"', "")
    rows = _select(f"""SELECT ?sku ?name ?qty ?price ?batch WHERE {{
        ?o shop:orderNumber "{n}" ; shop:hasLine ?l . ?l shop:product ?p ; shop:quantity ?qty ; shop:unitPrice ?price .
        ?p shop:sku ?sku ; rdfs:label ?name . OPTIONAL {{ ?l shop:batch ?batch }} }} ORDER BY ?sku""")
    if not rows:
        return f"Order {n} is not in the product graph."
    out = [f"Order {n}:"]
    for r in rows:
        batch = r.get("batch")
        out.append(f"- {r['qty']} x {r['sku']} {r['name']} at EUR {float(r['price']):.2f}" + (f", batch {batch}" if batch else ""))
        out += ["  " + i for i in _issues_for(r["sku"], batch)]
    return "\n".join(out)


WRITE = re.compile(r"\b(INSERT|DELETE|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY|WITH|SERVICE)\b", re.I)


@server.tool(name="sparql_query", description="Runs a read-only SPARQL SELECT or ASK query on the product graph, for questions the other tools do not cover. Prefixes shop:, rdfs: and xsd: are predeclared. At most 50 rows. Schema: " + SCHEMA)
def sparql_query(query: str) -> str:
    body = re.sub(r"(?im)^\s*PREFIX\s+\S+\s*<[^>]*>\s*", "", query).strip()
    if not re.match(r"(?is)^(SELECT|ASK)\b", body) or WRITE.search(body):
        return "Refused: only read-only SELECT or ASK queries are allowed."
    if body.upper().startswith("SELECT") and not re.search(r"(?i)\bLIMIT\s+\d+", body):
        body += f" LIMIT {MAX_ROWS}"
    try:
        rows = _select(body)[:MAX_ROWS]
    except Exception as e:  # malformed query: tell the model so it can fix it
        return f"Query failed: {e}"
    if not rows:
        return "No results."
    cols = list(rows[0].keys())
    return "\n".join([" | ".join(cols)] + [" | ".join(r.get(c, "") for c in cols) for r in rows])


if __name__ == "__main__":
    server.run("streamable-http", host="127.0.0.1", port=8766)
