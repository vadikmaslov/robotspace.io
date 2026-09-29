#!/usr/bin/env bash
# Local recovery copy only. An independent encrypted destination is still required.
set -euo pipefail
umask 077
backup_dir=/opt/robotspace/shared/backups
install -d -m 700 "$backup_dir"
test "$(readlink -f "$backup_dir")" = "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9
set -a
. /opt/robotspace/shared/.env.production
set +a
database_url="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"
test -n "$database_url"
database_url="${database_url%%\?*}"
temporary=$(mktemp "$backup_dir/.dump-XXXXXXXX")
trap 'rm -f -- "$temporary"' EXIT
pg_dump "$database_url" --format=custom --file="$temporary"
pg_restore --list "$temporary" >/dev/null
test -s "$temporary"
target="$backup_dir/robotspace-$(date -u +%Y%m%dT%H%M%SZ).dump"
test ! -e "$target"
mv "$temporary" "$target"
chmod 600 "$target"
# Only this job's dated snapshots in its validated directory; never releases.
find "$backup_dir" -maxdepth 1 -type f -name 'robotspace-????????T??????Z.dump' -mtime +7 -delete
printf 'Local backup complete: %s\n' "$(basename "$target")"
