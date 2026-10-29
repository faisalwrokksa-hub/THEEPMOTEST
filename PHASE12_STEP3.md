# Phase 12 — Step 3 (partial): Tenant subscription administration

Added GET /api/v1/subscription/history and GET /api/v1/subscription/events. Both require `pmoa_platform`, derive tenant identity from authenticated request context, execute under tenant RLS, and limit responses to 100 rows.

These are **tenant administration endpoints**, not a vendor-wide Super Admin portal. Vendor-wide cross-tenant administration needs a separately authenticated privileged service, audited operations and security review. No payment status mutation is exposed.

Pending: full build, live DB integration, Super Admin UI, payment verification, end-to-end checks.
