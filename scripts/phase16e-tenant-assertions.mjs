/**
 * Phase 16E — strict response assertions for live authenticated tenant isolation.
 * These pure assertions are reusable by the Vitest HTTP suite and its offline
 * regression tests. A missing/empty response is NOT evidence of isolation.
 */
export function assertTenantPage(page, ownTenantId, otherTenantId, expectedProjectId) {
  if (!Array.isArray(page?.items) || page.items.length === 0)
    throw new Error('Tenant project page missing or empty; no isolation evidence');
  if (ownTenantId === otherTenantId || !ownTenantId || !otherTenantId)
    throw new Error('Isolation requires two different tenant identifiers');
  if (!page.items.some(row => row?.id === expectedProjectId))
    throw new Error('Seeded project not visible to its own tenant');
  for (const row of page.items) {
    if (!row?.id || row.tenantId !== ownTenantId || row.tenantId === otherTenantId)
      throw new Error('Cross-tenant project leaked in project list');
  }
  return true;
}

export function assertProjectDetail(project, ownTenantId, expectedProjectId) {
  if (!project || project.id !== expectedProjectId || project.tenantId !== ownTenantId)
    throw new Error('Project detail is not scoped to the authenticated tenant');
  return true;
}

export function assertDeniedForeignRecord(response, label) {
  if (response?.status !== 404)
    throw new Error(`${label}: foreign record must be HTTP 404, got ${response?.status ?? 'no response'}`);
  return true;
}

export function assertActiveTenant(session, expectedTenantId) {
  if (session?.authenticated !== true || session.tenantId !== expectedTenantId)
    throw new Error('Session active tenant disagrees with the selected workspace');
  return true;
}

export function assertTenantInvoiceList(invoices, ownTenantId, otherTenantId, expectedInvoiceId) {
  if (!Array.isArray(invoices) || invoices.length === 0 || ownTenantId === otherTenantId)
    throw new Error('Two-tenant billing evidence is missing');
  if (!invoices.some(row => row?.id === expectedInvoiceId))
    throw new Error('Own tenant fixture invoice missing');
  for (const row of invoices) {
    if (row?.tenantId !== ownTenantId || row.tenantId === otherTenantId)
      throw new Error('Cross-tenant invoice leaked after workspace switch');
  }
  return true;
}
