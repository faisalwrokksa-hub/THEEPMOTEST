import { readFileSync } from 'node:fs';
const s = readFileSync('apps/api/src/tenancy/tenant.middleware.ts', 'utf8');
const checks = [
  ['Header authentication disabled in production', s.includes("process.env.NODE_ENV === 'development'") && s.includes("process.env.DEPLOYMENT_ENV === 'development'") && s.includes("process.env.ALLOW_HEADER_AUTH === 'true'")],
  ['Header authentication only over loopback', s.includes("['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress")],
  ['Header authentication requires a user', s.includes("if (!userId) throw new UnauthorizedException")],
  ['Membership lookup scopes both tenant and user', s.includes('and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), eq(memberships.isActive, true))')],
  ['Inactive membership rejected', s.includes('eq(memberships.isActive, true)')],
  ['Missing membership rejected', s.includes("if (!m) throw new UnauthorizedException")],
];
for (const [label, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
if (checks.some(([, pass]) => !pass)) process.exitCode = 1;
