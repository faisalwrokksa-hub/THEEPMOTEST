# Phase 12: navigation entitlement consistency

Updated `PlatformService.enabledIds` to require the latest tenant subscription to be active or within an unexpired trial before advertising commercial modules. Core modules remain available for recovery. Module activation and expiry checks remain in force.

Validated: 21 pure lifecycle/transition tests pass. No live database, full TypeScript compilation, or end-to-end API tests performed.

Remaining: Super Admin management UI, payment verification and renewal processing, full route coverage audit, live database migration, tenant-isolation integration tests, full build and release verification.
