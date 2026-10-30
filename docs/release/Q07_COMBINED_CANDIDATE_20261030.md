# Q07 combined candidate — review only

Base: 8d10b9eb1f41b040f38c930ac563abdc33449431

Source PRs: #22 (Q06), #23 (E06), #24 (F06), #25 (C06), #26 (E07), #27 (F07), #28 (C07).

This branch applies all changes to an independent candidate without merging any existing branch. F06's nonblank guard is preserved alongside F07's decimal-only PostgreSQL count parser. New runtime tests are additive to existing CI tests.

Release status: NO-GO. The combined CI result is pending at branch creation. Staging Stripe TEST, two-user Entra, disaster recovery, and browser/legal/support acceptance are not established.
