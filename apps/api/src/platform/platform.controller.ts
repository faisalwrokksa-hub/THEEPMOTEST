import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { setModule, MODULE_IDS, type ModuleId } from '@pmo/contracts';
import { ZodPipe } from '../common/zod.pipe';
import { PlatformService } from './platform.service';

@Controller('api/v1/platform')
export class PlatformController {
  constructor(private readonly svc: PlatformService) {}

  @Get('modules')  modules()  { return this.svc.list(); }
  @Get('enabled')  enabled()  { return this.svc.enabledIds(); }

  @Patch('modules/:id')
  set(@Param('id') id: string, @Body(new ZodPipe(setModule)) body: any) {
    if (!(MODULE_IDS as string[]).includes(id)) throw new Error(`Unknown module ${id}`);
    return this.svc.setModule(id as ModuleId, body);
  }
}
