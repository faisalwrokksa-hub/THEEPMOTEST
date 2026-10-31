/** Local disposable customer journey acceptance only. No live accounts or staging claims. */
import { assertLocalUatOrigin, assertSyntheticUser, assertUatOutputDir } from './frontend-browser-uat-policy.mjs';

export const JOURNEY_VARIANTS = Object.freeze([
  Object.freeze({ name: 'mobile-ar', width: 375, height: 812, lang: 'ar', dir: 'rtl' }),
  Object.freeze({ name: 'desktop-en', width: 1440, height: 900, lang: 'en', dir: 'ltr' }),
]);

export function journeyConfiguration(env) {
  const origin = assertLocalUatOrigin(env.EPMO_UAT_URL || 'http://127.0.0.1:3000');
  const out = assertUatOutputDir(env.EPMO_UAT_OUT);
  const admin = assertSyntheticUser(env.EPMO_JOURNEY_ADMIN_USER);
  const restricted = assertSyntheticUser(env.EPMO_JOURNEY_RESTRICTED_USER);
  if (admin.toLowerCase() === restricted.toLowerCase()) throw new Error('Journey roles require distinct synthetic accounts');
  if (!env.EPMO_JOURNEY_ADMIN_PASSWORD || !env.EPMO_JOURNEY_RESTRICTED_PASSWORD)
    throw new Error('Journey roles require both local synthetic passwords');
  return { origin, out, admin, restricted };
}

export function assertJourneyLayout(state, variant) {
  if (!state || state.lang !== variant.lang || state.dir !== variant.dir)
    throw new Error('locale_direction_failed');
  if (state.heading !== true) throw new Error('missing_heading');
  if (!Number.isFinite(state.scrollWidth) || state.scrollWidth > variant.width + 2)
    throw new Error('horizontal_overflow');
}

export function assertMutationRedirect(status, location, origin, expected) {
  if (status !== 303 || typeof location !== 'string') throw new Error('mutation_not_rejected');
  let url;
  try { url = new URL(location, origin); } catch { throw new Error('unsafe_mutation_redirect'); }
  if (url.origin !== origin || url.username || url.password || url.hash || url.pathname !== expected.path)
    throw new Error('unsafe_mutation_redirect');
  if (url.searchParams.get(expected.key) !== expected.value || [...url.searchParams.keys()].length !== 1)
    throw new Error('unexpected_mutation_feedback');
}
