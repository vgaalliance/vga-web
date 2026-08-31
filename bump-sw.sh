#!/usr/bin/env bash
# Bump the service worker's cache version, and FAIL LOUDLY if it did not move.
#
# This exists because the bumps were `sed s/uba-v44/uba-v45/` for weeks. sed
# does not error when its pattern is absent, so the moment the file's actual
# version drifted from what the command expected, every later bump silently
# matched nothing. sw.js sat at uba-v43 while the shell changed underneath it,
# and every phone kept serving the v43 cache — so a fortnight of fixes were
# deployed and invisible, with nothing anywhere saying so.
set -euo pipefail
cd "$(dirname "$0")/app"
cur=$(grep -oE "uba-v[0-9]+" sw.js | head -1)
[ -n "$cur" ] || { echo "no CACHE_VERSION in sw.js"; exit 1; }
next="uba-v$(( ${cur#uba-v} + 1 ))"
perl -pi -e "s/const CACHE_VERSION = '[^']*';/const CACHE_VERSION = '$next';/" sw.js
got=$(grep -oE "uba-v[0-9]+" sw.js | head -1)
[ "$got" = "$next" ] || { echo "BUMP FAILED: still $got"; exit 1; }
echo "$cur -> $got"
