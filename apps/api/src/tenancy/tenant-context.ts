import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role, Capability } from '@pmo/contracts';

export interface RequestContext {
  tenantId: string;
  userId: string | null;
  role: Role;
  /*
   * The capabilities this request actually holds, not what the role implies.
   * Some are granted to the person rather than the membership — platform
   * administration is — and recomputing from the role silently dropped them.
   */
  capabilities: readonly Capability[];
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn);

/** Throws rather than returning undefined: a query with no tenant is a bug, not a default. */
export function currentContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No tenant context — request did not pass through TenantMiddleware');
  return ctx;
}
