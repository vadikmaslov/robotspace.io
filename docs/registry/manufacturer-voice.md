# Manufacturer claims and official statements

Phase 9 allows a signed-in GitHub user to claim an existing, published Company
whose official HTTPS website has already been verified by RobotSpace editors.
The user starts at `/companies/<slug>` and receives a random 48-hour DNS TXT
challenge. The exact TXT record name is `_robotspace.<verified-hostname>`.
Matching that record proves control of the company's verified domain. A link
to a website, a GitHub account, or a pending claim is not proof by itself.

Successful DNS verification changes the Company claim to `VERIFIED` and grants
the `VERIFIED_MANUFACTURER` role. It does not create an administrator account.
Only `MANUFACTURES` relationships already recorded by RobotSpace allow the
manufacturer to publish statements about a Robot. A claim cannot add a new
Company-Robot relationship. Claims and publishing respect `registry.claims`
and `registry.write` respectively. Claim attempts share the existing limit of
five attempts per user per 15 minutes.

The manufacturer may publish documents, SDK links, repositories, releases and
specifications. Each statement has a separate URL or value and a public
evidence link on the verified company hostname. It is stored in the append-only
`manufacturer_statements` table and recorded in `registry_changes`. The
manufacturer cannot edit editorial specifications, robot resources, project
compatibility or community reports through this route.

Company and Robot pages label these records as the **manufacturer position**.
The editorial catalog and independent community projects remain visible beside
them, including when a specification conflicts. A manufacturer's statement is
not presented as an independently verified test result.

The user can revoke their claim; an administrator can revoke a verified
manufacturer claim at `/admin/registry/claims`. Revocation immediately removes
publishing access and the verified badge. Statements remain in the immutable
history but cease to appear as a current official position. If the company's
verified domain changes, the old DNS proof no longer authorizes publication or
the badge. A fresh claim for the new domain is required.

Migration 43 adds the DNS proof and statements tables, extends notification
kinds and adds database guards. Apply it before serving Phase 9 pages. The
Registry integration suite covers valid and invalid DNS proof, cross-company
scope, immutable statements, revoke and fresh/clone migration paths.
