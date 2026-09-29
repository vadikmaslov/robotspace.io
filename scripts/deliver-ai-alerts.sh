#!/usr/bin/env bash
set -euo pipefail
umask 077
export PATH=/opt/node-v24.18.0/bin:$PATH
set -a
. /opt/robotspace/shared/.env.production
set +a
exec node /opt/robotspace/current/scripts/deliver-ai-alerts.mjs
