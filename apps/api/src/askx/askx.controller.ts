import { Body, Controller, Get, Param, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import { RequiresModule } from '../platform/module.guard';
import { AskXService } from './askx.service';

@Controller('api/v1/ask')
export class AskXController {
  constructor(private readonly svc: AskXService) {}

  /** Whether the assistant is available, and which model answers. */
  @Get('status') status() { return this.svc.status; }

  /** Recent conversations in this workspace. */
  @RequiresModule('ai360') @Get() threads() { return this.svc.threads(); }

  /** The exact facts the assistant is given — so an answer can be checked. */
  @RequiresModule('ai360') @Get('facts') facts() { return this.svc.facts(); }

  @RequiresModule('ai360') @Get('thread/:id')
  thread(@Param('id', ParseUUIDPipe) id: string) { return this.svc.thread(id); }

  @RequiresModule('ai360') @Post()
  ask(@Body() b: { question?: string; threadId?: string; path?: string },
      @Query('lang') lang?: string) {
    return this.svc.ask(String(b?.question ?? ''), b?.threadId,
                        lang === 'ar' ? 'ar' : 'en', b?.path);
  }
}
