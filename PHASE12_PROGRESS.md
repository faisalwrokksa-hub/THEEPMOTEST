# Phase 12 delivery status (verified scope)

1. Lifecycle transitions: implemented pure rules, 21 Node tests pass. Renewal requires verified payment evidence and is **not exposed** as a customer API action.
2. Tenant-scoped API: added GET `/api/v1/subscription/current`, GET `/api/v1/subscription/plans`, POST `/api/v1/subscription/cancel-at-period-end`, POST `/api/v1/subscription/resume`. Cancellation uses row locking, tenant filtering, capability check, and audit event.
3. Super Admin: existing platform administration exists, but full vendor subscription management UI/API **not delivered**.
4. Module enforcement: existing server guard checks current subscription and module entitlement; additional full-route coverage audit **pending**.
5. Security tests: lifecycle tests and source checks only; cross-tenant end-to-end and real database RLS verification **pending**.
6. Release verification: Node unit tests run; full TypeScript build, PostgreSQL migrations, billing provider integration, and E2E tests **not run**.

Do not deploy to production until migration 0011/0012 and the API build have been verified against a test database. Existing tenant subscriptions must be provisioned before commercial module access is enabled.
