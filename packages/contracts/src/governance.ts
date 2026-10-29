import { z } from 'zod';
import { uuid } from './common';

export const gateStatus = z.enum(['locked', 'active', 'approved', 'rejected']);
export const raidKind = z.enum(['risk', 'assumption', 'issue', 'dependency', 'change', 'decision']);
export const raidStatus = z.enum(['open', 'mitigating', 'closed']);
export const taskState = z.enum(['todo', 'in_progress', 'blocked', 'done']);

/** One row of the "why is this project stuck?" view. */
export const gateSummary = z.object({
  projectId: uuid,
  projectCode: z.string(),
  projectName: z.string(),
  gateId: uuid,
  seq: z.number().int(),
  name: z.string(),
  status: gateStatus,
  criteriaMet: z.number().int(),
  criteriaTotal: z.number().int(),
  unsigned: z.number().int(),
  accountable: z.string().nullable(),
  blockedBy: z.array(z.string()),
  mayPass: z.boolean(),
});
export type GateSummary = z.infer<typeof gateSummary>;

/**
 * Risk scoring, 5x5 — the standard PMO matrix.
 *
 *   severity   = how bad is it if this happens
 *   likelihood = how probable is it
 *   score      = severity x likelihood, so 1..25
 *
 * The point is not precision; it is forcing two separate judgements so a
 * catastrophic-but-improbable item cannot be ranked next to a trivial-but-certain
 * one. Both scales are 1..5 and are enforced in the database and here.
 */
export const SEVERITY_LABELS = {
  1: 'Negligible', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Severe',
} as const;

export const LIKELIHOOD_LABELS = {
  1: 'Rare', 2: 'Unlikely', 3: 'Possible', 4: 'Likely', 5: 'Almost certain',
} as const;

export const scale = z.number().int().min(1).max(5);

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/** One place decides the band. Previously this was a bare `>= 16` in the UI. */
export function riskBand(severity: number | null, likelihood: number | null): RiskBand | null {
  if (severity == null || likelihood == null) return null;
  const score = severity * likelihood;
  if (score >= 15) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

export const riskScore = (severity: number | null, likelihood: number | null) =>
  severity == null || likelihood == null ? null : severity * likelihood;

export const raidItem = z.object({
  id: uuid, projectId: uuid, projectCode: z.string().optional(),
  kind: raidKind, title: z.string(), detail: z.string().nullable(),
  severity: scale.nullable(), likelihood: scale.nullable(),
  status: raidStatus, owner: z.string().nullable(),
  blocksGate: z.string().nullable(), dueDate: z.string().nullable(),
});
export type RaidItem = z.infer<typeof raidItem>;

export const task = z.object({
  id: uuid, projectId: uuid, projectCode: z.string().optional(),
  title: z.string(), state: taskState, assignee: z.string().nullable(),
  dueDate: z.string().nullable(), estimateHours: z.number().int().nullable(),
});
export type Task = z.infer<typeof task>;
