#!/bin/sh
# Apply the agent documents, then fill in the fields mxcli does not write yet
# (selected model, tool microflow references and approval, streaming).
# Use this instead of running mdlsource/06-agents.mdl on its own.
set -e
cd "$(dirname "$0")/.."
./mxcli exec mdlsource/06-agents.mdl -p ServiceDeskCopilot.mpr
python3 -I scripts/patch-agent-documents.py ServiceDeskCopilot.mpr scripts/agent-document-fields.json
