# The EPMO — Phase 13A, milestone 2: Workspace profiles & secure invitations

## Delivered in source

- New `tenant_profiles` table: editable display name, Arabic name, contact email; permanent tenant ID/slug unchanged.
- `GET/PATCH /api/v1/onboarding/profile`: readers view the profile; workspace administrators edit it. Audit ledger records edits.
- New `tenant_invitations` table with enforced PostgreSQL tenant RLS, hashed 256-bit bearer tokens, a 72-hour expiry, issuance/consumption/revocation timestamps, delivery status, and an active-invitation uniqueness rule.
- `GET/POST /api/v1/onboarding/invitations` and `POST /api/v1/onboarding/invitations/:id/revoke`: capability-gated administration with request validation and throttling.
- `POST /api/v1/onboarding/invitation/accept`: token-authorized and IP-throttled. Selects tenant RLS scope from the bearer token, verifies its hash, requires delivered + unexpired + unrevoked status, takes `FOR UPDATE` lock, inserts membership and consumes the token **in one transaction**. No administrator-selected tenant ID is accepted.
- New users must choose their own name and password (minimum 12 characters); existing accounts keep their current password unchanged. Token proves control of the email inbox; acceptance does **not** create a logged-in browser session.
- Bilingual organization profile, invitations, and acceptance screens. Invitation secret is sent in a URL fragment and immediately removed from the address bar.
- Email via existing Amazon SES transport. API refuses to claim delivery if email is not configured or sending fails; send failures invalidate the invitation. The HTTP response and database never reveal the bearer token.
- Production Compose forwards mail configuration **only to the API**, never the frontend.

## Migration & setup

Apply migration `0016_workspace_profiles_invitations.sql` using the existing SQL-ledger deployment procedure **before starting the updated API**. Do not use Drizzle's separate migration ledger on a SQL-ledger deployment. Configure on the API server:

```
WEB_ORIGIN=https://staging.theepmo.com
MAIL_TRANSPORT=ses
MAIL_FROM=verified-sender@your-domain.example
MAIL_REGION=ap-south-1
```

AWS SES sending identity must be verified, recipient must be allowed if the account remains in SES sandbox, and the application server must have SES permissions through an approved workload identity. Never paste AWS keys into the web app or version-controlled environment files.

To test: log in as an authorized customer administrator; update the profile; send an invitation to a real test mailbox; open the link without signing in; create a new account or join using an existing one; verify the member appears in the **correct** tenant; replay the URL (must fail); revoke another invitation (must fail to accept); test expiry; confirm no invitation can grant an owner/platform-admin role. Run these tests against a real PostgreSQL server with RLS enforced by `pmo_app` and a real SES sending identity.

## Known limits — do not call production-ready yet

- Full TypeScript application build, real PostgreSQL migration/transaction tests, and live SES delivery/acceptance are **not executed** in this workspace.
- The organization *display name* is configurable; the immutable canonical organization row and slug are unchanged to protect cross-system identifiers.
- Legacy password-based manual member creation API remains for backward compatibility. The Settings UI now uses email invitations instead.
- This milestone does not cover self-service tenant signup, SMTP providers besides the existing SES transport, invite reminders, or production email-deliverability monitoring.
- Phase 12 staging acceptance (full build, PostgreSQL tenant-isolation, Stripe test mode, bilingual user acceptance) remains deferred.
