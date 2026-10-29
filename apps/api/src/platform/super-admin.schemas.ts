import { z } from 'zod';

/** All Super Admin mutations require validated, bounded input. */
export const planCreate = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_-]{2,39}$/),
  name: z.string().trim().min(3).max(120),
  priceMinor: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/).default('SAR'),
  billingInterval: z.enum(['monthly', 'yearly']),
  trialDays: z.number().int().min(0).max(365).default(0),
  isActive: z.boolean().default(true),
}).strict();

/** Price changes require a new plan code to preserve historical pricing meaning. */
export const planUpdate = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'No changes provided');

const offsetDateTime = z.string().datetime({ offset: true });
export const manualGrant = z.object({
  planCode: z.string().regex(/^[a-z][a-z0-9_-]{2,39}$/),
  status: z.enum(['active', 'trialing']),
  periodStartsAt: offsetDateTime,
  periodEndsAt: offsetDateTime,
  trialEndsAt: offsetDateTime.optional(),
  reason: z.string().trim().min(10).max(500),
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.periodStartsAt);
  const end = Date.parse(value.periodEndsAt);
  if (!(start < end)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEndsAt'], message: 'Period end must follow start' });
  if (value.status === 'trialing') {
    if (!value.trialEndsAt || !(Date.parse(value.trialEndsAt) > start && Date.parse(value.trialEndsAt) <= end))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trialEndsAt'], message: 'Trial end must be within the subscription period' });
  } else if (value.trialEndsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trialEndsAt'], message: 'Active grants must not contain trial end' });
  }
});
export const adminCancel = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
export type PlanCreate = z.infer<typeof planCreate>;
export type PlanUpdate = z.infer<typeof planUpdate>;
export type ManualGrant = z.infer<typeof manualGrant>;
export type AdminCancel = z.infer<typeof adminCancel>;
