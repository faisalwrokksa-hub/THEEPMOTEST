/** Only the EPMO user who granted delegated Microsoft consent may use the token.
 * Legacy workspace connections without a recorded consenting user fail closed.
 * This guard is a containment measure, not full multi-user OAuth support. */
export function canUseDelegatedMicrosoftConnection(
  connectedBy: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return typeof connectedBy === 'string' && connectedBy.trim().length > 0 &&
    typeof userId === 'string' && userId.trim().length > 0 && connectedBy === userId;
}
