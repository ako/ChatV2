# Live test of the wiki over MCP (/servicedesk/mcp, app-account headers): the wiki
# tools are listed, a customer can read the wiki but not propose an edit, a support
# agent's proposal becomes a wiki edit waiting for review, the wiki_answer prompt
# carries the index, and search runs as PostgreSQL full-text search (stemming, snippets;
# tools/wiki-search/setup.sh). Needs the app running and a compiled wiki.
import json, sys, urllib.request
URL = 'http://localhost:8080/servicedesk/mcp'
def post(body, session=None, auth=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'}
    if session: h['Mcp-Session-Id'] = session
    if auth: h['Username'], h['Password'] = auth
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode(); sid = r.headers.get('Mcp-Session-Id'); status = r.status
    except urllib.error.HTTPError as e:
        return e.code, None, e.read().decode()[:300]
    if raw.lstrip().startswith('event') or raw.lstrip().startswith('data'):
        raw = '\n'.join(l[5:].strip() for l in raw.splitlines() if l.startswith('data:'))
    return status, sid, raw
def session(auth):
    init = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'chatv2-wiki-test', 'version': '1'}}}
    st, sid, raw = post(init, auth=auth); assert st == 200, (st, raw)
    post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid, auth)
    return sid
def call(sid, auth, name, args):
    st, _, raw = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, sid, auth)
    r = json.loads(raw)['result']; return ' '.join(c.get('text', '') for c in r.get('content', []))
fails = []
def check(what, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + what + ('' if ok else '  -> ' + detail[:300])); ok or fails.append(what)

customer = ('demo_customer', 'DemoCustomer1!'); sid = session(customer)
st, _, raw = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, sid, customer)
names = [t['name'] for t in json.loads(raw)['result']['tools']]
check('wiki tools listed', all(n in names for n in ['wiki_index', 'wiki_search', 'wiki_read', 'wiki_propose_edit']), str(names))
index = call(sid, customer, 'wiki_index', {}); print('  ' + index.splitlines()[0])
check('index lists the returns page', '- returns: Returns' in index, index)
found = call(sid, customer, 'wiki_search', {'Query': 'return e-bike kilometres'})
check('search finds the returns page first', found.splitlines()[1].startswith('- returns:'), found)
check('search says it used full-text search', 'full-text search' in found.splitlines()[0], found)
stem = call(sid, customer, 'wiki_search', {'Query': 'refunding'})
check('full-text search stems words: "refunding" (in no page) finds the refunds page first', len(stem.splitlines()) > 1 and stem.splitlines()[1].startswith('- refunds:'), stem)
check('a hit carries a snippet with the match in bold', '**refund' in stem.lower(), stem)
none = call(sid, customer, 'wiki_search', {'Query': 'xylophone'})
check('a query that matches nothing says so', none.startswith('No wiki page matches'), none)
page = call(sid, customer, 'wiki_read', {'Slug': 'returns'})
check('read returns the page with its links', page.startswith('# Returns') and '14 days' in page and 'Links to:' in page and 'Linked from:' in page, page)
missing = call(sid, customer, 'wiki_read', {'Slug': 'refund'})
check('a near miss suggests pages', 'Did you mean' in missing and 'refunds' in missing, missing)
refused = call(sid, customer, 'wiki_propose_edit', {'Slug': 'test-mcp', 'Title': 'T', 'Summary': 'S', 'Body': 'B', 'Reason': 'R'})
check('a customer cannot propose an edit', refused.startswith('Only support staff'), refused)

agent = ('demo_agent', 'DemoAgent1234!'); sid2 = session(agent)
proposed = call(sid2, agent, 'wiki_propose_edit', {'Slug': 'bike-sizing', 'Title': 'Bike sizing', 'Summary': 'Which frame size fits which body height.', 'Body': 'Frame size follows body height:\n\n| Height | Frame |\n|---|---|\n| 155-170 cm | S |\n| 170-185 cm | M |\n| 185-200 cm | L |\n\nBetween two sizes, take the smaller one for a city bike. Returns of a bike in the wrong size follow [[returns]].', 'Reason': 'Customers ask about sizes before buying; added over MCP.'})
check('a support agent proposes an edit for review', proposed.startswith('Proposed wiki edit') and 'bike-sizing' in proposed, proposed)
bad = call(sid2, agent, 'wiki_propose_edit', {'Slug': 'Bike Sizing', 'Title': 'T', 'Summary': 'S', 'Body': 'B', 'Reason': 'R'})
check('an invalid slug is refused', bad.startswith('Not proposed'), bad)
st, _, raw = post({'jsonrpc': '2.0', 'id': 5, 'method': 'prompts/get', 'params': {'name': 'wiki_answer', 'arguments': {'Question': 'Can I return a used helmet?'}}}, sid, customer)
text = json.dumps(json.loads(raw).get('result'))
check('wiki_answer prompt carries the question and the index', 'used helmet' in text and 'returns: Returns' in text, text)
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
