import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { db, users } from '@pmo/db';
import { buildTransport } from '../notify/transport';
import { hashRecoveryToken, issueRecoveryToken, recoveryLink, recoveryMessage } from './recovery-policy';

const GENERIC = { ok: true, message: 'If this address has an active account, a recovery link will be emailed.' };
const rows = (r: unknown) => r as any[];

@Injectable()
export class RecoveryService {
  /** Always give the same response for unknown, disabled, cooled-down and valid accounts. */
  async request(email: string, lang: 'en' | 'ar') {
    // Fail visibly for ALL addresses when recovery has not been configured.
    const transport = buildTransport();
    if (!transport.delivers) throw new ServiceUnavailableException('Password recovery email is unavailable. Contact support.');
    const origin = (process.env.WEB_ORIGIN ?? '').split(',')[0]?.trim();
    if (!origin) throw new ServiceUnavailableException('Password recovery is not configured. Contact support.');
    const { token, hash } = issueRecoveryToken();
    let link: string;
    try { link = recoveryLink(origin, token); }
    catch { throw new ServiceUnavailableException('Password recovery requires a secure web origin.'); }
    const [user] = await db.select({ id: users.id, email: users.email, active: users.isActive })
      .from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (!user?.active) return GENERIC;
    // A per-user cooldown supplements the per-IP endpoint throttle. Lock even
    // when concurrent requests arrive through different proxy IP addresses.
    const issued = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(2207, hashtext(${user.id}))`);
      const [recent] = rows(await tx.execute(sql`
        SELECT user_id FROM auth_password_resets WHERE user_id=${user.id}
          AND created_at > now() - interval '15 minutes'
          AND revoked_at IS NULL LIMIT 1`));
      if (recent) return false;
      const [created] = rows(await tx.execute(sql`INSERT INTO auth_password_resets (user_id, token_hash, expires_at)
        VALUES (${user.id},${hash},now()+interval '30 minutes') RETURNING id`));
      return { id: created.id as string };
    });
    if (!issued) return GENERIC;
    let delivered = false;
    try {
      const result = await transport.send({ to: user.email, ...recoveryMessage(link, lang), lang });
      delivered = result.ok;
    } catch { /* Do not log raw provider errors or bearer URLs. */ }
    if (!delivered) {
      // Failed delivery must not leave an eligible bearer token behind.
      await db.execute(sql`UPDATE auth_password_resets SET revoked_at=now()
        WHERE id=${issued.id} AND consumed_at IS NULL AND revoked_at IS NULL`);
    }
    return GENERIC;
  }

  /** Validate a single-use token inside the privileged DB function. */
  async reset(token: string, password: string) {
    let hash: string;
    try { hash = hashRecoveryToken(token); }
    catch { throw new BadRequestException('Recovery link is invalid or expired'); }
    // Hash BEFORE obtaining the row locks. pmo_app cannot update users.password_hash.
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = rows(await db.execute(sql`
      SELECT public.pmo_redeem_password_reset(${hash},${passwordHash}) AS ok`));
    if (result?.ok !== true) throw new BadRequestException('Recovery link is invalid or expired');
    return { ok: true, message: 'Password updated. All existing sessions have been signed out.' };
  }
}
