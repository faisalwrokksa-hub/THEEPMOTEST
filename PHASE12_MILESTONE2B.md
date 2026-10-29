# Phase 12 Milestone 2B — subscription lifecycle rules

Added `packages/db/src/subscription-lifecycle.mjs` and Node's built-in test suite.

Functions: `subscriptionAccess`, `moduleAccess`, `renewalDecision`.
Fail-closed for missing subscriptions, invalid statuses, elapsed trials, expired billing periods, and disabled/expired modules. Renewal requires payment confirmation; it does not silently extend a subscription.

Run: `node --test packages/db/src/subscription-lifecycle.test.mjs`.

**Important:** These are tested pure lifecycle rules, not yet wired into NestJS API guards or persistence. Existing module guards are unchanged. No live database migration, end-to-end API tests, or billing integration has been performed. Before launch: wire enforcement, verify tenant authorization and RLS, integrate payment provider, run integration/security tests.
