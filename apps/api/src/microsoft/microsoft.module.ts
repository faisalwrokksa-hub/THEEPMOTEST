import { Module } from '@nestjs/common';
import { MicrosoftController, MicrosoftCallbackController } from './microsoft.controller';
import { MicrosoftService } from './microsoft.service';

@Module({
  controllers: [MicrosoftController, MicrosoftCallbackController],
  providers: [MicrosoftService],
})
export class MicrosoftModule {}
