import { cookies } from 'next/headers';
import { translator, type Lang, type T } from './i18n-dict';

export { translator, term, type Lang, type T } from './i18n-dict';

/** The language for this request. A cookie, so it survives a full page load. */
export async function getLang(): Promise<Lang> {
  return (await cookies()).get('pmo_lang')?.value === 'ar' ? 'ar' : 'en';
}

/** The common case in a server component: read the cookie, get the function. */
export async function tr(): Promise<T> {
  return translator(await getLang());
}
