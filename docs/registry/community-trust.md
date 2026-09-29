# Community trust and reputation, phase 7

Phase 7 keeps RobotSpace's editorial verification separate from community experience. A verified compatibility remains an editorial record; accepted community reports add context and do not overwrite that record or one another.

## User flow

1. A visitor opens a verified compatibility from a project or robot page.
2. `/compatibility/<id>` shows the editorial evidence, verification date, accepted confirmations and accepted disputes.
3. A GitHub-signed-in user can submit one independent report for that compatibility: `CONFIRMED` or `DISPUTED`, plus a credential-free HTTPS evidence URL.
4. A verified project owner and the original compatibility author cannot review their own relationship as an independent contributor.
5. A pending report is private. An administrator accepts or rejects it in `/admin/registry/review`.
6. The contributor receives an in-app notification. An accepted report becomes public; a rejected report remains only in the audit history.

The public trust label is deliberately simple:

- `Editorially verified` - no accepted community report exists.
- `Community confirmed` - at least one accepted confirmation and no accepted dispute exist.
- `Community reports conflict` - at least one accepted dispute exists. Confirmations remain visible beside it.

## Reputation

The append-only `registry_reputation_events` ledger is the source of truth. Points are awarded only after a verifiable or moderated event:

- verified GitHub project ownership: 2 points;
- accepted correction: 1 point;
- accepted compatibility suggestion: 1 point;
- accepted compatibility confirmation or dispute: 1 point.

The unique `(user_id, event_type, reference_id)` constraint prevents the same action from scoring twice. Ownership points use the stable project entity ID, so revoking and reclaiming the same repository does not add points. Ledger rows cannot be updated or deleted. A profile's cached reputation is synchronized by a database trigger, while public and moderation views calculate the displayed total from the ledger.

Reputation is context, not authority. It does not publish data, resolve conflicting reports, bypass moderation or convert a disputed relationship into a fact.

## Moderation and audit

The review queue shows the project and robot names, report type, evidence, contributor profile and current reputation. `/admin/registry/compatibility/<id>` reconstructs the evidence, every community report and the append-only `registry_changes` chain.

Report content is immutable after submission. Moderation may only move its status through allowed transitions; the report itself cannot be deleted. Evidence attached to pending or rejected reports is excluded from public editorial evidence.

Existing Registry protections still apply: active account checks, the `registry.write` feature flag, HTTPS-only evidence, one report per account and compatibility, and a shared limit of 20 contribution attempts per account per hour.

## Deployment and verification

Migration 41 creates and backfills the reputation ledger, adds its cache trigger and prevents deletion of compatibility reports. Apply it before switching the web release. The Registry integration test covers fresh and cloned databases, owner restrictions, duplicate reports, conflicting accepted opinions, hidden pending evidence, immutable reports and reputation events.

After deployment, perform an authenticated browser check with two non-owner GitHub accounts: submit a confirmation and a dispute, moderate both, verify both notifications, and confirm that the public compatibility page shows the conflicting evidence without losing either report.
