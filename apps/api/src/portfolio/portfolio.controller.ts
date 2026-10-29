import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createProject, pageQuery } from '@pmo/contracts';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { RequiresModule } from '../platform/module.guard';
import { PortfolioService } from './portfolio.service';

const projectPageQuery = pageQuery.extend({ programId: z.string().uuid().optional() });

@RequiresModule('pmo360')
@Controller('api/v1')
export class PortfolioController {
  constructor(private readonly svc: PortfolioService) {}

  @Get('portfolios') portfolios() { return this.svc.listPortfolios(); }
  @Get('programs')   programs()   { return this.svc.listPrograms(); }

  @Get('projects')
  projects(@Query(new ZodPipe(projectPageQuery)) q: any) { return this.svc.listProjects(q); }

  @Get('projects/:id')
  project(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getProject(id); }

  @Post('projects')
  create(@Body(new ZodPipe(createProject)) body: any) { return this.svc.createProject(body); }
}
