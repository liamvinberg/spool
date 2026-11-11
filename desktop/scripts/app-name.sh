#!/bin/bash
set -euo pipefail

# The app a version builds: Spool, or Spool Beta for a version with `-beta.N`
# (spool#282). Every file a build names is named after it: `Spool Beta.app`,
# `Spool-Beta-0.55.1-beta.12.dmg`.
#
#   ./scripts/app-name.sh 0.55.1-beta.12   prints Spool Beta

case "${1:?the version}" in
*-beta.*) echo "Spool Beta" ;;
*) echo "Spool" ;;
esac
