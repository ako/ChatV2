# Live test of the product-graph MCP server (tools/product-graph-mcp): tool list,
# each curated tool, and the read-only SPARQL tool refusing writes.
# Needs Fuseki (sh tools/fuseki/start.sh) and the server (python3 tools/product-graph-mcp/server.py).
import json, urllib.request
URL = 'http://127.0.0.1:8766/mcp'
def post(body, session=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'}
    if session: h['Mcp-Session-Id'] = session
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode(); sid = r.headers.get('Mcp-Session-Id')
    if raw.lstrip().startswith(('event', 'data')):
        raw = '\n'.join(l[5:].strip() for l in raw.splitlines() if l.startswith('data:'))
    return sid, (json.loads(raw) if raw.strip() else None)
sid, r = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'chatv2-test', 'version': '1'}}})
print('server:', r['result']['serverInfo'])
post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)
_, r = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, sid)
print('tools:', [t['name'] for t in r['result']['tools']])
def call(name, **args):
    _, r = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, sid)
    return r['result']['content'][0]['text']
checks = [
    ('the catalog holds no orders: a SPARQL query for order numbers finds nothing', call('sparql_query', query='SELECT ?o WHERE { ?o shop:orderNumber ?n }'), 'No results'),
    ('nor does a query over every triple', call('sparql_query', query='SELECT ?s ?p ?o WHERE { ?s ?p ?o FILTER(CONTAINS(STR(?s), "SO-1")) }'), 'No results'),
    ('find_product battery', call('find_product', search='battery'), 'BAT-418'),
    ('compatible_parts EB-500 has SSP-31, not SSP-27', call('compatible_parts', sku='EB-500'), 'SSP-31'),
    ('known_issues CHG-4A', call('known_issues', sku='CHG-4A'), 'ISS-CHG-80'),
    ('sparql SELECT works', call('sparql_query', query='SELECT ?sku WHERE { ?p a shop:EBike ; shop:sku ?sku } ORDER BY ?sku'), 'EB-200'),
    ('sparql INSERT refused', call('sparql_query', query='INSERT DATA { shop:x shop:y "z" }'), 'Refused'),
    ('sparql SELECT with SERVICE refused', call('sparql_query', query='SELECT * WHERE { SERVICE <http://example.org/sparql> { ?s ?p ?o } }'), 'Refused'),
]
ok = True
for label, text, expect in checks:
    good = expect in text and not (label.startswith('compatible_parts') and 'SSP-27' in text)
    ok &= good
    print('PASS' if good else 'FAIL', label, '|', text.replace('\n', ' / ')[:200])
print('ALL PASS' if ok else 'SOME FAILED')
