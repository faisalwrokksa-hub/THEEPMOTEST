import { Body, Controller, Get, Post, Req, Res, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Throttle } from '@nestjs/throttler';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { RecoveryService } from './recovery.service';
import { requiresSecureTransport } from '../common/deployment-policy';

/** Accepts `identifier` (email or username). `email` stays valid as an alias. */
const loginBody = z.object({
  identifier: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().min(1).max(200).optional(),
  password: z.string().min(1).max(200),
}).refine((b) => b.identifier || b.email, {
  message: 'Provide a username or email address', path: ['identifier'],
});


const recoveryRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  lang: z.enum(['ar', 'en']).default('en'),
}).strict();
const recoveryReset = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(200),
}).strict();

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly recovery: RecoveryService) {}

  /**
   * Tighter than the global limit: 8 sign-in attempts a minute per IP.
   * Raised only for automated tests, which sign in dozens of times a run;
   * loadEnv() refuses a loose value in production.
   */
  @Throttle({ default: { ttl: 60_000, limit: Number(process.env.LOGIN_RATE_LIMIT ?? 8) } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginBody)) body: any, @Req() req: Request, @Res() res: Response) {
    const who = body.identifier ?? body.email;
    const out = await this.auth.login(who, body.password, req.ip, req.get('user-agent') ?? undefined);
    res.cookie(SESSION_COOKIE, out.token, {
      httpOnly: true,          // JavaScript can never read it
      secure: requiresSecureTransport(process.env.NODE_ENV, process.env.DEPLOYMENT_ENV), // HTTPS-only in staging and production
      sameSite: 'lax',
      path: '/',
      expires: out.expiresAt,
    });
    res.json({ ok: true, tenants: out.tenants });
  }

  /** Public recovery initiation: response does not disclose account existence. */
  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  @Post('password-recovery/request')
  @HttpCode(200)
  requestPasswordRecovery(@Body(new ZodPipe(recoveryRequest)) body: any) {
    return this.recovery.request(body.email, body.lang);
  }

  /** Only a valid emailed single-use token can change a password. */
  @Throttle({ default: { ttl: 900_000, limit: 6 } })
  @Post('password-recovery/reset')
  @HttpCode(200)
  resetPassword(@Body(new ZodPipe(recoveryReset)) body: any) {
    return this.recovery.reset(body.token, body.password);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  /** Revoke every session for the signed-in person, in every workspace. */
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@Req() req: Request, @Res() res: Response) {
    const out = await this.auth.logoutEverywhere(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json(out);
  }

  @Get('session')
  async session(@Req() req: Request) {
    const p = await this.auth.principal(req.cookies?.[SESSION_COOKIE]);
    if (!p) return { authenticated: false };
    const tenants = await this.auth.tenantsFor(p.userId);
    return { authenticated: true, ...p, sessionId: undefined, tenants };
  }

  @Post('switch-tenant')
  @HttpCode(200)
  switchTenant(@Body(new ZodPipe(z.object({ tenantId: z.string().uuid() }))) b: any,
               @Req() req: Request) {
    return this.auth.switchTenant(req.cookies?.[SESSION_COOKIE], b.tenantId);
  }
}
