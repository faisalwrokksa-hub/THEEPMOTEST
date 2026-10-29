import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { TrendsService } from './trends.service';

@Module({ controllers: [InsightsController], providers: [InsightsService, TrendsService] })
export class InsightsModule {}
