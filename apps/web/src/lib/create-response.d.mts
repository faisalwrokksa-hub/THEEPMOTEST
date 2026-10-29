export function isCreateSuccess(
  status: number,
  payload: unknown,
): payload is { ok: true; redirect: string };
