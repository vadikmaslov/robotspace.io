#!/usr/bin/env bash
# Restore into a newly created, disposable database, never the application's DB.
set -euo pipefail
backup=${1:?Pass the absolute path of a dated local backup}
case "$backup" in /opt/robotspace/shared/backups/robotspace-????????T??????Z.dump) ;; *) exit 1;; esac
test -f "$backup" && test "$(readlink -f "$backup")" = "$backup"
restore_db="robotspace_restore_check_$(date -u +%Y%m%d%H%M%S)_$$"
[[ "$restore_db" =~ ^robotspace_restore_check_[0-9]+_[0-9]+$ ]]
# createdb fails if the name already exists. The cleanup trap is installed only
# after successful creation, so a pre-existing DB can never be dropped.
runuser -u postgres -- createdb "$restore_db"
trap 'runuser -u postgres -- dropdb "$restore_db"' EXIT
runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-privileges --dbname="$restore_db" < "$backup"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 --dbname="$restore_db" -c "SELECT count(*) AS restored_entities FROM entities; SELECT count(*) AS restored_migrations FROM robotspace_schema_migrations;"
printf 'Restore check passed in disposable database.\n'
