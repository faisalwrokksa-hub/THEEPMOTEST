import { Module } from '@nestjs/common';
import { AskXController } from './askx.controller';
import { AskXService } from './askx.service';

@Module({ controllers: [AskXController], providers: [AskXService] })
export class AskXModule {}
