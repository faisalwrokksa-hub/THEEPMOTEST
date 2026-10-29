/** Per-workspace membership changes must not disable the global user account. */
export function removesActiveOwner(
  currentRole: string,
  currentActive: boolean,
  nextRole: string | undefined,
  nextActive: boolean | undefined,
): boolean {
  return currentRole === 'owner' && currentActive &&
    (nextActive === false || (nextRole !== undefined && nextRole !== 'owner'));
}

/** Preserve a recoverable administrator path for the workspace. */
export function mayChangeMembership(
  actorId: string | null,
  memberId: string,
  currentRole: string,
  currentActive: boolean,
  nextRole: string | undefined,
  nextActive: boolean | undefined,
  otherActiveOwners: number,
): { ok: true } | { ok: false; reason: 'self_lockout' | 'last_owner' } {
  if (actorId === memberId && (nextRole !== undefined || nextActive === false))
    return { ok: false, reason: 'self_lockout' };
  if (removesActiveOwner(currentRole, currentActive, nextRole, nextActive) && otherActiveOwners < 1)
    return { ok: false, reason: 'last_owner' };
  return { ok: true };
}
