import { Body, Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors,
         BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RequiresModule } from '../platform/module.guard';
import { ExcelService } from './excel.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const lang = (v: unknown): 'en' | 'ar' => (v === 'ar' ? 'ar' : 'en');

@Controller('api/v1/excel')
export class ExcelController {
  constructor(private readonly svc: ExcelService) {}

  /** The blank master workbook, with the seven gates and their checklist ready. */
  @RequiresModule('pmo360') @Get('template')
  async template(@Query('lang') l: string, @Res() res: Response) {
    const buf = await this.svc.template(lang(l));
    send(res, buf, 'The EPMO-project-template.xlsx');
  }

  /** One project in the same shape, so it can be edited and uploaded back. */
  @RequiresModule('pmo360') @Get('project')
  async project(@Query('code') code: string, @Query('lang') l: string, @Res() res: Response) {
    if (!code) throw new BadRequestException('Give a project code, e.g. ?code=ANR');
    const { buf, name } = await this.svc.exportProject(code, lang(l));
    send(res, buf, name);
  }

  @RequiresModule('pmo360') @Post('preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async preview(@UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length || !/\.xlsx$/i.test(file.originalname ?? ''))
      throw new BadRequestException('Upload a valid .xlsx workbook.');
    return this.svc.previewWorkbook(file.buffer);
  }

  @RequiresModule('pmo360') @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async load(@UploadedFile() file?: { buffer: Buffer; originalname: string },
             @Body('mode') mode?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('No file was uploaded.');
    if (!/\.xlsx$/i.test(file.originalname ?? '')) {
      throw new BadRequestException('Upload the .xlsx workbook, not .xls or .csv.');
    }
    // Anything but an explicit 'update' creates. A code already in use then
    // comes back as a question for the caller to put to the user, not a 500.
    return this.svc.importWorkbook(file.buffer, mode === 'update' ? 'update' : 'create');
  }
}

function send(res: Response, buf: Buffer, filename: string) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}
