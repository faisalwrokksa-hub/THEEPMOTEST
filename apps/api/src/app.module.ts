import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { PortfolioModule } from './portfolio/portfolio.module';
import { GovernanceModule } from './governance/governance.module';
import { InsightsModule } from './modules/insights.module';
import { HealthController } from './health.controller';
import { AuthModule } from './auth/auth.module';
import { PlatformModule } from './platform/platform.module';
import { CreatesModule } from './creates/creates.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ExcelModule } from './excel/excel.module';
import { ExportsModule } from './exports/exports.module';
import { NotifyModule } from './notify/notify.module';
import { AskXModule } from './askx/askx.module';
import { MicrosoftModule } from './microsoft/microsoft.module';
import { ModuleGuard } from './platform/module.guard';
import { RequestLogMiddleware } from './common/request-log.middleware';

@Module({
  imports: [
    // Blunt but effective: caps brute-force attempts and runaway clients.
    // A single unnamed throttler registers as 'default', which is what the
    // @Throttle overrides on the login route target.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] }),
    AuthModule, PlatformModule, CreatesModule, OnboardingModule, PortfolioModule, GovernanceModule, InsightsModule,
    ExcelModule, ExportsModule, NotifyModule, AskXModule, MicrosoftModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Licensing is enforced for every route, not just the ones that remember to ask.
    { provide: APP_GUARD, useClass: ModuleGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every /api route is tenant-scoped. /health deliberately is not.
    consumer.apply(RequestLogMiddleware).forRoutes('*');
    // Signed provider callbacks must not require an interactive customer session.
    // Authentication comes exclusively from the raw-body HMAC check.
    consumer.apply(TenantMiddleware)
      .exclude({ path: 'api/v1/onboarding/invitation/accept', method: RequestMethod.POST },
               { path: 'api/v1/billing/reference-webhook', method: RequestMethod.POST },
               { path: 'api/v1/billing/stripe-webhook', method: RequestMethod.POST })
      .forRoutes('api/*');
  }
}
