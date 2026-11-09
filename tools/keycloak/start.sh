#!/bin/sh
# Start a local Keycloak with the servicedesk realm, as the OAuth 2.0 issuer for the
# app's OAuth-protected MCP server (/servicedesk-oauth/mcp). Development use only:
# start-dev, plain HTTP, an in-memory-style H2 store, and the demo users and the
# introspection client secret from servicedesk-realm.json.
#   KEYCLOAK_HOME  where Keycloak is unpacked (default ~/keycloak/keycloak-$KEYCLOAK_VERSION;
#                  downloaded from GitHub when missing)
# Keycloak needs Java 21+. Admin console: http://localhost:8280/admin (admin/admin).
set -e
KEYCLOAK_VERSION="${KEYCLOAK_VERSION:-26.4.2}"
KEYCLOAK_HOME="${KEYCLOAK_HOME:-$HOME/keycloak/keycloak-$KEYCLOAK_VERSION}"
REALM="$(cd "$(dirname "$0")" && pwd)/servicedesk-realm.json"
if [ ! -x "$KEYCLOAK_HOME/bin/kc.sh" ]; then
  mkdir -p "$(dirname "$KEYCLOAK_HOME")"
  curl -fsSL -o /tmp/keycloak.zip "https://github.com/keycloak/keycloak/releases/download/$KEYCLOAK_VERSION/keycloak-$KEYCLOAK_VERSION.zip"
  unzip -q -o /tmp/keycloak.zip -d "$(dirname "$KEYCLOAK_HOME")"
fi
mkdir -p "$KEYCLOAK_HOME/data/import"
rm -rf "$KEYCLOAK_HOME/data/h2"            # re-import the realm file on every start
cp "$REALM" "$KEYCLOAK_HOME/data/import/"
KC_BOOTSTRAP_ADMIN_USERNAME=admin KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  nohup "$KEYCLOAK_HOME/bin/kc.sh" start-dev --http-port=8280 --http-management-port=9280 --import-realm \
  > "$(dirname "$KEYCLOAK_HOME")/keycloak.log" 2>&1 &
for i in $(seq 1 60); do
  if curl -fs -o /dev/null http://localhost:8280/realms/servicedesk/.well-known/openid-configuration; then
    echo "Keycloak ready: http://localhost:8280/realms/servicedesk"; exit 0
  fi
  sleep 3
done
echo "Keycloak did not start; see $(dirname "$KEYCLOAK_HOME")/keycloak.log" >&2; exit 1
