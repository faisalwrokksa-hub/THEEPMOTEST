/** Tenant policy *validation and evaluation only*. Overrides must be fetched under tenant RLS. */
export const DEFAULT_PORTFOLIO_THRESHOLDS = Object.freeze({overdueDays:0, highRiskCount:3, criticalRiskCount:1, completionWarningPct:70});
const limits = {overdueDays:[0,365], highRiskCount:[1,1000], criticalRiskCount:[1,1000], completionWarningPct:[0,100]};
export function validatePortfolioThresholds(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Policy must be an object');
  const result = {...DEFAULT_PORTFOLIO_THRESHOLDS};
  for (const [key,value] of Object.entries(input)) {
    if (!(key in limits)) throw new Error(`Unknown policy field ${key}`);
    const [min,max] = limits[key];
    if (!Number.isInteger(value) || value<min || value>max) throw new Error(`Invalid threshold ${key}`);
    result[key]=value;
  }
  // Never let a tenant policy disable mandatory approvals or gates.
  return Object.freeze(result);
}
export function evaluatePortfolioThresholds(metrics, policy=DEFAULT_PORTFOLIO_THRESHOLDS) {
  const p=validatePortfolioThresholds(policy);
  const n=(v)=>Number.isFinite(v)&&v>=0?v:0;
  return {criticalRisk:n(metrics.criticalRiskCount)>=p.criticalRiskCount,
    highRisk:n(metrics.highRiskCount)>=p.highRiskCount,
    overdue:n(metrics.overdueDays)>p.overdueDays,
    progressWarning:n(metrics.completionPct)<p.completionWarningPct,
    policy:p};
}
