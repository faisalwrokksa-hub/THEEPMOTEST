# Implementation Plan

**Completed in supplied package:** initial application rebrand, wordmarks, metadata, favicon, shared translation keys, main exports, notification and assistant brand strings.

**Next gates:**
1. Install exact lockfile dependencies in a networked CI runner; perform typecheck, build and full tests.
2. Run web app and API with disposable data; visit each route in English/Arabic and light/dark.
3. Inspect every document/email export for residual visible identifiers.
4. Complete remaining untranslated copy and accessibility checks.
5. Fix measured blockers before shipping.
6. Approve and execute separately any change to deployed DNS, package namespaces, OAuth registrations or database technical identifiers.
7. Only after rebranding release, prioritize security and performance remediation.

Never edit existing historical migrations or reset existing data merely to rename the product.
