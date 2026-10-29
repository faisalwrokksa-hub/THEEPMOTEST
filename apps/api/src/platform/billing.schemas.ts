import { z } from 'zod';
/** Reference HMAC event schema; not a native event from Moyasar/HyperPay/Stripe. */
export const referenceSettlementSchema = z.object({
  eventId: z.string().min(5).max(128).regex(/^[a-zA-Z0-9_:-]+$/),
  paymentId: z.string().min(5).max(128).regex(/^[a-zA-Z0-9_:-]+$/),
  eventType: z.literal('payment.succeeded'),
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
}).strict();
export type ReferenceSettlement = z.infer<typeof referenceSettlementSchema>;
