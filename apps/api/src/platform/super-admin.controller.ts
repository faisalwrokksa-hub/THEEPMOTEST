import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ZodPipe } from '../common/zod.pipe';
import { SuperAdminService } from './super-admin.service';
import { planCreate, planUpdate, manualGrant, adminCancel } from './super-admin.schemas';

/** Platform-wide licensing operations; every method re-verifies the vendor flag. */
@Controller('api/v1/super-admin')
export class SuperAdminController {
  constructor(private readonly admin: SuperAdminService) {}

  @Get('plans') plans() { return this.admin.plans(); }
  @Get('audit') audit() { return this.admin.audit(); }
  @Post('plans') createPlan(@Body(new ZodPipe(planCreate)) body: any) { return this.admin.createPlan(body); }
  @Patch('plans/:code') updatePlan(@Param('code') code: string, @Body(new ZodPipe(planUpdate)) body: any) {
    return this.admin.updatePlan(code, body);
  }
  @Get('tenants') tenants(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.admin.tenants(limit, offset);
  }
  @Get('tenants/:tenantId/subscriptions') history(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.admin.history(tenantId);
  }
  @Post('tenants/:tenantId/subscriptions') provision(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body(new ZodPipe(manualGrant)) body: any,
  ) { return this.admin.provision(tenantId, body); }
  @Post('tenants/:tenantId/subscriptions/:subscriptionId/cancel') cancel(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @Body(new ZodPipe(adminCancel)) body: any,
  ) { return this.admin.cancel(tenantId, subscriptionId, body); }
}
