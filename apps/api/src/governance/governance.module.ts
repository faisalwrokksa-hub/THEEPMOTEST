import { Module } from '@nestjs/common';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import { GateWritesController } from './gate-writes.controller';
import { GateWritesService } from './gate-writes.service';

@Module({
  controllers: [GovernanceController, GateWritesController],
  providers: [GovernanceService, GateWritesService],
})
export class GovernanceModule {}
