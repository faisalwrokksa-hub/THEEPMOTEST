# Security Threat Assessment — Initial Static Review

This is a preliminary source inspection, not a penetration test, vulnerability scan or runtime validation. No confirmed exploitable vulnerabilities are asserted.

| ID | Area | Evidence | Risk/verification task | Priority | Rebrand blocker |
| --- | --- | --- | --- | --- | --- |
| S01 | Content Security Policy | `apps/api/src/main.ts` passes `contentSecurityPolicy: false` to Helmet | Assess script requirements and adopt a tested CSP to reduce XSS impact | High | No |
| S02 | Reverse proxy IP provenance | `apps/api/src/main.ts` uses `trust proxy`, value 1 | Confirm topology prevents untrusted forwarding headers from influencing IP-based rate limits | High | No |
| S03 | Tenant isolation | `packages/db` contains RLS scripts and tests | Run tenant-isolation tests against a disposable PostgreSQL database before deployment | High | Yes, for release validation |
| S04 | Authentication | `apps/api/src/auth/auth.controller.ts` uses HttpOnly, SameSite cookies and rate-limited login | Validate production TLS, CSRF assumptions, session revocation and cross-origin proxy settings | High | Yes, for release validation |
| S05 | Integrations | `apps/api/src/microsoft` and `docs/microsoft-setup.md` reference registered callbacks and credentials | Keep registered URLs until coordinated external migration | Medium | Yes, if changing URLs |
| S06 | Dependencies | `pnpm-lock.yaml` exists, with no dependency audit performed | Run vulnerability audit in an environment with access to registry advisories | Medium | No |
| S07 | AI | `apps/api/src/askx/askx.service.ts` has an assistant system instruction | Evaluate prompt-injection boundaries, tool permissions and tenant data isolation | Medium | No |

Do not probe production endpoints, migrate live databases, or rotate secrets as part of a cosmetic rebrand.
