import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Project, Portfolio, GateSummary, RaidItem, Task } from '@pmo/contracts';
import { fetchAuthenticatedApi } from './authenticated-api-fetch.mjs';
import { safeApiFailure } from './safe-api-error.mjs';
import { readBoundedUpstreamText, readBoundedUpstreamJson } from './bounded-upstream-body.mjs';
import { validSessionEnvelope } from './session-envelope.mjs';
import { readBoundedSuccessJson } from './bounded-success-json.mjs';
import { sessionFailureKind } from './session-failure.mjs';

const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const SESSION_COOKIE = 'pmo_session';

/** Forwards the session cookie so the API sees the signed-in user. */
async function authHeader(): Promise<Record<string, string>> {
  const c = await cookies();
  const s = c.get(SESSION_COOKIE)?.value;
  return s ? { cookie: `${SESSION_COOKIE}=${s}` } : {};
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: string) { super(message); }
  /** A module the workspace has not licensed, as opposed to a real failure. */
  get isNotLicensed() { return this.status === 403 && /not enabled for this workspace|subscription expired/i.test(this.detail ?? ''); }
  get isForbidden() { return this.status === 403; }
}

async function get<T>(path: string, maxResponseBytes?: number): Promise<T> {
  const res = await fetchAuthenticatedApi(fetch, `${BASE}${path}`, await authHeader());
  if (!res.ok) {
    // Preserve only fixed licensing classifications needed by the UI.
    // Other upstream error bodies can contain secrets or SQL diagnostics and
    // must never be copied into an Error message, detail, or server logs.
    const licenseBody = res.status === 403 ? await readBoundedUpstreamText(res, 4096) : '';
    const failure = safeApiFailure(res.status, licenseBody);
    throw new ApiError(failure.status, failure.message, failure.detail);
  }
  if (maxResponseBytes !== undefined) {
    // Session verification is a privileged request, not an unlimited JSON sink.
    // Reject incomplete, malformed or oversized bodies rather than accepting
    // a partial session or exhausting the Next.js server process.
    const body = await readBoundedUpstreamJson(res, maxResponseBytes);
    if (body === null) throw new ApiError(503, 'Invalid API response');
    return body as T;
  }
  try {
    return await readBoundedSuccessJson(res, 16 * 1024 * 1024) as T;
  } catch {
    // Do not expose upstream payloads, parser errors or stream diagnostics.
    throw new ApiError(502, 'Invalid API response');
  }
}

export type Session =
  | { authenticated: false }
  | { authenticated: true; userId: string; email: string; displayName: string;
      tenantId: string; tenantName: string; role: string; capabilities: string[];
      tenants: { tenantId: string; name: string; slug: string; role: string }[] };

/** Share one verified session response across the layout and nested pages.
 * Without request-scoped caching, an intermittent outage after layout auth
 * can make a page believe the same signed-in user has been logged out.
 */
const readSession = cache(async (): Promise<Session> => {
  const value = await get<unknown>('/auth/session', 65536);
  if (!validSessionEnvelope(value)) throw new ApiError(503, 'Invalid session response');
  return value as Session;
});

export async function getSession(): Promise<Session> {
  try { return await readSession(); }
  catch { return { authenticated: false }; }
}

/**
 * Strict layout-only lookup: distinguish a genuine signed-out session from
 * a temporary API outage. Never clear the cookie or redirect to login when
 * session verification could not complete.
 */
export async function getLayoutSession(): Promise<Session | { authenticated: false; unavailable: true }> {
  try { return await readSession(); }
  catch (error) {
    const status = error instanceof ApiError ? error.status : null;
    return sessionFailureKind(status) === 'signed-out'
      ? { authenticated: false }
      : { authenticated: false, unavailable: true };
  }
}

export type OnboardingStatus = {
  tenant: { id: string; name: string; slug: string };
  counts: { members: number; portfolios: number; programs: number; projects: number };
  completed: number;
  total: number;
  percent: number;
  nextStep: 'team' | 'portfolio' | 'program' | 'project' | null;
  tasks: {
    key: 'workspace' | 'team' | 'portfolio' | 'program' | 'project';
    completed: boolean;
    href: '/settings' | '/portfolios' | '/projects';
    capability: 'read' | 'pmoa_manage_people' | 'pmoa_manage_projects';
  }[];
};

export const api = {
  workspaceProfile: () => get<{id:string;slug:string;displayName:string;nameAr:string|null;contactEmail:string|null}>('/api/v1/onboarding/profile'),
  workspaceInvitations: () => get<{id:string;email:string;role:string;deliveryStatus:string;expiresAt:string;consumedAt:string|null;revokedAt:string|null}[]>('/api/v1/onboarding/invitations'),
  onboarding: () => get<OnboardingStatus>('/api/v1/onboarding/status'),
  projects: (programId?: string, cursor?: string) => {
    const params = new URLSearchParams();
    if (programId) params.set('programId', programId);
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return get<{ items: Project[]; nextCursor: string | null }>(
      `/api/v1/projects${query ? `?${query}` : ''}`);
  },
  portfolios: () => get<Portfolio[]>('/api/v1/portfolios'),
  programs: () => get<any[]>('/api/v1/programs'),
  gates: () => get<GateSummary[]>('/api/v1/gates'),
  raid: () => get<RaidItem[]>('/api/v1/raid'),
  tasks: () => get<Task[]>('/api/v1/tasks'),
  overview: () => get<any>('/api/v1/overview'),
  myWork: () => get<any>('/api/v1/my-work'),
  activity: () => get<any>('/api/v1/activity'),
  financials: () => get<any>('/api/v1/financials'),
  benefits: () => get<any[]>('/api/v1/benefits'),
  resources: () => get<any>('/api/v1/resources'),
  schedule: () => get<any[]>('/api/v1/schedule'),
  studio: () => get<any>('/api/v1/studio'),
  reports: () => get<any[]>('/api/v1/reports'),
  notifications: () => get<any>('/api/v1/notifications'),
  trends: () => get<any>('/api/v1/trends'),
  askStatus: () => get<any>('/api/v1/ask/status'),
  askThreads: () => get<any[]>('/api/v1/ask'),
  askThread: (id: string) => get<any[]>(`/api/v1/ask/thread/${id}`),
  me: () => get<any>('/api/v1/me'),
  decisions: () => get<any[]>('/api/v1/decisions'),
  approvals: () => get<any[]>('/api/v1/approvals'),
  analytics: () => get<any>('/api/v1/analytics'),
  documents: () => get<any[]>('/api/v1/documents'),
  updates: () => get<any[]>('/api/v1/updates'),
  stakeholders: () => get<any[]>('/api/v1/stakeholders'),
  integrations: () => get<any[]>('/api/v1/integrations'),
  microsoft: () => get<any>('/api/v1/microsoft/status'),
  microsoftPlaces: (q?: string) =>
    get<any>(`/api/v1/microsoft/places${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  microsoftFiles: (projectId?: string) =>
    get<any>(`/api/v1/microsoft/files${projectId ? `?projectId=${projectId}` : ''}`),
  powerBiReports: () => get<any>('/api/v1/microsoft/reports'),
  settings: () => get<any>('/api/v1/settings'),
  subscriptionCurrent: () => get<import('./subscription-display.mjs').CustomerSubscription | null>('/api/v1/subscription/current'),
  subscriptionPlans: () => get<{code:string;name:string;priceMinor:number;currency:string;billingInterval:'monthly'|'yearly';trialDays:number}[]>('/api/v1/subscription/plans'),
  billingInvoices: () => get<any[]>('/api/v1/subscription/billing/invoices'),
  billingPayments: () => get<any[]>('/api/v1/subscription/billing/payments'),
  billingExceptions: () => get<{id:string;invoiceId:string;exceptionType:string;amountMinor:number;currency:string;subscriptionPaused:boolean;createdAt:string}[]>('/api/v1/subscription/billing/exceptions'),
  superAdminPlans: () => get<any[]>('/api/v1/super-admin/plans'),
  superAdminAudit: () => get<any[]>('/api/v1/super-admin/audit'),
  superAdminTenants: (offset = 0) => get<{items: any[]; limit: number; offset: number; hasMore: boolean}>(`/api/v1/super-admin/tenants?offset=${offset}`),
  superAdminHistory: (id: string) => get<any[]>(`/api/v1/super-admin/tenants/${encodeURIComponent(id)}/subscriptions`),
  platformModules: () => get<any[]>('/api/v1/platform/modules'),
  enabledModules: () => get<string[]>('/api/v1/platform/enabled'),
  createOptions: () => get<any>('/api/v1/create-options'),
  projectGovernance: (id: string) => get<any>(`/api/v1/projects/${id}/governance`),
};
