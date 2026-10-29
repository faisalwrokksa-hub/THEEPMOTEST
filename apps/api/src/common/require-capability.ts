import { ForbiddenException } from '@nestjs/common';
import { can, type Capability } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';

/**
 * Authorisation is checked per capability, never per role — so adding a role
 * never means revisiting a guard. Throws 403 with the capability it wanted,
 * which makes a permission bug obvious instead of mysterious.
 */
export function requireCapability(needed: Capability) {
  const { role, capabilities } = currentContext();
  // Fail closed: an empty authenticated capability list grants no permissions.
  // Never reconstruct privileges from a role when the request grants none.
  const held = capabilities ?? [];
  if (!can(held, needed))
    throw new ForbiddenException(`Your role (${role}) lacks the ${needed} capability`);
}
