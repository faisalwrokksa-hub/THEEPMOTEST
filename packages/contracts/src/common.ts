import { z } from 'zod';

export const uuid = z.string().uuid();

/** Every list endpoint speaks this shape. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;

export const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** RAG status is used across projects, programs, portfolios and benefits. */
export const health = z.enum(['on_track', 'at_risk', 'critical']);
export type Health = z.infer<typeof health>;

export const money = z.object({
  amount: z.number(),
  currency: z.string().length(3).default('SAR'),
});
