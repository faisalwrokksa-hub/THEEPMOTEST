import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile,
         UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MicrosoftService } from './microsoft.service';
import type { Resource } from './client';
import { safeMicrosoftReturnPath } from './return-path';

const resource = (v: unknown): Resource => (v === 'powerbi' ? 'powerbi' : 'graph');

/**
 * The OAuth callback sits outside /api on purpose.
 *
 * Everything under /api goes through TenantMiddleware, which requires a signed-in
 * session bound to a workspace. This request arrives from Microsoft, in a browser
 * that has just come back from a sign-in page, and the workspace it belongs to is
 * whatever the single-use state row says it is — not whatever cookie happens to
 * be attached.
 */
@Controller('integrations/microsoft')
export class MicrosoftCallbackController {
  constructor(private readonly svc: MicrosoftService) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string,
                 @Query('error') error: string,
                 @Query('error_description') errorDescription: string,
                 @Res() res: Response) {
    const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0].trim();
    const back = (params: Record<string, string>) => {
      const u = new URL('/integrations', web);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return res.redirect(303, u.toString());
    };

    // The person pressed Cancel on Microsoft's consent screen, or their
    // administrator has blocked the app. Both come back here, not as failures.
    if (error) return back({ error: errorDescription || error });
    if (!code || !state) return back({ error: 'Microsoft did not return a sign-in code.' });

    try {
      const { returnTo } = await this.svc.completeConnect(code, state);
      const u = new URL(safeMicrosoftReturnPath(returnTo), web);
      u.searchParams.set('connected', 'microsoft');
      return res.redirect(303, u.toString());
    } catch (e: any) {
      return back({ error: e?.message ?? 'The connection could not be completed.' });
    }
  }
}

@Controller('api/v1/microsoft')
export class MicrosoftController {
  constructor(private readonly svc: MicrosoftService) {}

  @Get('status')
  status() { return this.svc.status(); }

  /** Returns the URL to send the browser to; the web app does the redirecting. */
  @Post('connect')
  connect(@Body() b: { resource?: string; returnTo?: string }) {
    return this.svc.beginConnect(resource(b?.resource), b?.returnTo ?? '/integrations');
  }

  @Delete('connection')
  disconnect() { return this.svc.disconnect(); }

  @Get('places')
  places(@Query('q') q?: string) { return this.svc.places(q); }

  @Get('sites/:siteId/drives')
  drives(@Param('siteId') siteId: string) { return this.svc.drives(siteId); }

  @Post('location')
  location(@Body() b: { siteId?: string; driveId?: string; folderName?: string }) {
    if (!b?.driveId) throw new BadRequestException('Choose a document library or OneDrive first.');
    return this.svc.chooseLocation({ siteId: b.siteId, driveId: b.driveId, folderName: b.folderName });
  }

  @Get('files')
  files(@Query('projectId') projectId?: string) { return this.svc.browse(projectId); }

  @Post('upload')
  // 60MB. Graph itself will take far more, but a drawing set arriving through
  // one request at a time is where this stops being the right mechanism.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 60 * 1024 * 1024 } }))
  upload(@UploadedFile() file: { buffer: Buffer; originalname: string; mimetype?: string } | undefined,
         @Body() b: { projectId?: string; name?: string; kind?: string; criterionId?: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('No file was uploaded.');
    return this.svc.upload({ ...b, name: b?.name || file.originalname }, file);
  }

  /** Follows through to the file itself, so a link in a report just opens it. */
  @Get('documents/:id/open')
  async open(@Param('id') id: string, @Res() res: Response) {
    const { url } = await this.svc.documentLink(id);
    return res.redirect(302, url);
  }

  @Get('reports')
  reports() { return this.svc.reports(); }

  @Get('reports/:id/embed')
  embed(@Param('id') id: string, @Query('groupId') groupId?: string) {
    return this.svc.embed(id, groupId);
  }
}
