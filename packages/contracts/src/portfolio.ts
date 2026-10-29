import { z } from 'zod';
import { uuid, health, money } from './common';

/** portfolio → program → project. Their spine, and it is a sound one. */

export const portfolio = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable(),
  health,
  createdAt: z.coerce.date(),
});
export const createPortfolio = portfolio.pick({ name: true, description: true }).partial({ description: true });

export const program = z.object({
  id: uuid,
  tenantId: uuid,
  portfolioId: uuid,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable(),
  health,
  createdAt: z.coerce.date(),
});
export const createProgram = program.pick({ portfolioId: true, name: true, description: true }).partial({ description: true });

export const projectStatus = z.enum(['planning', 'active', 'on_hold', 'closed']);

export const project = z.object({
  id: uuid,
  tenantId: uuid,
  programId: uuid.nullable(),
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  status: projectStatus,
  health,
  progressPct: z.number().int().min(0).max(100),
  startDate: z.coerce.date().nullable(),
  endDate: z.coerce.date().nullable(),
  budget: money.nullable(),
  ownerId: uuid.nullable(),
  createdAt: z.coerce.date(),
});
export const createProject = project
  .pick({ programId: true, code: true, name: true, status: true, startDate: true, endDate: true, ownerId: true })
  .partial({ programId: true, status: true, startDate: true, endDate: true, ownerId: true });
export const updateProject = createProject.partial().extend({
  health: health.optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});

export type Portfolio = z.infer<typeof portfolio>;
export type Program = z.infer<typeof program>;
export type Project = z.infer<typeof project>;
export type CreateProject = z.infer<typeof createProject>;
