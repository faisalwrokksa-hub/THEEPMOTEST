import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { buildTransport } from '../notify/transport';
import { computeOnboardingProgress } from './onboarding-progress';
import { makeInvitationToken, parseInvitationToken, isInvitationAcceptable, invitationLink } from './invitation-policy';
import type { AcceptInput, InviteInput, ProfileInput } from './onboarding.schemas';

const rows = (r: unknown) => r as any[];

@Injectable()
export class OnboardingService {
  async status() {
    requireCapability('read');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async (tx) => {
      const records = rows(await tx.execute(sql`
        SELECT t.id AS "tenantId", COALESCE(p.display_name,t.name) AS "tenantName",
          t.slug AS "tenantSlug",
          (SELECT count(*)::int FROM memberships m WHERE m.tenant_id = ${tenantId} AND m.is_active=true) AS members,
          (SELECT count(*)::int FROM portfolios x WHERE x.tenant_id = ${tenantId}) AS portfolios,
          (SELECT count(*)::int FROM programs x WHERE x.tenant_id = ${tenantId}) AS programs,
          (SELECT count(*)::int FROM projects x WHERE x.tenant_id = ${tenantId}) AS projects
        FROM tenants t LEFT JOIN tenant_profiles p ON p.tenant_id = t.id
        WHERE t.id = ${tenantId} LIMIT 1`));
      const record = records[0];
      if (!record) throw new NotFoundException('Workspace not found');
      return {
        tenant: { id: record.tenantId, name: record.tenantName, slug: record.tenantSlug },
        ...computeOnboardingProgress(record),
      };
    });
  }

  async profile() {
    requireCapability('read');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => {
      const [profile] = rows(await tx.execute(sql`
        SELECT t.id, t.slug, COALESCE(p.display_name, t.name) AS "displayName",
               p.name_ar AS "nameAr", p.contact_email AS "contactEmail"
        FROM tenants t LEFT JOIN tenant_profiles p ON p.tenant_id = t.id
        WHERE t.id = ${tenantId} LIMIT 1`));
      if (!profile) throw new NotFoundException('Workspace not found');
      return profile;
    });
  }

  async updateProfile(body: ProfileInput) {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = currentContext();
    if (!userId) throw new ForbiddenException('Authenticated administrator required');
    return withTenant(tenantId, async tx => {
      const [exists] = rows(await tx.execute(sql`SELECT id FROM tenants WHERE id = ${tenantId} LIMIT 1`));
      if (!exists) throw new NotFoundException('Workspace not found');
      await tx.execute(sql`
        INSERT INTO tenant_profiles(tenant_id,display_name,name_ar,contact_email,updated_by)
        VALUES (${tenantId},${body.displayName},${body.nameAr ?? null},${body.contactEmail ?? null},${userId})
        ON CONFLICT (tenant_id) DO UPDATE SET
        display_name=excluded.display_name, name_ar=excluded.name_ar,
        contact_email=excluded.contact_email, updated_at=now(), updated_by=excluded.updated_by`);
      await tx.execute(sql`INSERT INTO audit_events(tenant_id,actor_id,entity,entity_id,action,diff)
        VALUES (${tenantId},${userId},'workspace_profile',${tenantId},'workspace.profile_updated',
          ${JSON.stringify({ displayName: body.displayName, nameAr: body.nameAr ?? null, contactEmail: body.contactEmail ?? null })}::jsonb)`);
      return { ok: true };
    });
  }

  async invitations() {
    requireCapability('pmoa_manage_people');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT id,email,role,delivery_status AS "deliveryStatus",
             expires_at AS "expiresAt",created_at AS "createdAt",
             consumed_at AS "consumedAt",revoked_at AS "revokedAt"
      FROM tenant_invitations WHERE tenant_id=${tenantId}
      ORDER BY created_at DESC,id DESC LIMIT 100`)));
  }

  async invite(body: InviteInput) {
    requireCapability('pmoa_manage_people');
    const { tenantId, userId } = currentContext();
    if (!userId) throw new ForbiddenException('Authenticated administrator required');
    const transport = buildTransport();
    // Never hand a bearer invitation URL back to the administrator or log it.
    if (!transport.delivers) throw new ServiceUnavailableException('Email delivery is not configured. Configure MAIL_TRANSPORT=ses and MAIL_FROM first.');
    const webOrigin = (process.env.WEB_ORIGIN ?? '').split(',')[0]?.trim();
    if (!webOrigin) throw new ServiceUnavailableException('WEB_ORIGIN is not configured');
    const { token, hash } = makeInvitationToken(tenantId);
    let link: string;
    try { link = invitationLink(webOrigin, token); }
    catch { throw new ServiceUnavailableException('Invitation link requires a trusted HTTPS web origin'); }

    const created = await withTenant(tenantId, async tx => {
      // Reissue only after an old invitation has been revoked or has expired.
      await tx.execute(sql`UPDATE tenant_invitations SET revoked_at=now()
        WHERE tenant_id=${tenantId} AND email=${body.email} AND consumed_at IS NULL
          AND revoked_at IS NULL AND expires_at<=now()`);
      const [member] = rows(await tx.execute(sql`
        SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id
        WHERE m.tenant_id=${tenantId} AND lower(u.email)=${body.email} LIMIT 1`));
      if (member) throw new ConflictException('That address already belongs to this workspace');
      const [pending] = rows(await tx.execute(sql`SELECT id FROM tenant_invitations
        WHERE tenant_id=${tenantId} AND email=${body.email} AND consumed_at IS NULL
          AND revoked_at IS NULL LIMIT 1`));
      if (pending) throw new ConflictException('There is already an invitation for that address; revoke it before reissuing');
      const [invitation] = rows(await tx.execute(sql`
        INSERT INTO tenant_invitations(tenant_id,email,role,token_hash,expires_at,invited_by)
        VALUES (${tenantId},${body.email},${body.role}::member_role,${hash},now()+interval '72 hours',${userId})
        ON CONFLICT DO NOTHING RETURNING id,expires_at AS "expiresAt"`));
      if (!invitation) throw new ConflictException('An invitation already exists for this address');
      await tx.execute(sql`INSERT INTO audit_events(tenant_id,actor_id,entity,entity_id,action,diff)
        VALUES (${tenantId},${userId},'tenant_invitation',${invitation.id},'invitation.created',
                ${JSON.stringify({ role: body.role })}::jsonb)`);
      return invitation;
    });
    // Send OUTSIDE the transaction so slow mail does not hold database locks.
    const message = body.lang === 'ar' ? {
      subject: 'دعوة للانضمام إلى The EPMO',
      body: `تمت دعوتك إلى مساحة عمل في The EPMO. الرابط صالح لمدة 72 ساعة ويُستخدم مرة واحدة:\n${link}\nإذا لم تكن تتوقع هذه الدعوة فتجاهل الرسالة.`,
    } : {
      subject: 'Your The EPMO workspace invitation',
      body: `You have been invited to a The EPMO workspace. This link expires in 72 hours and can be used once:\n${link}\nIf you did not expect this invitation, ignore this email.`,
    };
    // Providers can reject with either {ok:false} or a thrown exception.
    // Both paths must revoke the pending bearer token; otherwise an outage
    // strands an unusable invitation until its 72-hour expiry.
    let result: { ok: boolean } = { ok: false };
    try {
      result = await transport.send({ to: body.email, ...message, lang: body.lang });
    } catch {
      // Do not expose mail transport internals or bearer links to callers.
      result = { ok: false };
    }
    await withTenant(tenantId, async tx => {
      await tx.execute(sql`UPDATE tenant_invitations
        SET delivery_status=${result.ok ? 'sent' : 'failed'},
            revoked_at=CASE WHEN ${result.ok} THEN revoked_at ELSE now() END
        WHERE id=${created.id} AND tenant_id=${tenantId} AND delivery_status='pending'`);
    });
    if (!result.ok) throw new ServiceUnavailableException('Email delivery failed; the invitation has been invalidated.');
    return { id: created.id, email: body.email, role: body.role, expiresAt: created.expiresAt, deliveryStatus: 'sent' };
  }

  async revoke(id: string) {
    requireCapability('pmoa_manage_people');
    const { tenantId, userId } = currentContext();
    return withTenant(tenantId, async tx => {
      const [changed] = rows(await tx.execute(sql`UPDATE tenant_invitations
        SET revoked_at=now() WHERE id=${id} AND tenant_id=${tenantId}
          AND consumed_at IS NULL AND revoked_at IS NULL
        RETURNING id`));
      if (!changed) throw new NotFoundException('Active invitation not found');
      await tx.execute(sql`INSERT INTO audit_events(tenant_id,actor_id,entity,entity_id,action)
        VALUES (${tenantId},${userId},'tenant_invitation',${id},'invitation.revoked')`);
      return { ok: true };
    });
  }

  /** An emailed bearer token is proof of mailbox access, not a session. */
  async accept(body: AcceptInput) {
    const parsed = parseInvitationToken(body.token);
    if (!parsed) throw new BadRequestException('Invalid or expired invitation');
    // Reject forged tokens before an expensive bcrypt computation. Still
    // re-check under the row lock below to defeat concurrent redemption.
    const [preflight] = await withTenant(parsed.tenantId, async tx => rows(await tx.execute(sql`
      SELECT delivery_status AS "deliveryStatus", expires_at AS "expiresAt",
             consumed_at AS "consumedAt", revoked_at AS "revokedAt"
      FROM tenant_invitations WHERE tenant_id=${parsed.tenantId} AND token_hash=${parsed.hash}
      LIMIT 1`)));
    if (!preflight || !isInvitationAcceptable(preflight))
      throw new BadRequestException('Invalid or expired invitation');
    // Hash outside the row-locked transaction, only after token validation.
    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
    return withTenant(parsed.tenantId, async tx => {
      // Locking is critical: two concurrent requests must not each accept once.
      const [inv] = rows(await tx.execute(sql`
        SELECT id,email,role,delivery_status AS "deliveryStatus",expires_at AS "expiresAt",
               consumed_at AS "consumedAt",revoked_at AS "revokedAt"
        FROM tenant_invitations
        WHERE tenant_id=${parsed.tenantId} AND token_hash=${parsed.hash}
        FOR UPDATE`));
      if (!inv || !isInvitationAcceptable(inv)) throw new BadRequestException('Invalid or expired invitation');
      let [user] = rows(await tx.execute(sql`
        SELECT id,is_active AS "isActive" FROM users WHERE lower(email)=${inv.email} LIMIT 1`));
      if (!user) {
        if (!passwordHash || !body.displayName)
          throw new BadRequestException('New members must provide a name and password of at least 12 characters');
        // Existing credentials are NEVER changed by accepting a workspace invitation.
        const added = rows(await tx.execute(sql`
          INSERT INTO users(email,display_name,password_hash)
          VALUES (${inv.email},${body.displayName},${passwordHash})
          ON CONFLICT (email) DO NOTHING RETURNING id,is_active AS "isActive"`));
        user = added[0] ?? rows(await tx.execute(sql`
          SELECT id,is_active AS "isActive" FROM users WHERE lower(email)=${inv.email} LIMIT 1`))[0];
      }
      if (!user?.isActive) throw new ForbiddenException('This account is not active');
      const [existing] = rows(await tx.execute(sql`SELECT 1 FROM memberships
        WHERE tenant_id=${parsed.tenantId} AND user_id=${user.id} LIMIT 1`));
      if (existing) throw new ConflictException('This account is already a member');
      await tx.execute(sql`INSERT INTO memberships(tenant_id,user_id,role)
        VALUES (${parsed.tenantId},${user.id},${inv.role}::member_role)`);
      await tx.execute(sql`UPDATE tenant_invitations SET consumed_at=now(), accepted_by=${user.id}
        WHERE id=${inv.id} AND tenant_id=${parsed.tenantId}`);
      await tx.execute(sql`INSERT INTO audit_events(tenant_id,actor_id,entity,entity_id,action,diff)
        VALUES (${parsed.tenantId},${user.id},'membership',${user.id},'invitation.accepted',
          ${JSON.stringify({ role: inv.role })}::jsonb)`);
      return { ok: true, message: 'Invitation accepted. Sign in to access your workspace.' };
    });
  }
}
