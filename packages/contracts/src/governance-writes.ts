import { z } from 'zod';
import { uuid } from './common';

/** Tick or untick a gate criterion. Evidence is required to mark one met. */
export const setCriterion = z.object({
  isMet: z.boolean(),
  evidenceUrl: z.string().url().max(2000).optional().nullable(),
});
export type SetCriterion = z.infer<typeof setCriterion>;

export const decide = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(2000).optional(),
});
export type Decide = z.infer<typeof decide>;

export const raidUpdate = z.object({
  status: z.enum(['open', 'mitigating', 'closed']).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  ownerId: uuid.nullable().optional(),
});

export const taskUpdate = z.object({
  state: z.enum(['todo', 'in_progress', 'blocked', 'done']),
});

/** Why a gate may not pass. Returned to the UI so it can say exactly what is missing. */
export const gateBlocker = z.object({
  kind: z.enum(['criteria', 'approval', 'register', 'sequence', 'status']),
  message: z.string(),
});
export type GateBlocker = z.infer<typeof gateBlocker>;

export const gateReadiness = z.object({
  gateId: uuid,
  mayPass: z.boolean(),
  blockers: z.array(gateBlocker),
});
export type GateReadiness = z.infer<typeof gateReadiness>;
