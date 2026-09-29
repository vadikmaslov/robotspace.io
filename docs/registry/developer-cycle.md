# Developer cycle, phase 5

Phase 5 adds the first contributor loop without automatically publishing unverified claims or relationships.

1. A GitHub-signed-in user imports a public repository at `/projects/new`. The project starts as `DRAFT`/`DISCOVERED`. Importing does not establish ownership.
2. The user verifies GitHub repository administration at `/claim?project=<slug>`. A `VERIFIED` claim grants access to `/projects/<slug>/manage` and `/developers/new`.
3. The developer profile is public at `/developers/<handle>`. It lists only published, verified claimed projects and robots connected by verified compatibility. From phase 7 onward, reputation comes from the append-only, evidence-backed ledger described in `community-trust.md`.
4. An owner can edit allowlisted metadata of a draft. A published project's metadata instead becomes a pending correction with evidence. Moderation checks that the original values are still current before applying the change.
5. An owner can suggest compatibility with a published robot, with HTTPS evidence. Other signed-in users can independently confirm or dispute an already verified relationship. Neither action becomes public until an administrator reviews it at `/admin/registry/review`.
6. Correction, compatibility-suggestion and confirmation decisions create an audit record and an in-app notification at `/notifications`. Generic corrections are accepted as editorial evidence; they do not automatically change public data.

`registry.write` gates all contributor mutations and remains disabled by default. Production rollout requires migration 39, a successful web build and Registry tests, then an explicit production flag override. Keep `registry.claims` enabled for the Claim step. Migration 39 also fixes a migration-36 trigger that incorrectly accessed a correction-only field when inserting a compatibility confirmation.

Automated Registry tests cover the import → GitHub claim → profile → metadata → compatibility → moderation → notification path on a fresh database and a clone. A browser-level authenticated smoke test remains necessary after deployment.
