# Live test of the product catalog tools on the app's own MCP server
# (/servicedesk/mcp, app-account headers). The tools run SPARQL inside the
# runtime (mdlsource/25-sparql-in-runtime.mdl) on the order-free catalog
# dataset. Needs the app running.
import json, urllib.request
URL = 'http://localhost:8080/servicedesk/mcp'
AUTH = ('demo_customer', 'DemoCustomer1!')
def post(body, session=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26',
         'Username': AUTH[0], 'Password': AUTH[1]}
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
names = [t['name'] for t in r['result']['tools']]
print('product tools:', [n for n in names if n in ('find_product', 'compatible_parts', 'known_issues', 'product_outline', 'sparql_query')])
def call(name, **args):
    _, r = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, sid)
    return ' '.join(c.get('text', '') for c in r['result']['content'])
outline = call('product_outline', Sku='EB-200')
checks = [
    ('the catalog holds no orders: a SPARQL query for order numbers finds nothing', call('sparql_query', Query='SELECT ?o WHERE { ?o shop:orderNumber ?n }'), 'No results'),
    ('nor does a query over every triple', call('sparql_query', Query='SELECT ?s ?p ?o WHERE { ?s ?p ?o FILTER(CONTAINS(STR(?s), "SO-1") || CONTAINS(STR(?o), "SO-1")) }'), 'No results'),
    ('find_product battery', call('find_product', Search='battery'), 'BAT-418'),
    ('compatible_parts EB-500 has SSP-31, not SSP-27', call('compatible_parts', Sku='EB-500'), 'SSP-31'),
    ('known_issues CHG-4A', call('known_issues', Sku='CHG-4A'), 'ISS-CHG-80'),
    ('known_issues EB-200 reaches the battery recall through its component', call('known_issues', Sku='EB-200'), 'RECALL REC-2026-07 (via component BAT-418)'),
    ('product_outline EB-200 is a valid card', 'BAT-418' if json.loads(outline)['type'] == 'product' else outline, 'BAT-418'),
    ('sparql SELECT works', call('sparql_query', Query='SELECT ?sku WHERE { ?p a shop:EBike ; shop:sku ?sku } ORDER BY ?sku'), 'EB-200'),
    ('sparql reaches the wiki', call('sparql_query', Query='SELECT ?t WHERE { ?w a shop:WikiPage ; rdfs:label ?t } ORDER BY ?t'), 'Returns'),
    ('sparql INSERT refused', call('sparql_query', Query='INSERT DATA { shop:x shop:y "z" }'), 'Refused'),
    ('sparql SELECT with SERVICE refused', call('sparql_query', Query='SELECT * WHERE { SERVICE <http://example.org/sparql> { ?s ?p ?o } }'), 'Refused'),
    ('a malformed query is explained, not an error', call('sparql_query', Query='SELECT ?x WHERE { ?x shop:sku }'), 'Query failed'),
]
ok = True
for label, text, expect in checks:
    good = expect in text and not (label.startswith('compatible_parts') and 'SSP-27' in text)
    ok &= good
    print('PASS' if good else 'FAIL', label, '|', text.replace('\n', ' / ')[:200])
print('ALL PASS' if ok else 'SOME FAILED')
