import { PipeTransform, BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/** Validates with the SAME schema the web app uses — packages/contracts. */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
