#!/bin/sh
# Resets the app state a take of demo/servicedesk-copilot.json depends on, before
# rec_live.py runs. The setup's "Check parcels now" posts the SO-10002 delay notice
# only once per carrier scan (ChatNotice.NoticeKey), so the row a previous take or
# the 15-minute scheduled sync left must go; and a trial licence allows only a few
# sessions, so stale ones from earlier runs are cleared too.
# Local PostgreSQL of `mxcli run --local`; the password is the dev default.
export PGPASSWORD="${PGPASSWORD:-mendix}"
psql -h 127.0.0.1 -U mendix -d servicedeskcopilot -v ON_ERROR_STOP=1 -c 'delete from "servicedesk$chatnotice"' -c 'delete from "system$session"'
