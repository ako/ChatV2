#!/bin/sh
# Apply the agent documents, then set the selected model of any agent that
# lacks one (mxcli cannot write it yet, ako/mxcli#2031).
# Use this instead of running mdlsource/07-agents.mdl on its own.
set -e
cd "$(dirname "$0")/.."
./mxcli exec mdlsource/07-agents.mdl -p ServiceDeskCopilot.mpr
python3 -I scripts/patch-agent-documents.py ServiceDeskCopilot.mpr scripts/agent-document-fields.json
