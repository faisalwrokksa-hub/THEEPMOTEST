import { resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

export const UAT_VARIANTS = Object.freeze([
  { lang: 'en', dir: 'ltr', width: 375, height: 812, name: 'mobile-en' },
  { lang: 'ar', dir: 'rtl', width: 375, height: 812, name: 'mobile-ar' },
  { lang: 'en', dir: 'ltr', width: 1440, height: 900, name: 'desktop-en' },
  { lang: 'ar', dir: 'rtl', width: 1440, height: 900, name: 'desktop-ar' },
]);
export const PUBLIC_ROUTES = Object.freeze(['/login', '/forgot-password', '/accept-invite', '/projects', '/getting-started', '/billing']);
export const SYNTHETIC_ROUTES = Object.freeze(['/', '/projects', '/getting-started', '/billing', '/settings']);
export const PRIVATE_ROUTES = new Set(['/projects', '/getting-started', '/billing']);

export function assertLocalUatOrigin(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('UAT requires a loopback HTTP origin'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('UAT requires a loopback HTTP origin; remote staging/production is not permitted');
  }
  return url.origin;
}

export function assertSyntheticUser(value) {
  if (typeof value !== 'string' || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.test$/i.test(value) || value.length > 254) {
    throw new Error('Authenticated local UAT requires a synthetic .test email account');
  }
  return value;
}

export function assertUatOutputDir(value) {
  const root = resolve(tmpdir());
  const target = resolve(value || `${root}/epmo-browser-uat`);
  if (!target.startsWith(`${root}${sep}`) || target === root) {
    throw new Error('Browser UAT evidence must remain under the system temporary directory');
  }
  return target;
}

export function evidenceName(variant, path) {
  const slug = path === '/' ? 'home' : path.slice(1).replaceAll('/', '-');
  if (!/^[a-z-]+$/.test(slug) || !/^(mobile|desktop)-(en|ar)$/.test(variant)) {
    throw new Error('Unsupported UAT evidence label');
  }
  return `${variant}-${slug}`;
}
