# GitHub claims, phase 4

This feature is gated by `registry.claims`. Keep it disabled until migrations 36-38 and OAuth configuration are ready.

1. Create a GitHub OAuth App with callback URL `https://robotspace.io/api/auth/callback/github` (use `http://localhost:3000/api/auth/callback/github` for a separate development app).
2. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the server environment. Do not expose the secret as `NEXT_PUBLIC_*`.
3. Keep `AUTH_SECRET` stable across releases. It encrypts short-lived GitHub grants and signs Auth.js sessions.
4. Apply database migrations 36-38, then enable `registry.claims` for the intended environment.
5. Sign in from `/claim?project=<slug>` and verify a project that has a public GitHub repository URL. The project can remain unpublished while its owner is verified.

The OAuth request asks for `read:user`. It does not request `public_repo`, which includes write access. The claim check calls `GET /user` and an authenticated `GET /repos/{owner}/{repo}`. GitHub must return `permissions.admin: true`, a public repository and the expected stable repository ID. If permissions are absent, the claim remains pending for review at `/admin/registry/claims`. A negative permission result rejects a new claim or revokes an existing verified claim on recheck.

The access token is encrypted at rest for up to ten minutes, is never added to the browser session, and is removed after a claim check. The worker removes unused expired grants every five minutes. Rechecking requires a fresh GitHub sign-in. A user can revoke their own verified claim immediately. Admin sessions are explicitly separate from GitHub Registry sessions; existing admin sessions must sign in again after this change.

GitHub OAuth Apps cannot request a read-only scope limited to public repository administration. Organization access policies may omit `permissions.admin`; those claims need review or a future GitHub App with narrower permissions. No pending claim is automatically approved by an administrator.
