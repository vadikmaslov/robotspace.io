# Database recovery: MVP

`scripts/backup-db.sh` creates a custom-format PostgreSQL dump atomically in
`/opt/robotspace/shared/backups` (directory 700, files 600), validates its table
of contents, and retains this job's dated copies for at least seven days. It
never cleans release directories. `robotspace-backup.timer` runs daily at 03:35
server time with up to ten minutes jitter. Failure is visible in systemd/journal;
external alerting is not implemented yet.

This is **not offsite backup**. Loss of the VPS/disk loses these copies too.
Do not upload plaintext dumps to the public image bucket. Production currently
has no dedicated BACKUP_S3_BUCKET or backup encryption public key configured.
Independent encrypted storage and recovery-key custody remain required.

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
No recovery-time guarantee or independent-server protection is established yet.

## Packaging from Windows

Use `git -c core.autocrlf=false archive` for Linux release archives, including
partial archives created from a repository subdirectory. Validate the archived
shell files for CR bytes before activation. `.gitattributes` sets LF for shell
and systemd files, but do not rely on working-tree line endings alone.
