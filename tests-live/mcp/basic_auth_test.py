# Live test of the MCP server with app-account headers (Username/Password): 401s,
# tools, customer scoping and the ticket_reply prompt. Needs the app running.
import json, sys, urllib.request
URL = 'http://localhost:8080/servicedesk/mcp'
def post(body, session=None, auth=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26'}
    if session: h['Mcp-Session-Id'] = session
    if auth: h['Username'], h['Password'] = auth
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode(); sid = r.headers.get('Mcp-Session-Id')
            status = r.status
    except urllib.error.HTTPError as e:
        return e.code, None, e.read().decode()[:300]
    if raw.lstrip().startswith('event') or raw.lstrip().startswith('data'):
        raw = '\n'.join(l[5:].strip() for l in raw.splitlines() if l.startswith('data:'))
    return status, sid, raw
init = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'chatv2-test', 'version': '1'}}}
print('no credentials:', post(init)[0], post(init)[2][:120])
print('wrong password:', post(init, auth=('demo_customer', 'nope'))[0])
auth = ('demo_customer', 'DemoCustomer1!')
st, sid, raw = post(init, auth=auth); print('initialize:', st, 'session' if sid else 'no-session', json.loads(raw)['result']['serverInfo'])
post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid, auth)
st, _, raw = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'}, sid, auth)
print('tools:', [(t['name'], t.get('title')) for t in json.loads(raw)['result']['tools']])
for n, args in [('get_order_status', {'OrderNumber': 'SO-10002'}), ('get_order_status', {'OrderNumber': 'SO-10004'}), ('search_tickets', {'SearchText': 'Charged'})]:
    st, _, raw = post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': n, 'arguments': args}}, sid, auth)
    r = json.loads(raw); print(n, args, '->', json.dumps(r.get('result', r.get('error')))[:260])
st, _, raw = post({'jsonrpc': '2.0', 'id': 4, 'method': 'prompts/list'}, sid, auth); print('prompts:', [p['name'] for p in json.loads(raw)['result']['prompts']])
st, _, raw = post({'jsonrpc': '2.0', 'id': 5, 'method': 'prompts/get', 'params': {'name': 'ticket_reply', 'arguments': {'TicketNumber': '1001'}}}, sid, auth)
print('prompt 1001 ->', json.dumps(json.loads(raw).get('result'))[:300])
