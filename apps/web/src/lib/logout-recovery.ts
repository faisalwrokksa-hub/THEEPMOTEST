import { NextRequest, NextResponse } from 'next/server';

/**
 * A native sign-out form must not strand a customer on a raw JSON error page
 * when session revocation cannot be confirmed. Preserve the cookie and HTTP
 * 503, offer an accessible retry, and keep JSON for non-browser clients.
 */
export function logoutFailureResponse(req: NextRequest, allDevices: boolean): NextResponse {
  const ar = req.cookies.get('pmo_lang')?.value === 'ar';
  const title = allDevices
    ? (ar ? 'تعذّر تأكيد تسجيل الخروج من جميع الأجهزة' : 'Could not confirm sign-out on all devices')
    : (ar ? 'تعذّر تأكيد تسجيل الخروج' : 'Could not confirm sign-out');
  const detail = ar
    ? 'قد تظل جلستك نشطة. لم نتمكن من تأكيد تسجيل الخروج. يرجى إعادة المحاولة.'
    : 'Your session may still be active. Sign-out was not confirmed. Please try again.';
  const retry = ar ? 'إعادة محاولة تسجيل الخروج' : 'Retry sign-out';
  const back = ar ? 'العودة إلى مساحة العمل' : 'Return to workspace';
  const action = allDevices ? '/api/session/logout-all' : '/api/session/logout';
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

  if (req.headers.get('accept')?.includes('text/html')) {
    // Every interpolated value comes from a fixed translation or route literal.
    // Never include session tokens, backend error text, or user input in HTML.
    const html = `<!doctype html>
<html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body><main><h1>${title}</h1><p role="alert">${detail}</p>
<form method="post" action="${action}"><button type="submit">${retry}</button></form>
<p><a href="/">${back}</a></p></main></body></html>`;
    return new NextResponse(html, {
      status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.json({ error: allDevices
    ? 'Could not confirm sign-out on all devices. Please retry.'
    : 'Could not confirm sign-out. Please retry.' },
  { status: 503, headers });
}
