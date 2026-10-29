import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { db, sessions, users, authEvents, memberships, tenants, projects, withTenant } from '@pmo/db';
import { capabilitiesFor } from '@pmo/contracts';

/**
 * Session lifetime, as two independent limits.
 *
 * The absolute window is stamped at sign-in and never extended. The idle
 * window is the one that matters day to day: it ends a session that has
 * simply stopped being used, which is the state an absolute window cannot
 * see. Validated in env.ts, read here — defaults match that schema.
 */
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const SESSION_DAYS = num('SESSION_ABSOLUTE_DAYS', 7);
const IDLE_MS = num('SESSION_IDLE_HOURS', 8) * 3_600_000;

/*
 * `lastSeenAt` is written on every authenticated request, so it is the most
 * frequent write in the system. Against an eight-hour window its precision is
 * irrelevant, so it is only refreshed once a minute — the same protection,
 * a fraction of the writes.
 *
 * It is capped at a quarter of the idle window, which matters only if someone
 * configures a very short one: a refresh interval longer than the window means
 * the stamp is never refreshed before it goes stale, and sessions would then
 * expire while being actively used.
 */
const TOUCH_MS = Math.min(60_000, IDLE_MS / 4);

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const SESSION_COOKIE = 'pmo_session';

/**
 * Deliberately valid bcrypt cost-12 digest for nonexistent accounts.
 * Using an invalid hash makes bcryptjs return early and leaks whether an
 * identifier exists through response timing. No actual account uses this hash.
 */
const DUMMY_PASSWORD_HASH = '$2b$12$ocogzMCUm923tFa3qEscFes9nWzOHiExhSlrifhb7hYStesyiXqwe';
const LOGIN_REJECTED = 'Those credentials are not recognised';

/** The cookie carries a random token; only its sha256 is stored. */
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface Principal {
  userId: string; email: string; displayName: string;
  tenantId: string; tenantName: string; role: string;
  capabilities: string[];
  sessionId: string;
}

@Injectable()
export class AuthService {
  private async record(action: string, o: { email?: string; userId?: string; ip?: string; detail?: string }) {
    await db.insert(authEvents).values({
      action, email: o.email ?? null, userId: o.userId ?? null,
      ip: o.ip ?? null, detail: o.detail ?? null,
    });
  }

  /** `identifier` is an email address or a username — both are unique. */
  async login(identifier: string, password: string, ip?: string, ua?: string) {
    const clean = String(identifier ?? '').trim().toLowerCase();
    if (!clean || !password) throw new BadRequestException('Username and password are required');

    const [user] = await db.select().from(users)
      .where(or(eq(users.email, clean), eq(users.username, clean)))
      .limit(1);

    // Always run a hash comparison so a missing account and a wrong password
    // take the same time — otherwise the response time reveals which emails exist.
    const stored = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const ok = await bcrypt.compare(password, stored);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.record('login.locked', { email: clean, userId: user.id, ip });
      throw new UnauthorizedException(LOGIN_REJECTED);
    }
    if (!user || !ok || !user.isActive) {
      if (user) {
        // Atomic counter: simultaneous failed requests must not overwrite each
        // other using the stale value loaded at the start of login(). After a
        // timed lock expires, restart the counter rather than relocking the
        // account on its very next failed attempt.
        await db.execute(sql`
          UPDATE users SET
            failed_attempts = CASE
              WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
              ELSE failed_attempts + 1 END,
            locked_until = CASE
              WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL
              WHEN failed_attempts + 1 >= ${MAX_FAILED}
                THEN now() + (${LOCK_MINUTES} * interval '1 minute')
              ELSE NULL END
          WHERE id = ${user.id}
        `);
      }
      await this.record('login.fail', { email: clean, userId: user?.id, ip });
      // Deliberately vague: never confirm whether the account exists.
      throw new UnauthorizedException(LOGIN_REJECTED);
    }

    const memberOf = await this.tenantsFor(user.id);
    if (memberOf.length === 0) {
      await this.record('login.fail', { email: clean, userId: user.id, ip, detail: 'no tenant membership' });
      throw new UnauthorizedException(LOGIN_REJECTED);
    }

    const token = randomBytes(32).toString('base64url');
    const [s] = await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      activeTenantId: await this.defaultTenant(memberOf),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5),
      ip: ip ?? null, userAgent: ua?.slice(0, 300) ?? null,
    }).returning();

    await db.update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
    await this.record('login.ok', { email: clean, userId: user.id, ip });

    return { token, sessionId: s.id, expiresAt: s.expiresAt, tenants: memberOf };
  }

  /**
   * Which workspace a fresh sign-in lands in.
   *
   * It used to be whichever workspace sorted first by name. That is fine until
   * someone belongs to an empty one whose name happens to sort early — an
   * owner with three workspaces then lands in the blank one every single time
   * and reasonably concludes the platform has lost their data. So: prefer a
   * workspace that actually holds something, and fall back to the first by
   * name only when none of them do.
   */
  private async defaultTenant(memberOf: { tenantId: string }[]): Promise<string> {
    for (const t of memberOf) {
      const [row] = await withTenant(t.tenantId, (tx) =>
        tx.select({ n: sql<number>`count(*)::int` }).from(projects));
      if (Number(row?.n ?? 0) > 0) return t.tenantId;
    }
    return memberOf[0].tenantId;
  }

  /** Tenants this user may act in — read per tenant so RLS is respected. */
  async tenantsFor(userId: string) {
    const rows = (await db.execute(sql`
      SELECT t.id, t.name, t.slug FROM tenants t ORDER BY t.name
    `)) as unknown as { id: string; name: string; slug: string }[];
    const out: { tenantId: string; name: string; slug: string; role: string }[] = [];
    for (const t of rows) {
      const [m] = await withTenant(t.id, (tx) =>
        tx.select({ role: memberships.role }).from(memberships)
          .where(and(eq(memberships.userId, userId), eq(memberships.isActive, true))).limit(1));
      if (m) {
        const [profile] = await withTenant(t.id, tx => tx.execute(sql`
          SELECT display_name AS name FROM tenant_profiles WHERE tenant_id=${t.id} LIMIT 1`)) as unknown as {name:string}[];
        out.push({ tenantId: t.id, name: profile?.name ?? t.name, slug: t.slug, role: m.role });
      }
    }
    return out;
  }

  /** Resolve a cookie into a principal, or null. Enforces both session windows. */
  async principal(token?: string): Promise<Principal | null> {
    if (!token) return null;
    const [s] = await db.select().from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)))).limit(1);
    if (!s) return null;

    // Expired outright, or left untouched for longer than the idle window.
    // Either way the row goes, so a replayed cookie cannot resurrect it.
    const now = Date.now();
    const idleFor = now - s.lastSeenAt.getTime();
    if (s.expiresAt.getTime() <= now || idleFor > IDLE_MS) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
      return null;
    }

    const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u || !u.isActive) {
      // A disabled account must not regain its old sessions after reactivation.
      await db.delete(sessions).where(eq(sessions.id, s.id));
      return null;
    }

    const tenantId = s.activeTenantId;
    if (!tenantId) return null;
    const [m] = await withTenant(tenantId, (tx) =>
      tx.select({ role: memberships.role }).from(memberships)
        .where(and(eq(memberships.userId, u.id), eq(memberships.isActive, true))).limit(1));
    if (!m) {
      // A suspended/revoked membership must not revive a session when restored.
      // Reauthentication is required to establish a fresh session.
      await db.delete(sessions).where(eq(sessions.id, s.id));
      return null;
    }

    const [t] = await withTenant(tenantId, tx => tx.execute(sql`
      SELECT COALESCE(p.display_name,t.name) AS name
      FROM tenants t LEFT JOIN tenant_profiles p ON p.tenant_id=t.id
      WHERE t.id=${tenantId} LIMIT 1`)) as unknown as {name:string}[];
    if (idleFor > TOUCH_MS) {
      await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, s.id));
    }

    return {
      userId: u.id, email: u.email, displayName: u.displayName,
      tenantId, tenantName: t?.name ?? 'Unknown', role: m.role,
      // Platform administration comes from the person, not the membership.
      capabilities: u.isPlatformAdmin
        ? [...capabilitiesFor(m.role), 'pmoa_platform' as const]
        : capabilitiesFor(m.role),
      sessionId: s.id,
    };
  }

  /** Switch the active tenant — only to one the user is genuinely a member of. */
  async switchTenant(token: string, tenantId: string) {
    const p = await this.principal(token);
    if (!p) throw new UnauthorizedException('Not signed in');
    const allowed = await this.tenantsFor(p.userId);
    if (!allowed.some((t) => t.tenantId === tenantId)) {
      await this.record('tenant.switch.denied', { userId: p.userId, detail: tenantId });
      throw new UnauthorizedException('You are not a member of that workspace');
    }
    await db.update(sessions).set({ activeTenantId: tenantId }).where(eq(sessions.id, p.sessionId));
    return { ok: true };
  }

  async logout(token?: string) {
    if (!token) return { ok: true };
    const [s] = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token))).limit(1);
    if (s) {
      await db.delete(sessions).where(eq(sessions.id, s.id));
      await this.record('logout', { userId: s.userId });
    }
    return { ok: true };
  }

  /**
   * Emergency account-wide sign-out. Authenticate using the actual session
   * cookie, not a caller-supplied user ID or tenant header. A person can have
   * sessions in several organizations, so revoke by global user ID.
   * Commit the security audit event together with the deletions.
   */
  async logoutEverywhere(token?: string) {
    const principal = await this.principal(token);
    if (!principal) throw new UnauthorizedException('Not signed in');

    return db.transaction(async (tx) => {
      const revoked = await tx.delete(sessions)
        .where(eq(sessions.userId, principal.userId))
        .returning({ id: sessions.id });
      await tx.insert(authEvents).values({
        action: 'logout.all', userId: principal.userId,
        detail: `revoked_sessions=${revoked.length}`,
      });
      return { ok: true, revokedSessions: revoked.length };
    });
  }

  /** Housekeeping — neither expired nor abandoned sessions are left lying around. */
  async pruneSessions() {
    const now = new Date();
    const r = await db.delete(sessions).where(or(
      lt(sessions.expiresAt, now),
      lt(sessions.lastSeenAt, new Date(now.getTime() - IDLE_MS)),
    )).returning();
    return { removed: r.length };
  }

  static hash(password: string) { return bcrypt.hash(password, 12); }
  static safeEqual(a: string, b: string) {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
