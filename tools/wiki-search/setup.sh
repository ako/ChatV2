#!/bin/sh
# Full-text search for the wiki (mdlsource/06c-wiki.mdl): a read-only role the app
# uses over the External Database Connector, and a GIN index for the search
# expression. Idempotent; run it once per database, after the app has created the
# wiki table:
#   sh tools/wiki-search/setup.sh
# The role's password is generated into .mxcli/wiki-search.password (git-ignored);
# pass it to the app with --constant ServiceDesk.WikiSearchDbPassword=@file:.mxcli/wiki-search.password
set -e
cd "$(dirname "$0")/../.."
DB=${WIKI_DB:-servicedeskcopilot}
PW_FILE=.mxcli/wiki-search.password
if [ ! -s "$PW_FILE" ]; then
  (umask 077; head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24 > "$PW_FILE")
fi
PW=$(cat "$PW_FILE")
psql_run() {
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB"
  else psql -q -v ON_ERROR_STOP=1 -d "$DB"; fi
}
# The index expression must match the one in the WikiSearchDatabase query exactly,
# or Postgres does not use the index.
psql_run <<SQL
do \$\$ begin
  if not exists (select from pg_roles where rolname = 'wiki_search') then create role wiki_search login; end if;
end \$\$;
alter role wiki_search password '$PW';
grant connect on database $DB to wiki_search;
grant usage on schema public to wiki_search;
grant select on "servicedesk\$wikipage" to wiki_search;
create index if not exists wiki_fts_idx on "servicedesk\$wikipage" using gin ((
  setweight(to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(tags, '')), 'A')
  || setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'B')
  || setweight(to_tsvector('english'::regconfig, coalesce(body, '')), 'C')));
SQL
echo "wiki_search role and wiki_fts_idx ready in $DB"
