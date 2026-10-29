export function isCreateSuccess(
  status: number,
  payload: unknown,
  currentOrigin?: string,
): payload is { ok: true; redirect: string };
