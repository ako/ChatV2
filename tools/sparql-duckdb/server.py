"""A read-only SPARQL endpoint over the app database, with DuckDB.

Replaces Apache Jena Fuseki: there is no triple store and no copy of the data.
DuckDB attaches the app's PostgreSQL database read-only (as servicedesk_graph,
see setup-reader.sh), views.sql shapes its tables, and the rdf extension
translates each SPARQL query into SQL through an R2RML mapping (mappings/).
So a query always sees the app's current data, and SPARQL reaches every table
a mapping covers.

Three datasets, at the paths Fuseki used, each a set of mappings:
  /catalog/sparql   products, suppliers, known issues, the wiki   (the MCP server, so the AI)
  /products/sparql  the catalog plus orders and their lines       (the app, server-side)
  /app/sparql       all of that plus customers and tickets        (staff tooling)

Speaks the SPARQL 1.1 protocol for SELECT and ASK: GET ?query=, POST form, or
POST application/sparql-query; answers application/sparql-results+json.
Development use: binds to 127.0.0.1, no authentication.

Run:  python3 tools/sparql-duckdb/server.py        (pip install duckdb)
Env:  SPARQL_PORT (3030), SPARQL_PG_DSN (default: servicedesk_graph on the local
      servicedeskcopilot database, password from .mxcli/graph-reader.password)
"""
import json
import os
import re
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import duckdb

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = int(os.environ.get("SPARQL_PORT", "3030"))
DATASETS = {
    "catalog": ["catalog"],
    "products": ["catalog", "orders"],
    "app": ["catalog", "orders", "app"],
}
IRI = re.compile(r"^(https?|urn):\S+$")


def default_dsn() -> str:
    with open(os.path.join(ROOT, ".mxcli", "graph-reader.password")) as fh:
        password = fh.read().strip()
    return f"host=127.0.0.1 port=5432 dbname=servicedeskcopilot user=servicedesk_graph password={password}"


def build_mappings() -> dict:
    """One mapping file per dataset: the rdf extension takes a single file, Turtle concatenates."""
    out = {}
    folder = tempfile.mkdtemp(prefix="sparql-duckdb-")
    for name, parts in DATASETS.items():
        path = os.path.join(folder, f"{name}.r2rml.ttl")
        with open(path, "w") as fh:
            for part in parts:
                with open(os.path.join(HERE, "mappings", f"{part}.r2rml.ttl")) as src:
                    fh.write(src.read() + "\n")
        out[name] = path
    return out


class Graph:
    def __init__(self):
        self.lock = threading.Lock()
        self.mappings = build_mappings()
        self.con = None
        self.connect()

    def connect(self):
        con = duckdb.connect()
        con.sql("INSTALL rdf FROM community; LOAD rdf; INSTALL postgres; LOAD postgres")
        dsn = os.environ.get("SPARQL_PG_DSN") or default_dsn()
        con.execute("ATTACH ? AS app (TYPE postgres, READ_ONLY)", [dsn])
        with open(os.path.join(HERE, "views.sql")) as fh:
            con.sql(fh.read().replace("{VOCAB_DIR}", HERE))
        self.con = con

    def query(self, dataset: str, sparql: str):
        try:
            return self._run(dataset, sparql)
        except duckdb.IOException:
            # The database went away (the app restarted it): attach again, once.
            with self.lock:
                self.connect()
            return self._run(dataset, sparql)

    def _run(self, dataset: str, sparql: str):
        cur = self.con.cursor()
        try:
            rel = cur.execute("SELECT * FROM execute_sparql(?, ?)", [sparql, self.mappings[dataset]])
            cols = [d[0] for d in rel.description]
            return cols, rel.fetchall()
        finally:
            cur.close()


def is_ask(sparql: str) -> bool:
    body = re.sub(r"(?im)^\s*(PREFIX\s+\S+\s*<[^>]*>|BASE\s+<[^>]*>)\s*", "", sparql)
    body = re.sub(r"(?m)#.*$", "", body).strip()
    return body.upper().startswith("ASK")


def to_results(sparql: str, cols: list, rows: list) -> dict:
    """execute_sparql names a variable's column v_<var>, and adds d_<var> with its
    term kind ('I' for an IRI) where the mapping alone does not decide it."""
    if is_ask(sparql):
        return {"head": {}, "boolean": bool(rows and rows[0][0])}
    names = [c[2:] for c in cols if c.startswith("v_")]
    idx = {c: i for i, c in enumerate(cols)}
    bindings = []
    for row in rows:
        b = {}
        for n in names:
            v = row[idx["v_" + n]]
            if v is None:
                continue
            kind = row[idx["d_" + n]] if "d_" + n in idx else None
            text = v if isinstance(v, str) else str(v).lower() if isinstance(v, bool) else str(v)
            if kind == "I" or (kind is None and IRI.match(text)):
                b[n] = {"type": "uri", "value": text}
            elif kind == "B":
                b[n] = {"type": "bnode", "value": text}
            else:
                b[n] = {"type": "literal", "value": text}
        bindings.append(b)
    return {"head": {"vars": names}, "results": {"bindings": bindings}}


GRAPH = None


class Handler(BaseHTTPRequestHandler):
    def _dataset(self):
        m = re.match(r"^/([a-z]+)(/sparql|/query|/)?$", urllib.parse.urlparse(self.path).path)
        return m.group(1) if m and m.group(1) in DATASETS else None

    def _send(self, status: int, body: bytes, ctype: str):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _answer(self, sparql):
        dataset = self._dataset()
        if dataset is None:
            return self._send(404, b"Unknown dataset: use /catalog, /products or /app.\n", "text/plain")
        if not sparql:
            return self._send(400, b"No query.\n", "text/plain")
        try:
            cols, rows = GRAPH.query(dataset, sparql)
        except duckdb.Error as e:
            return self._send(400, f"Query failed: {e}\n".encode(), "text/plain; charset=utf-8")
        body = json.dumps(to_results(sparql, cols, rows)).encode()
        self._send(200, body, "application/sparql-results+json; charset=utf-8")

    def do_GET(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        self._answer((qs.get("query") or [""])[0])

    def _body(self) -> str:
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            # The Mendix runtime's HTTP client streams the body: read it chunk by chunk.
            data = b""
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    self.rfile.readline()
                    break
                data += self.rfile.read(size)
                self.rfile.readline()
            return data.decode("utf-8")
        return self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode("utf-8")

    def do_POST(self):
        raw = self._body()
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        if ctype == "application/x-www-form-urlencoded":
            sparql = (urllib.parse.parse_qs(raw).get("query") or [""])[0]
        else:
            sparql = raw
        self._answer(sparql)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    GRAPH = Graph()
    print(f"SPARQL over the app database: http://127.0.0.1:{PORT}/{{catalog,products,app}}/sparql", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
