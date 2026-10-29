import { Controller, Get, Post } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { TrendsService } from './trends.service';
import { RequiresModule } from '../platform/module.guard';
import { requireCapability } from '../common/require-capability';
import { currentContext } from '../tenancy/tenant-context';

@Controller('api/v1')
export class InsightsController {
  constructor(private readonly svc: InsightsService,
              private readonly trends_: TrendsService) {}
  @Get('overview')   overview()   { return this.svc.overview(); }
  @RequiresModule('analytics360')
  @Get('trends')     trends()     { return this.trends_.trends(); }

  /** Photograph the portfolio now rather than waiting for tonight. */
  @RequiresModule('analytics360')
  @Post('trends/capture')
  async capture() {
    requireCapability('pmoa_admin');
    await this.trends_.captureTenant(currentContext().tenantId);
    return { workspaces: 1 };
  }
  @Get('my-work')    myWork()     { return this.svc.myWork(); }
  @Get('activity')   activity()   { return this.svc.activity(); }
  @RequiresModule('finance360')
  @Get('financials') financials() {
    requireCapability('pmoa_view_financials');
    return this.svc.financials();
  }
  @RequiresModule('benefits360')
  @Get('benefits') benefits() {
    requireCapability('pmoa_view_financials');
    return this.svc.benefits();
  }
  @RequiresModule('hr360')
  @Get('resources')  resources()  { return this.svc.resources(); }
  @RequiresModule('pmo360')
  @Get('schedule')   schedule()   { return this.svc.schedule(); }
  @Get('studio')     studio()     { return this.svc.studio(); }
  @RequiresModule('analytics360')
  @Get('reports')    reports()    { return this.svc.reports(); }
  @Get('me')           me()           { return this.svc.me(); }
  @Get('create-options') createOptions() { return this.svc.createOptions(); }
  @RequiresModule('pmo360')
  @Get('decisions')    decisions()    { return this.svc.decisions(); }
  @RequiresModule('pmo360')
  @Get('approvals')    approvals()    { return this.svc.approvals(); }
  @RequiresModule('analytics360')
  @Get('analytics')    analytics()    { return this.svc.analytics(); }
  @RequiresModule('document360')
  @Get('documents')    documents()    { return this.svc.documents(); }
  @Get('updates')      updates()      { return this.svc.updates(); }
  @RequiresModule('crm360')
  @Get('stakeholders') stakeholders() { return this.svc.stakeholders(); }
  @Get('integrations') integrations() { return this.svc.integrations(); }
  @Get('settings')     settings()     { return this.svc.settings(); }
}
