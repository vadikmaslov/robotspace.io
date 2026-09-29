# Database recovery: MVP

`scripts/backup-db.sh` creates a custom-format PostgreSQL dump atomically in
`/opt/robotspace/shared/backups` (directory 700, files 600), validates its table
of contents, and retains this job's dated copies for at least seven days. It
never cleans release directories. `robotspace-backup.timer` runs daily at 03:35
server time with up to ten minutes jitter. Failure is visible in systemd/journal;
external alerting is not implemented yet.

Each successful run also uploads an **AES-256-GCM encrypted** copy to S3 under
`robotspace-backups/v1/`. Plaintext is never uploaded. Every object uses private
ACL and no-store; a harmless temporary object must return 401/403 to an anonymous
request before any backup upload proceeds. The uploaded copy is downloaded and
its SHA-256 checked. Only dated objects marked with our backup-format metadata
under this prefix are deleted after 30 days. Images and bucket policies are not
modified. Versioned buckets may retain older object versions; configure those
separately if needed. This is not immutable/ransomware-proof storage: the server
credentials can delete copies, and images share the current S3 account.

The job uses existing `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY` (or `_KEY_ID`),
`S3_SECRET_KEY` (or `_SECRET_ACCESS_KEY`), `S3_REGION`, `S3_FORCE_PATH_STYLE`.
A dedicated destination can override these with `BACKUP_S3_ENDPOINT`,
`BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`,
`BACKUP_S3_REGION`. Endpoint HTTPS is mandatory. Any storage/integrity failure
fails the systemd job and prevents local retention cleanup; the new local dump
remains available. Failure is currently recorded in journal, not sent externally.

## Encryption key and recovery from S3

The key is 32 cryptographically random bytes, stored as a binary file, **not**
an environment variable or a repository file. Default server location:
`/opt/robotspace/shared/backup-encryption.key`, mode 600, root owner.
`BACKUP_ENCRYPTION_KEY_FILE` can select an existing recovery key. A separate
Windows recovery copy is kept outside this repository in
`%USERPROFILE%\.robotspace-backups\backup-encryption.key` with restricted ACL.
Keep another trusted offline copy. Never upload the key alongside backups or
rotate/delete it without preserving the old key until all its copies expire.
Loss of every key copy makes encrypted backups unrecoverable.

On a trusted Linux recovery host with the application dependencies installed,
restore S3 credentials and the key from private storage, then run (as root on
the current VPS; use a new filename, never overwrite an existing dump):

```sh
export PATH=/opt/node-v24.18.0/bin:$PATH
set -a; . /opt/robotspace/shared/.env.production; set +a
node /opt/robotspace/current/scripts/backup-s3.mjs restore \
  robotspace-YYYYMMDDTHHMMSSZ.dump.enc \
  /opt/robotspace/shared/backups/robotspace-YYYYMMDDTHHMMSSZ.dump
bash /opt/robotspace/current/scripts/verify-db-restore.sh \
  /opt/robotspace/shared/backups/robotspace-YYYYMMDDTHHMMSSZ.dump
```

Use an actual object timestamp; choose a different valid local timestamp if a
local dump with that name exists. SHA-256 and GCM authentication are checked
before the final plaintext file is published. Decryption does not restore over
production. The next section describes the isolated database restore drill.

## Restore drill

As root, run `bash /opt/robotspace/current/scripts/verify-db-restore.sh <absolute-dump-path>`.
Only dated dumps under the directory above are accepted. The script creates a
new `robotspace_restore_check_*` database using the local postgres administrator,
restores tables/data with error checking, verifies that entities and migration
records can be read, then drops only the database it created. It never restores
over production. Roles/ACLs are deliberately omitted; this tests data recovery,
not a full disaster-recovery bootstrap of users, grants, server env or uploaded media.

Check `systemctl list-timers robotspace-backup.timer`,
`systemctl status robotspace-backup.service` and latest dump timestamp. Do not
claim recoverability just because the timer is enabled; repeat restore drills.
Expected local recovery point: last successful daily run (approximately 24h).
S3 preserves database copies outside the VPS, but there is no recovery-time
guarantee. Secrets, PostgreSQL roles, media and server configuration still need
their own disaster-recovery process. A successful drill is not a full DR test.

## Packaging from Windows

Use `git -c core.autocrlf=false archive` for Linux release archives, including
partial archives created from a repository subdirectory. Validate the archived
shell files for CR bytes before activation. `.gitattributes` sets LF for shell
and systemd files, but do not rely on working-tree line endings alone.
