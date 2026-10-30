# The EPMO — Dual Deployment Architecture (A01)

Status: proposed design, not an implemented or certified government deployment.
Scope: Saudi-hosted shared SaaS and isolated dedicated government/enterprise deployments from one versioned application codebase.

## Non-negotiable invariants
1. A tenant's deployment mode and residency are immutable after provisioning without an audited, approved migration.
2. No application request can select a tenant by a client-supplied header alone. Resolve identity, membership, tenant and deployment routing on the trusted server side. Reject cross-deployment and cross-tenant access.
3. All customer records, audit records, search indexes, object storage, backups, caches, queues and telemetry are scoped to the tenant/deployment. Never place customer payloads in globally shared logs.
4. A dedicated deployment has independent network boundary, runtime, database, object storage, secrets/KMS keys, backups and disaster recovery. It must not depend on a shared production database or shared customer-data control plane.
5. The control plane stores only minimum deployment metadata and opaque tenant identifiers, not customer content, user tokens or encryption keys. A government customer can require a private control plane or fully disconnected operation.
6. Fail closed if deployment routing, tenant authorization, key retrieval or residency checks cannot be verified.

## Deployment profiles

| Concern | Shared SaaS | Dedicated enterprise/government |
|---|---|---|
| Region | Saudi-hosted by default | Saudi-hosted, customer-approved location/provider |
| Runtime | Multi-tenant app/API cluster | Customer-specific app/API cluster or VPC |
| PostgreSQL | Shared cluster with tenant-scoped schema/query authorization and RLS; test policy coverage | Separate database and credentials per customer |
| Object storage | Tenant-prefixed buckets/objects with IAM conditions | Customer-specific buckets and credentials |
| Keys | Per-tenant encryption context; keys governed by policy | Customer-specific KMS keys and rotation |
| Identity | Per-tenant SSO/OIDC configuration | Agency Entra/OIDC/SAML integration and configurable access restrictions |
| Network | Public HTTPS with WAF/rate limiting | Private ingress/VPN/allowlisting where required |
| Logs | Tenant-tagged and redacted | Dedicated log store/retention/export controls |
| Backups | Encrypted, isolated, restore-tested | Separate backup policy, keys, restore tests and customer RPO/RTO |
| Updates | Coordinated rolling rollout | Pinned version with customer-specific change window |

## Routing and provisioning
1. Commercial onboarding records requested profile, legal entity, classification, residency, provider eligibility and security review outcome. Never automatically mark a government tenant compliant.
2. Provision a unique deployment ID and signed server-side mapping: tenant ID -> deployment ID -> approved region -> trusted API origin. Do not derive API origin from Host, Origin, tenant name or arbitrary user input.
3. Establish environment-specific credentials and migrations; verify RLS for shared profile and dedicated DB separation for dedicated profile.
4. Configure customer identity federation, RBAC, audit sinks, storage policies, encryption, secrets and network controls.
5. Run acceptance gates (cross-tenant negative tests, backup/restore, TLS, secrets scanning, vulnerability checks, monitoring, performance, DR rehearsal) before any customer data.
6. Activate traffic only after documented security, classification, contract and operational signoff.

## Deployment manifest example (non-secret illustrative configuration)
```yaml
apiVersion: theepmo.com/v1alpha1
kind: TenantDeployment
metadata:
  tenantId: "<server-generated-opaque-id>"
spec:
  profile: dedicated # shared | dedicated
  region: sa-approved-region
  dataResidency: SA
  environment: staging
  databaseIsolation: dedicated
  keyIsolation: dedicated
  ingress: private
  identityProvider: customer-managed-oidc
  backup:
    encrypted: true
    restoreTestRequired: true
  audit:
    tenantScoped: true
    payloadRedaction: true
```

This manifest is a design contract, not a Kubernetes CRD or executable deployment tool. Reject inconsistent combinations (for example dedicated profile with shared database) in the eventual provisioning validator.

## Engineering delivery phases
- A02: typed deployment-profile contract and server-side validation, immutable provisioning state.
- A03: deployment registry and authenticated routing, with negative tests for spoofed tenant and cross-deployment access.
- A04: isolated IaC modules (shared cluster and per-customer VPC/runtime/DB/storage/KMS), least-privilege service accounts.
- A05: tenant-scoped audit/backup/observability; no customer content in shared control plane.
- A06: CI matrices for shared/dedicated, security tests, restore rehearsals and rollout/rollback.
- A07: customer-facing deployment selection and contractual compliance evidence workflow.

## Release gates
Production remains NO-GO until exact-SHA CI, identity two-user tests, tenant isolation, encrypted restore, rollback, provider eligibility, data classification, approved region, customer acceptance and operational evidence are verified. A document, IaC template or green unit test alone is not proof of compliance.

## Saudi regulatory review
Evaluate the current NCA CCC 2:2024, ECC, applicable CSCC/DCC, PDPL, customer classification, sector rules and government procurement conditions for each deployment. Government use is **not** automatically approved by hosting in Saudi Arabia. Relevant primary references:
- https://nca.gov.sa/en/regulatory-documents/controls-list/ccc/
- https://nca.gov.sa/en/regulatory-documents/controls-list/cscc//
- https://nca.gov.sa/en/regulatory-documents/controls-list/dcc/
