import PptxGenJS from 'pptxgenjs';
import { type PackData, money, localizedExportReasons } from './pack-data';

/**
 * The board pack as slides.
 *
 * Deliberately few slides with large numbers rather than a deck of tables: a
 * board meeting reads the headline off the screen and the detail off the Word
 * pack, and a slide that needs squinting at is one nobody reads.
 */

const INK = '171922';
const DIM = '5A6072';
const ACCENT = '4F52E0';
const GOOD = '12855C';
const WARN = 'A8730C';
const CRIT = 'C2374D';
const LINE = 'E2E5EE';

type L = (s: string) => string;

export async function boardPackPptx(d: PackData, t: L, lang: 'en' | 'ar'): Promise<Buffer> {
  const rtl = lang === 'ar';
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';                    // 10in × 5.625in
  pptx.author = 'The EPMO';
  pptx.title = `${d.tenantName} — ${t('Portfolio Board Pack')}`;
  if (rtl) pptx.rtlMode = true;

  const align = rtl ? 'right' : 'left';
  const x = (left: number, w: number) => (rtl ? 10 - left - w : left);

  const title = (s: PptxGenJS.Slide, text: string, sub?: string) => {
    s.addText(text, { x: x(0.5, 9), y: 0.32, w: 9, h: 0.5, fontSize: 26, bold: true,
                      color: INK, align, rtlMode: rtl });
    if (sub) {
      s.addText(sub, { x: x(0.5, 9), y: 0.82, w: 9, h: 0.3, fontSize: 12, color: DIM,
                       align, rtlMode: rtl });
    }
    s.addShape('rect', { x: x(0.5, 9), y: 1.2, w: 9, h: 0.015, fill: { color: LINE } });
  };

  /* ── cover ─────────────────────────────────────────────────────────── */
  const cover = pptx.addSlide();
  cover.background = { color: '1B1D26' };
  cover.addText(t('Portfolio Board Pack'), {
    x: x(0.7, 8.6), y: 2.0, w: 8.6, h: 0.9, fontSize: 40, bold: true, color: 'FFFFFF',
    align, rtlMode: rtl,
  });
  cover.addText(`${d.tenantName}  ·  ${d.generatedAt.slice(0, 10)}`, {
    x: x(0.7, 8.6), y: 2.95, w: 8.6, h: 0.4, fontSize: 15, color: 'C4C8DC', align, rtlMode: rtl,
  });
  cover.addText(t('Generated from live portfolio data. Every figure traces to a record in the platform.'), {
    x: x(0.7, 8.6), y: 4.6, w: 8.6, h: 0.4, fontSize: 11, color: '868AF5', italic: true,
    align, rtlMode: rtl,
  });

  /* ── position ──────────────────────────────────────────────────────── */
  const pos = pptx.addSlide();
  title(pos, t('Position'), `${d.tenantName} · ${d.generatedAt.slice(0, 10)}`);

  const drawn = d.money.budget ? (d.money.actual / d.money.budget) * 100 : 0;
  const tiles: { label: string; value: string; note: string; color: string }[] = [
    { label: t('Projects'), value: String(d.health.total),
      note: `${d.health.on_track} ${t('on track')} · ${d.health.at_risk} ${t('at risk')} · ${d.health.critical} ${t('critical')}`,
      color: INK },
    { label: t('Gates blocked'), value: `${d.gatesSummary.blocked}/${d.gatesSummary.active}`,
      note: t('a blocked gate holds funding'),
      color: d.gatesSummary.blocked ? CRIT : GOOD },
    { label: t('Average progress'), value: `${Math.round(d.health.avg_progress)}%`,
      note: t('across all projects'), color: INK },
    { label: t('Budget drawn'), value: `${Math.round(drawn)}%`,
      note: `${money(d.money.actual)} ${t('of')} ${money(d.money.budget)}`, color: INK },
  ];
  tiles.forEach((tile, i) => {
    const left = 0.5 + i * 2.3;
    pos.addShape('roundRect', { x: x(left, 2.1), y: 1.6, w: 2.1, h: 1.9,
      fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
    pos.addText(tile.label.toUpperCase(), { x: x(left + 0.15, 1.8), y: 1.75, w: 1.8, h: 0.3,
      fontSize: 9, color: DIM, bold: true, align, rtlMode: rtl });
    pos.addText(tile.value, { x: x(left + 0.15, 1.8), y: 2.05, w: 1.8, h: 0.7,
      fontSize: 30, bold: true, color: tile.color, align, rtlMode: rtl });
    pos.addText(tile.note, { x: x(left + 0.15, 1.8), y: 2.78, w: 1.8, h: 0.6,
      fontSize: 8.5, color: DIM, align, rtlMode: rtl });
  });

  const health = [
    { l: t('on track'), n: d.health.on_track, c: GOOD },
    { l: t('at risk'),  n: d.health.at_risk,  c: WARN },
    { l: t('critical'), n: d.health.critical, c: CRIT },
  ].filter((s) => s.n > 0);
  const total = health.reduce((a, s) => a + s.n, 0) || 1;
  let cursor = 0.5;
  pos.addText(t('Project health'), { x: x(0.5, 9), y: 3.75, w: 9, h: 0.3, fontSize: 11,
    color: DIM, bold: true, align, rtlMode: rtl });
  for (const seg of health) {
    const w = (seg.n / total) * 9;
    pos.addShape('rect', { x: x(cursor, w), y: 4.1, w, h: 0.34, fill: { color: seg.c } });
    pos.addText(`${seg.n} ${seg.l}`, { x: x(cursor, w), y: 4.5, w, h: 0.3, fontSize: 9,
      color: seg.c, align: 'center' });
    cursor += w;
  }

  /* ── gate status ───────────────────────────────────────────────────── */
  const gs = pptx.addSlide();
  title(gs, t('Gate status'), t('Which projects are stuck, at which gate, and why'));
  gs.addTable(
    [
      [t('Project'), t('Gate'), t('Checklist'), t('Accountable'), t('Blocked by')].map((h2) => ({
        text: h2, options: { bold: true, color: DIM, fontSize: 10, fill: { color: 'EEF1F7' } },
      })),
      ...d.gates.map((g) => [
        { text: g.projectCode, options: { bold: true, color: INK } },
        { text: `SG${g.seq} ${g.name}`, options: { color: INK } },
        { text: g.criteriaTotal ? `${g.criteriaMet}/${g.criteriaTotal}` : t('no checklist'),
          options: { color: g.criteriaTotal === 0 ? CRIT : INK } },
        { text: g.accountable ?? t('unassigned'),
          options: { color: g.accountable ? INK : CRIT } },
        { text: g.blockedBy.length ? g.blockedBy.join('; ') : '—',
          options: { color: g.blockedBy.length ? CRIT : DIM } },
      ]),
    ],
    { x: 0.5, y: 1.5, w: 9, fontSize: 10, border: { type: 'solid', color: LINE, pt: 0.5 },
      rowH: 0.34, valign: 'middle' },
  );

  /* ── decisions required ────────────────────────────────────────────── */
  const dec = pptx.addSlide();
  title(dec, t('Executive priorities'));
  if (d.attention.length === 0) {
    dec.addText(t('None.'), { x: x(0.5, 9), y: 1.7, w: 9, h: 0.4, fontSize: 14, color: DIM,
      align, rtlMode: rtl });
  } else {
    d.attention.slice(0, 6).forEach((a, i) => {
      const y = 1.6 + i * 0.62;
      dec.addShape('rect', { x: x(0.5, 0.04), y, w: 0.04, h: 0.5,
        fill: { color: a.health === 'critical' ? CRIT : WARN } });
      dec.addText(`${a.code} — ${a.name}`, { x: x(0.68, 8.8), y, w: 8.8, h: 0.26,
        fontSize: 13, bold: true, color: INK, align, rtlMode: rtl });
      dec.addText(`${t(a.health.replace(/_/g, ' '))} ${t('at')} ${a.gate}` +
                  (a.reasonParts.length ? ` · ${localizedExportReasons(a, t)}` : ''), {
        x: x(0.68, 8.8), y: y + 0.26, w: 8.8, h: 0.26, fontSize: 10, color: DIM,
        align, rtlMode: rtl });
    });
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return out as Buffer;
}
