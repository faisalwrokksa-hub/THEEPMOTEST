import { Module, Global } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { ModuleGuard } from './module.guard';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { BillingController, BillingWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeBillingService } from './stripe.service';

/**
 * The module catalogue is licensing data. The application role can read it but
 * not write it — otherwise a compromised app could grant itself entitlements.
 * It is seeded by `pnpm db:modules`, which runs with admin rights.
 */
@Global()
@Module({
  controllers: [PlatformController, SubscriptionController, SuperAdminController, BillingController, BillingWebhookController],
  providers: [PlatformService, ModuleGuard, SubscriptionService, SuperAdminService, BillingService, StripeBillingService],
  exports: [PlatformService, ModuleGuard],
})
export class PlatformModule {}
