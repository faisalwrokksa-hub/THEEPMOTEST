import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, HttpCode } from '@nestjs/common';
import { z } from 'zod';
import { setCriterion, decide, raidUpdate, taskUpdate } from '@pmo/contracts';
import { ZodPipe } from '../common/zod.pipe';
import { RequiresModule } from '../platform/module.guard';
import { GateWritesService } from './gate-writes.service';

@RequiresModule('pmo360')
@Controller('api/v1')
export class GateWritesController {
  constructor(private readonly svc: GateWritesService) {}

  @Patch('gate-criteria/:id')
  setCriterion(@Param('id', ParseUUIDPipe) id: string,
               @Body(new ZodPipe(setCriterion)) body: any) {
    return this.svc.setCriterion(id, body);
  }

  @Post('approvals/:id/decision')
  @HttpCode(200)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(decide)) body: any) {
    return this.svc.decide(id, body);
  }

  @Get('gates/:id/readiness')
  readiness(@Param('id', ParseUUIDPipe) id: string) { return this.svc.readiness(id); }

  @Post('gates/:id/advance')
  @HttpCode(200)
  advance(@Param('id', ParseUUIDPipe) id: string) { return this.svc.advance(id); }

  @Post('gates/:id/approvers')
  @HttpCode(200)
  assign(@Param('id', ParseUUIDPipe) id: string,
         @Body(new ZodPipe(z.object({
           userId: z.string().uuid(),
           accountable: z.boolean().default(true),
         }))) body: any) {
    return this.svc.assignApprover(id, body.userId, body.accountable);
  }

  @Post('gates/:id/criteria')
  @HttpCode(200)
  addCriterion(@Param('id', ParseUUIDPipe) id: string,
               @Body(new ZodPipe(z.object({ label: z.string().trim().min(3).max(300) }))) body: any) {
    return this.svc.addCriterion(id, body.label);
  }

  @Patch('raid/:id')
  raid(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(raidUpdate)) body: any) {
    return this.svc.updateRaid(id, body);
  }

  @Patch('tasks/:id')
  task(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(taskUpdate)) body: any) {
    return this.svc.updateTask(id, body.state);
  }
}
