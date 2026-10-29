import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { GovernanceService } from './governance.service';
import { RequiresModule } from '../platform/module.guard';

@RequiresModule('pmo360')
@Controller('api/v1')
export class GovernanceController {
  constructor(private readonly svc: GovernanceService) {}

  @Get('gates')                 gates()  { return this.svc.gateBoard(); }
  @Get('projects/:id/gates')    forProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.gatesForProject(id);
  }
  @Get('projects/:id/governance') governance(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.projectGovernance(id);
  }
  @Get('raid')                  raid()   { return this.svc.raid(); }
  @Get('tasks')                 tasks()  { return this.svc.tasks(); }
}
