export type CustomerSubscription = {
  id: string; status: string; periodStartsAt: string; periodEndsAt: string;
  trialEndsAt?: string | null; cancelAtPeriodEnd?: boolean; planCode: string;
  planName?: string; priceMinor?: number; currency?: string; billingInterval?: string;
};
export declare const SUBSCRIPTION_STATUSES: readonly string[];
export declare function effectiveSubscriptionStatus(subscription: CustomerSubscription | null, now?: Date | string): string;
export declare function daysUntil(isoDate: string | null | undefined, now?: Date | string): number | null;
export declare function formatBillingMoney(minor: number, currency: string, locale?: string): string;
export declare function formatBillingDate(date: string | null | undefined, locale?: string): string;
export declare function availableBillingActions(subscription: CustomerSubscription | null, now?: Date | string): {
  invoice: boolean; scheduleCancellation: boolean; resume: boolean;
};
