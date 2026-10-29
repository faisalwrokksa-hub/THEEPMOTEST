import { Body, Controller, GoneException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { createPortfolioIn, createProgramIn, createProjectIn,
         createRaidIn, createTaskIn, createUpdateIn,
         createBenefitIn, createStakeholderIn, createScheduleItemIn,
         createCostIn, createAllocationIn, createDocumentIn,
         updateMemberIn } from '@pmo/contracts';
import { ZodPipe } from '../common/zod.pipe';
import { RequiresModule } from '../platform/module.guard';
import { CreatesService } from './creates.service';

@Controller('api/v1/create')
export class CreatesController {
  constructor(private readonly svc: CreatesService) {}

  @RequiresModule('pmo360') @Post('portfolio')
  portfolio(@Body(new ZodPipe(createPortfolioIn)) b: any) { return this.svc.portfolio(b); }

  @RequiresModule('pmo360') @Post('program')
  program(@Body(new ZodPipe(createProgramIn)) b: any) { return this.svc.program(b); }

  @RequiresModule('pmo360') @Post('project')
  project(@Body(new ZodPipe(createProjectIn)) b: any) { return this.svc.project(b); }

  @RequiresModule('risk360') @Post('raid')
  raid(@Body(new ZodPipe(createRaidIn)) b: any) { return this.svc.raid(b); }

  @RequiresModule('pmo360') @Post('task')
  task(@Body(new ZodPipe(createTaskIn)) b: any) { return this.svc.task(b); }

  @Post('update')
  update(@Body(new ZodPipe(createUpdateIn)) b: any) { return this.svc.update(b); }

  /*
   * Everything below was readable on its own screen and writable only by
   * uploading a workbook. Module guards match the screen each one belongs to,
   * so an unlicensed workspace cannot write what it cannot see.
   */
  @RequiresModule('pmo360') @Post('benefit')
  benefit(@Body(new ZodPipe(createBenefitIn)) b: any) { return this.svc.benefit(b); }

  @RequiresModule('pmo360') @Post('stakeholder')
  stakeholder(@Body(new ZodPipe(createStakeholderIn)) b: any) { return this.svc.stakeholder(b); }

  @RequiresModule('pmo360') @Post('schedule-item')
  scheduleItem(@Body(new ZodPipe(createScheduleItemIn)) b: any) { return this.svc.scheduleItem(b); }

  @RequiresModule('pmo360') @Post('cost')
  cost(@Body(new ZodPipe(createCostIn)) b: any) { return this.svc.cost(b); }

  @RequiresModule('pmo360') @Post('allocation')
  allocation(@Body(new ZodPipe(createAllocationIn)) b: any) { return this.svc.allocation(b); }

  @RequiresModule('pmo360') @Post('document')
  document(@Body(new ZodPipe(createDocumentIn)) b: any) { return this.svc.document(b); }

  /**
   * This legacy endpoint formerly created a login password on an administrator's
   * behalf or silently enrolled an EXISTING global account by email. Neither
   * path proves that the mailbox owner consented to joining this workspace.
   * Do not reinstate it, including for test/development deployments. The
   * replacement is POST /api/v1/onboarding/invitations, which delivers an
   * expiring one-use link and creates membership only when redeemed.
   * Keep a stable 410 response for older integrations instead of accepting
   * their submitted passwords or silently creating accounts.
   */
  @Post('member')
  member(): never {
    throw new GoneException('Direct member creation is disabled. Use workspace email invitations.');
  }

  @Patch('member/:id')
  updateMember(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateMemberIn)) b: any) {
    return this.svc.updateMember(id, b);
  }
}
