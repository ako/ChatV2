# Live test of the OAuth-protected MCP server: discovery, authorization code + PKCE login
# against the local Keycloak (tools/keycloak), scoped tool calls, and refused tokens.
# Needs the app (README: Run it) and Keycloak (tools/keycloak/start.sh) running.
import json, urllib.request, urllib.parse, urllib.error, base64, hashlib, secrets, re, http.cookiejar
APP = 'http://localhost:8080'
MCP = APP + '/servicedesk-oauth/mcp'

def req(url, data=None, headers=None, method=None, opener=None):
    r = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        resp = (opener or urllib.request).open(r, timeout=30) if opener else urllib.request.urlopen(r, timeout=30)
        return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

def mcp(body, token=None, sid=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
    if token: h['Authorization'] = 'Bearer ' + token
    if sid: h['Mcp-Session-Id'] = sid
    st, hd, raw = req(MCP, json.dumps(body).encode(), h, 'POST')
    if 'data:' in raw: raw = '\n'.join(l[5:].strip() for l in raw.splitlines() if l.startswith('data:'))
    return st, hd, raw

INIT = {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'oauth-test', 'version': '1'}}}

# 1. discovery
st, hd, raw = mcp(INIT)
www = {k.lower(): v for k, v in hd.items()}.get('www-authenticate')
print('1. no token ->', st, '| WWW-Authenticate:', www)
m = re.search(r'resource_metadata="([^"]+)"', www or '')
prm_url = m.group(1) if m else APP + '/.well-known/oauth-protected-resource/servicedesk-oauth/mcp'
st, _, raw = req(prm_url)
print('   protected resource metadata', st, raw[:300])
prm = json.loads(raw) if st == 200 else {}
issuer = (prm.get('authorization_servers') or [None])[0]
st, _, raw = req(issuer.rstrip('/') + '/.well-known/openid-configuration')
asmeta = json.loads(raw)
print('   authorization server:', asmeta['issuer'], '| PKCE:', asmeta.get('code_challenge_methods_supported'))

# 2. authorization code + PKCE, with the login form submitted like a browser
def login_with_pkce(user, pw):
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    redirect = 'http://127.0.0.1:33418/callback'
    q = urllib.parse.urlencode({'response_type': 'code', 'client_id': 'mcp-client', 'redirect_uri': redirect, 'scope': 'openid ' + ' '.join(prm.get('scopes_supported') or ['mcp:tools']), 'code_challenge': challenge, 'code_challenge_method': 'S256', 'state': 'x', 'resource': MCP})
    class LocalhostPolicy(http.cookiejar.DefaultCookiePolicy):
        # Browsers treat http://localhost as a secure context and send Secure cookies; urllib does not.
        def return_ok_secure(self, cookie, request): return True
        def set_ok(self, cookie, request): return True
    jar = http.cookiejar.CookieJar(LocalhostPolicy())
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)
    st, _, html = req(asmeta['authorization_endpoint'] + '?' + q, opener=opener)
    action = re.search(r'action="([^"]+)"', html).group(1).replace('&amp;', '&')
    st, hd, _ = req(action, urllib.parse.urlencode({'username': user, 'password': pw}).encode(), {'Content-Type': 'application/x-www-form-urlencoded'}, 'POST', opener)
    loc = {k.lower(): v for k, v in hd.items()}['location']
    code = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)['code'][0]
    st, _, raw = req(asmeta['token_endpoint'], urllib.parse.urlencode({'grant_type': 'authorization_code', 'client_id': 'mcp-client', 'code': code, 'redirect_uri': redirect, 'code_verifier': verifier}).encode(), {'Content-Type': 'application/x-www-form-urlencoded'}, 'POST')
    return json.loads(raw)['access_token']

def session(token):
    st, hd, raw = mcp(INIT, token)
    sid = {k.lower(): v for k, v in hd.items()}.get('mcp-session-id')
    if st != 200: return st, None
    mcp({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, token, sid)
    return st, sid

def call(token, sid, name, args):
    st, _, raw = mcp({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, token, sid)
    return json.loads(raw)['result']['content'][0]['text']

for user, pw in [('demo_customer', 'DemoCustomer1!'), ('demo_agent', 'DemoAgent1234!')]:
    tok = login_with_pkce(user, pw)
    st, sid = session(tok)
    print(f'2. {user}: PKCE login -> token, initialize {st}')
    print('   SO-10002 ->', call(tok, sid, 'get_order_status', {'OrderNumber': 'SO-10002'})[:90])
    print('   SO-10004 ->', call(tok, sid, 'get_order_status', {'OrderNumber': 'SO-10004'})[:90])

# 3. refusals
def password_token(client, scope=None):
    d = {'grant_type': 'password', 'client_id': client, 'username': 'demo_customer', 'password': 'DemoCustomer1!'}
    if scope: d['scope'] = scope
    return json.loads(req(asmeta['token_endpoint'], urllib.parse.urlencode(d).encode(), {'Content-Type': 'application/x-www-form-urlencoded'}, 'POST')[2])['access_token']
print('3. garbage token ->', mcp(INIT, 'not-a-token')[0])
print('   other-app token (no audience) ->', mcp(INIT, password_token('other-app'))[0])
print('   mcp-client token without mcp:tools ->', mcp(INIT, password_token('mcp-client'))[0])
print('   mcp-client token with mcp:tools ->', mcp(INIT, password_token('mcp-client', 'openid mcp:tools'))[0])
