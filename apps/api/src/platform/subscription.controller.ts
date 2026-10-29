import { Controller, Get, Post } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

/** Tenant-scoped self-service. Never accepts a tenant ID from the request. */
@Controller('api/v1/subscription')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}
  @Get('current') current() { return this.subscriptions.current(); }
  @Get('history') history() { return this.subscriptions.history(); }
  @Get('events') events() { return this.subscriptions.events(); }
  @Get('plans') plans() { return this.subscriptions.plans(); }
  @Post('cancel-at-period-end') cancelAtPeriodEnd() { return this.subscriptions.setCancellation(true); }
  @Post('resume') resume() { return this.subscriptions.setCancellation(false); }
}
