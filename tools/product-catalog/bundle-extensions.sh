#!/bin/sh
# Bundles the two DuckDB extensions the runtime's SPARQL engine needs (rdf and
# postgres) into resources/sparql/extensions, for servers that cannot reach
# DuckDB's extension repositories. Without them the runtime downloads both on
# first use. The folder is git-ignored: run this in the build that packages the
# app, on the platform it will run on.
#
# DuckDB installs them itself (pip install duckdb, the same engine version as
# the duckdb_jdbc dependency), so the bundle carries the metadata that tells it
# which repository signed each extension: a bare .duckdb_extension file from
# the community repository is refused as unsigned when loaded by path.
#   sh tools/product-catalog/bundle-extensions.sh
set -e
cd "$(dirname "$0")/../.."
python3 - <<'PY'
import duckdb
con = duckdb.connect()
con.sql("SET extension_directory = 'resources/sparql/extensions'")
con.sql("INSTALL rdf FROM community")
con.sql("INSTALL postgres")
print("bundled for", con.execute("PRAGMA platform").fetchone()[0], "in resources/sparql/extensions/" + con.execute("SELECT library_version FROM pragma_version()").fetchone()[0])
PY
