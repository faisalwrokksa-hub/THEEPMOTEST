# E12 — server-owned deployment runtime binding (review only)

This increment wires the A02/A03 deployment binding contract into authenticated NestJS tenancy middleware and bootstrap preflight. It is **not** a persistent provisioning registry or proof of physically isolated Saudi hosting.

## Required safe staged adoption

Set all the following API-only environment variables together as one approved provisioning change, never in `NEXT_PUBLIC_*` or source control:

- `EPMO_DEPLOYMENT_PROFILE`: `shared` or `dedicated`
- `EPMO_DEPLOYMENT_ID`: server-generated UUID
- `EPMO_DEPLOYMENT_REGION`: approved Saudi region ID
- `EPMO_DEPLOYMENT_API_ORIGIN`: approved exact HTTPS API origin
- `EPMO_ALLOWED_DEPLOYMENT_REGIONS`: comma-separated approved region IDs
- `EPMO_DEPLOYMENT_BINDINGS_JSON`: trusted server inventory of A02 binding objects, no customer content or secrets

Entries must match runtime profile, deployment UUID, region and API origin. Dedicated runtimes require exactly one tenant. Duplicate tenant mappings and cross-deployment binds reject startup. Authenticated requests resolve through the server principal and validated inventory, never user headers.

When the profile flag is absent **all** these runtime checks are **disabled** for legacy compatibility; this does not prove Saudi/dedicated isolation. Partial configuration fails boot. Persistent immutable registry, lifecycle migrations, multi-user OAuth verification, provider-specific IaC, backup restore and actual dedicated runtime verification are **still required** before release.

This branch makes no deployment or DNS change.
