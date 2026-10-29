import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { OnboardingService } from './onboarding.service';
import { acceptInput, inviteInput, profileInput } from './onboarding.schemas';

/** Onboarding belongs to the always-available core module, not a paid module. */
@Controller('api/v1/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('status') status() { return this.onboarding.status(); }
  @Get('profile') profile() { return this.onboarding.profile(); }
  @Patch('profile') updateProfile(@Body(new ZodPipe(profileInput)) b: any) { return this.onboarding.updateProfile(b); }
  @Get('invitations') invitations() { return this.onboarding.invitations(); }
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('invitations') invite(@Body(new ZodPipe(inviteInput)) b: any) { return this.onboarding.invite(b); }
  @Post('invitations/:id/revoke') revoke(
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
  ) { return this.onboarding.revoke(id); }

  // Public bearer-token redemption. IP throttling, expiry, database row-lock and
  // token hash checks apply; no tenant id is accepted from a form field.
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @Post('invitation/accept')
  accept(@Body(new ZodPipe(acceptInput)) b: any) { return this.onboarding.accept(b); }
}
