import { z } from 'zod';
import { ASSIGNABLE_ROLES } from '@pmo/contracts';

export const profileInput = z.object({
  displayName: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().min(2).max(120).nullable().optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
}).strict();

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(ASSIGNABLE_ROLES),
  lang: z.enum(['ar','en']).default('en'),
}).strict();

export const acceptInput = z.object({
  token: z.string().min(80).max(100),
  displayName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(12).max(200).optional(),
}).strict();

export type ProfileInput = z.infer<typeof profileInput>;
export type InviteInput = z.infer<typeof inviteInput>;
export type AcceptInput = z.infer<typeof acceptInput>;
