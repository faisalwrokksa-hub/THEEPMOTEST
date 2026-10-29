# The EPMO — P0 Checkpoint 6: Sensitive Logging and Deployment Exposure

Baseline: `the-epmo-p0-tenant-privilege-checkpoint5.zip`.

## Remediation performed

1. `RequestLogMiddleware` accepts bounded, safe client request IDs only; generates a fresh UUID for malformed or oversized input. It logs framework-defined route templates (e.g. `/invitations/:token`), not real URLs or their query strings. Unmatched routes are labelled `[unmatched]`.
2. The global exception filter uses the same sanitized response request ID for support correlation, never logs raw request URLs, thrown exception messages, or stack traces, and returns generic HTTP 5xx bodies. Explicit 4xx field-validation responses continue to be delivered to customers.
3. Removed upstream error text and customer identifiers from Microsoft Graph/connection, Bedrock, scheduled notification and trends logs. Detailed tenant-specific audit events remain in the tenant-scoped database.
4. RC1 release preflight rejects staging/production configurations that publish the web container on a public host address. Use `WEB_BIND=127.0.0.1` behind an HTTPS reverse proxy.

## Local verification (performed)

- Offline Node test suite: **652 passed / 652 total**.
- New P0 logging tests: **14/14 passed**; web bind test: **1/1 passed**.
- Static release checks: **8/8 passed**.
- RC1 repository checks: **9/9 passed**.
- Ordered SQL migration manifest: **19 migrations verified**.
- TypeScript parser: **8/8 changed TypeScript files parsed**.
- Release ZIP integrity: verified during packaging.

## Operational requirements and limitations

- This change deliberately reduces production error detail. Rely on request IDs plus restricted server/provider telemetry for incident investigation. Do **not** copy secrets or raw customer data into logs to compensate.
- Before deployment, verify the real reverse proxy forwards only trusted headers and the web UI remains accessible through HTTPS. Validate the release preflight against your actual server-managed `.env` files.
- This is source-level hardening, **not a completed application build or live penetration test**. Full build, PostgreSQL RLS tests, Stripe test-mode payment, SES invitation email and bilingual browser acceptance are pending.
- Never commit actual environment files, passwords, Stripe keys, database dumps, signing secrets, or decrypted customer data.
