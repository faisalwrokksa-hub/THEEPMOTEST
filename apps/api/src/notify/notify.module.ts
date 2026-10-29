import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotifyController } from './notify.controller';
import { NotifyService } from './notify.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotifyController],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
