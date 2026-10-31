/** Consume a bearer fragment once per mounted form, even under React StrictMode. */
export function consumeSecretFragmentOnce(consumedRef, fragment, scrubAddressBar) {
  if (consumedRef.current) return undefined;
  consumedRef.current = true;
  const value = new URLSearchParams(String(fragment ?? '').replace(/^#/, '')).get('token') ?? '';
  // Scrub before rendering or submitting any token-dependent UI.
  scrubAddressBar();
  return value;
}
