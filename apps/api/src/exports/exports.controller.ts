import { Controller, Get, Query, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequiresModule } from '../platform/module.guard';
import { ExportsService } from './exports.service';
import { pdfUnavailableReason } from './pdf';

const TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf:  'application/pdf',
};
const lang = (v: unknown): 'en' | 'ar' => (v === 'ar' ? 'ar' : 'en');

@Controller('api/v1/export')
export class ExportsController {
  constructor(private readonly svc: ExportsService) {}

  /** The board pack as a Word document — editable before it is circulated. */
  @RequiresModule('analytics360') @Get('board-pack.docx')
  async word(@Query('lang') l: string, @Res() res: Response) {
    const { buf, name } = await this.svc.docx(lang(l));
    send(res, buf, name, TYPES.docx);
  }

  /** The same pack as slides, for the meeting itself. */
  @RequiresModule('analytics360') @Get('board-pack.pptx')
  async slides(@Query('lang') l: string, @Res() res: Response) {
    const { buf, name } = await this.svc.pptx(lang(l));
    send(res, buf, name, TYPES.pptx);
  }
  /**
   * Printed from the live page in headless Chromium, which is the only way to
   * get Arabic letters joined and a bidirectional line ordered correctly.
   */
  @RequiresModule('analytics360') @Get('board-pack.pdf')
  async pdf(@Query('lang') l: string, @Req() req: Request, @Res() res: Response) {
    const token = (req as any).cookies?.pmo_session;
    if (!token) throw new BadRequestException('Sign in again to export a PDF.');
    try {
      const { buf, name } = await this.svc.pdf(lang(l), token);
      send(res, buf, name, TYPES.pdf);
    } catch (e) {
      throw new BadRequestException(pdfUnavailableReason(e));
    }
  }
}

function send(res: Response, buf: Buffer, filename: string, type: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
}
