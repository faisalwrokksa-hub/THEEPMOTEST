import { Injectable } from '@nestjs/common';
import { translator } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { packData } from './pack-data';
import { boardPackDocx } from './word';
import { boardPackPptx } from './slides';
import { printToPdf } from './pdf';

@Injectable()
export class ExportsService {
  private async pack(lang: 'en' | 'ar') {
    requireCapability('pmoa_view_financials');
    const { tenantId } = currentContext();
    const d = await packData(tenantId);
    return { d, t: translator(lang), slug: d.tenantName.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') };
  }

  async docx(lang: 'en' | 'ar') {
    const { d, t, slug } = await this.pack(lang);
    return { buf: await boardPackDocx(d, t, lang), name: `${slug}-board-pack.docx` };
  }

  async pptx(lang: 'en' | 'ar') {
    const { d, t, slug } = await this.pack(lang);
    return { buf: await boardPackPptx(d, t, lang), name: `${slug}-board-pack.pptx` };
  }

  /**
   * The same board pack as a PDF, printed from the live page so Arabic is
   * shaped and ordered by the browser rather than by us.
   */
  async pdf(lang: 'en' | 'ar', sessionToken: string) {
    const { d, slug } = await this.pack(lang);
    const origin = (process.env.WEB_INTERNAL_URL
      ?? process.env.WEB_ORIGIN?.split(',')[0]
      ?? 'http://localhost:3000').trim();
    const buf = await printToPdf({
      origin, path: '/reports/board-pack', sessionToken, lang,
    });
    return { buf, name: `${slug}-board-pack.pdf`, generatedAt: d.generatedAt };
  }
}
