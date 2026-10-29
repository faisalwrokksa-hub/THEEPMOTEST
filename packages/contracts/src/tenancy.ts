import { z } from 'zod';
import { uuid } from './common';

/**
 * Roles are tenant-scoped. `staff_consultant` is the cross-tenant engagement
 * role that lets our own PMs work inside a client tenant — the managed-PMO
 * service model depends on it, so it exists from day one.
 */
export const role = z.enum([
  'owner',
  'admin',
  'pmo_lead',
  'project_manager',
  'contributor',
  'viewer',
  'staff_consultant',
]);
export type Role = z.infer<typeof role>;

export const tenant = z.object({
  id: uuid,
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(64),
  createdAt: z.coerce.date(),
});
export type Tenant = z.infer<typeof tenant>;

export const user = z.object({
  id: uuid,
  email: z.string().email(),
  displayName: z.string().min(1).max(200),
});
export type User = z.infer<typeof user>;

/** Superseded by `session` in access.ts, which carries capabilities. */
export const legacySession = z.object({ user, tenantId: uuid, role });
