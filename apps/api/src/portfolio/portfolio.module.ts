import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { AuditService } from '../audit/audit.service';

@Module({ controllers: [PortfolioController], providers: [PortfolioService, AuditService] })
export class PortfolioModule {}
