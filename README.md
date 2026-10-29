# The EPMO — المكتب التنفيذي لإدارة المشاريع

A multi-tenant delivery-governance platform: portfolios, programmes and projects
governed by stage gates that the software actually enforces, sold as licensable
modules on one platform.

| | |
|---|---|
| Production | https://align360.aetherixsystems.com |
| Development | https://dev.3-111-66-127.sslip.io |

## Stack

| Layer  | Choice |
|--------|--------|
| Web    | Next.js 15 (App Router), React 19 |
| API    | NestJS 10, modular monolith |
| Data   | PostgreSQL 16 with row-level security, Redis |
| Shared | Zod contracts imported by *both* sides; Drizzle ORM |

One language end to end, one repository, one deployable unit per environment.
A modular monolith rather than services: the module boundaries are enforced in
code and at the API, which is what the licensing model needs, without paying the
operational cost of a distributed system for a product this size.

## Quick start

```bash
cp .env.example .env
pnpm install
NODE_ENV=development PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE \
  EPMO_ALLOW_LOCAL_SCHEMA_PUSH=YES_I_UNDERSTAND pnpm setup  # disposable local DB only
pnpm dev        # api :4000, web :3000
```

Then open http://localhost:3000 and sign in as `fatima@al-nakheel.test` /
`pmoalign-dev`.

`pnpm setup` **is for disposable local development databases only** and requires
explicit one-time destructive operation opt-ins for both schema push and demo seeding.
`pnpm db:seed` independently requires `NODE_ENV=development` (or `test`),
`PHASE15_ACCEPT_DISPOSABLE_DB=YES_RESEED_DISPOSABLE_TEST_DATABASE`,
matching app/admin PostgreSQL URLs on loopback, and a non-deployed environment.
Keep the opt-in in the command shell rather than in a committed configuration.
It is deliberately blocked against remote, staging, and production databases. It must never target staging or production. For upgrades,
use the checked SQL-ledger command `npm run db:migrate` with administrator
`PGHOST`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` and `PGPORT` configured;
then apply RLS. The legacy Drizzle migrator is disabled to prevent mixing
migration journals. `pnpm setup` ends by running the tenant-isolation check. If it does not print
**"Tenant isolation holds."**, stop and fix that before writing any feature code.

```bash
pnpm verify     # typecheck + data integrity + RLS proof + tests — run before pushing
```

## What the platform enforces

Four rules are enforced by the database and the API, not by the interface. A
control that is merely hidden is not a control.

**1. Tenant isolation is a database policy.**
The app connects as `pmo_app`, which has neither superuser nor `BYPASSRLS`, so
the policies bind. Each request runs in a transaction that sets `app.tenant_id`;
`set_config(..., true)` makes it transaction-local, so it cannot leak across
pooled connections. Queries carry no `tenant_id` predicate — Postgres adds it.
`packages/db/sql/rls.sql` loops over every table that *has* a `tenant_id` column,
so a new table cannot be left unprotected by forgetting to list it.
Proof: `pnpm verify:rls`.

**2. A stage gate passes three tests or it does not pass.**
Criteria met *with evidence*, approvals signed by the assigned approver, and no
open register item pointed at the gate. The rules are re-evaluated inside the
same transaction that advances the gate, so calling the endpoint directly gets a
409 listing every reason — the disabled button is a courtesy, not the mechanism.

**3. Module licensing is checked on the route.**
`@RequiresModule('finance360')` plus a guard reading the workspace's
entitlements. A workspace on a PMO-only plan is refused at `/api/v1/financials`
even when the URL is typed directly.

**4. The audit ledger is append-only.**
`AuditService.record()` takes the transaction as an argument precisely so the
ledger cannot drift from the data, and the app role is denied `UPDATE` and
`DELETE` on `audit_events`.

Layout uses CSS logical properties (`margin-inline`, `border-inline-end`) so that
Arabic and right-to-left are a `dir` attribute rather than a rewrite.

## Layout

```
apps/web            Next.js — 23 screens, Arabic/RTL, plain-form writes
apps/api            NestJS — capability checks, module guard, governance rules
packages/contracts  Zod schemas + inferred types — the shared source of truth
packages/db         Drizzle schema, RLS policies, migrations, seed, checks
infra/              deploy, database bootstrap, catalogue sync
```

`packages/*` compile to CommonJS in `dist/`, because the Nest build consumes them
as compiled JS. **After editing a contract or the schema, run
`pnpm build:packages`** (or `pnpm dev`, which does it first).

Writes are plain form POSTs to route handlers, not Server Actions: a route
handler has a stable URL, so an open tab keeps working across a redeploy and the
page still functions with JavaScript disabled.

## Environments

Both run on the same box, as two entirely separate stacks — separate compose
project, separate containers, separate database volume, separate secrets.

| | Production | Development |
|---|---|---|
| URL | https://align360.aetherixsystems.com | https://dev.3-111-66-127.sslip.io |
| Directory | `/opt/align360` | `/opt/align360-dev` |
| Compose project | `pmo-prod` | `align360-dev` |
| Secrets | `.env.prod` | `.env.dev` |
| Web port (loopback) | 3000 | 3001 |
| Database volume | `pmo-prod_pgdata` | `align360-dev_pgdata`, also on `127.0.0.1:55432` |

Deploy from a local checkout — the box holds no GitHub credentials, deliberately,
so nothing on the server can push:

```bash
infra/deploy.sh dev           # rsync, rebuild, restart, wait for healthy
infra/deploy.sh prod          # same, but runs `pnpm verify` first
```

Changing `MODULE_CATALOGUE` does nothing on a server by itself — the catalogue
lives in the `modules` table. Push it:

```bash
infra/sync-catalogue.sh dev
```

Schema changes are files in `packages/db/migrations/`, applied once each and
recorded in a `schema_migrations` ledger:

```bash
ssh <box> 'cd /opt/align360-dev && infra/bootstrap-db.sh dev'
```

The development database is reachable on the box's loopback, so it can be seeded
or inspected from your machine over a tunnel:

```bash
ssh -i ~/.ssh/align360-mumbai.pem -N -L 55432:127.0.0.1:55432 ubuntu@<box>
DATABASE_URL_ADMIN='postgres://…@127.0.0.1:55432/pmo' pnpm --filter @pmo/db seed
```

The seed leaves `apps/web/.env.local` alone unless it is pointed at your own
local database, and it never resets the owner account's password.

## Secrets

Nothing secret is in this repository, and nothing secret is copied to or from the
server by the deploy scripts. `.env.prod` and `.env.dev` are generated on the box
with `chmod 600`. `.env.example` and `.env.prod.example` document the shape.

## Accounts

The seed creates two demo workspaces, which is what makes the tenant boundary
demonstrable rather than merely claimed:

| Account | Role |
|---|---|
| `fatima@al-nakheel.test` | owner, Al-Nakheel Development |
| `khalid@nexa.test` | owner, Nexa Holdings |
| `pm@pmoalign.test` | `staff_consultant` in **both** — the managed-PMO engagement model |

All three use `pmoalign-dev`. The owner account is separate: it keeps its own
password, a reseed does not reset it, and that password is not in this repository.
