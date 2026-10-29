import { createHash, randomBytes } from 'node:crypto';

const opaque = /^[A-Za-z0-9_-]{43}$/;

/** 256-bit bearer token, never stored, logged, or returned from an HTTP request. */
export function issueRecoveryToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRecoveryToken(token) };
}
export function hashRecoveryToken(token: string): string {
  if (!opaque.test(token)) throw new Error('Invalid recovery token');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
export function recoveryLink(webOrigin: string, token: string): string {
  if (!opaque.test(token)) throw new Error('Invalid recovery token');
  const url = new URL(webOrigin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))))
    throw new Error('Password recovery requires a trusted HTTPS origin');
  url.pathname = '/reset-password';
  // The secret stays in the fragment, not in CDN/server request logs or the Referer.
  url.hash = `token=${token}`;
  return url.toString();
}
export function recoveryMessage(link: string, lang: 'en' | 'ar') {
  return lang === 'ar' ? {
    subject: 'إعادة تعيين كلمة المرور — The EPMO',
    body: `تم طلب إعادة تعيين كلمة مرورك في The EPMO.\n\nاستخدم الرابط التالي خلال 30 دقيقة:\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
  } : {
    subject: 'Reset your The EPMO password',
    body: `Someone requested a password reset for your The EPMO account.\n\nUse this link within 30 minutes:\n${link}\n\nIf you didn't request this, ignore this email.`,
  };
}
