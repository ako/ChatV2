#!/bin/sh
# Creates the read-only database role the SPARQL endpoint attaches with:
# servicedesk_graph, SELECT on exactly the tables the R2RML mappings read and
# nothing else (no System tables, no chat history). Idempotent. Run as a user
# that can `su postgres`, from the project root, after the app has created its
# tables. The password is generated once into .mxcli/graph-reader.password.
set -e
cd "$(dirname "$0")/../.."
DB="${SPARQL_PG_DB:-servicedeskcopilot}"
PW_FILE=.mxcli/graph-reader.password
[ -f "$PW_FILE" ] || (umask 077; head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PW_FILE")
PW=$(cat "$PW_FILE")
TABLES='"servicedesk$product", "servicedesk$supplier", "servicedesk$knownissue", "servicedesk$orderline",
  "servicedesk$product_compatiblewith", "servicedesk$product_component", "servicedesk$order",
  "servicedesk$wikipage", "servicedesk$wikilink", "servicedesk$customer", "servicedesk$ticket"'
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'servicedesk_graph') then
    create role servicedesk_graph login password '$PW';
  else
    alter role servicedesk_graph login password '$PW';
  end if;
end \$\$;
grant connect on database $DB to servicedesk_graph;
grant usage on schema public to servicedesk_graph;
grant select on $TABLES to servicedesk_graph;
SQL
echo "servicedesk_graph: SELECT on the mapped tables of $DB"
