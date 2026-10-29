import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
} from 'docx';
import { type PackData, money, localizedExportReasons } from './pack-data';

/**
 * The board pack as a Word document.
 *
 * Word, not PDF, for the Arabic: shaping and bidirectional layout are done by
 * Word itself when the file opens, so the text is correct without this process
 * carrying a text-shaping engine. It is also the format a board secretary can
 * actually edit before circulating, which a PDF is not.
 */

const INK = '171922';
const DIM = '5A6072';
const ACCENT = '4F52E0';
const CRIT = 'C2374D';

type L = (s: string) => string;

const pct = (v: number) => `${Math.round(v)}%`;

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], rtl: boolean) {
  return new Paragraph({
    heading: level,
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, color: INK, rightToLeft: rtl })],
  });
}

function p(runs: (string | { t: string; b?: boolean; c?: string })[], rtl: boolean) {
  return new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { after: 140, line: 300 },
    children: runs.map((r) =>
      typeof r === 'string'
        ? new TextRun({ text: r, rightToLeft: rtl })
        : new TextRun({ text: r.t, bold: r.b, color: r.c ?? INK, rightToLeft: rtl })),
  });
}

function cell(text: string, opts: { head?: boolean; crit?: boolean; rtl: boolean }) {
  return new TableCell({
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    shading: opts.head ? { type: ShadingType.CLEAR, fill: 'EEF1F7' } : undefined,
    children: [new Paragraph({
      bidirectional: opts.rtl,
      alignment: opts.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({
        text, bold: opts.head, size: 19,
        color: opts.crit ? CRIT : opts.head ? DIM : INK,
        rightToLeft: opts.rtl,
      })],
    })],
  });
}

function table(headers: string[], body: { text: string; crit?: boolean }[][], rtl: boolean) {
  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'E2E5EE' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: rtl,
    borders: { top: thin, bottom: thin, left: thin, right: thin,
               insideHorizontal: thin, insideVertical: thin },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((x) => cell(x, { head: true, rtl })),
      }),
      ...body.map((r) => new TableRow({
        children: r.map((c) => cell(c.text, { crit: c.crit, rtl })),
      })),
    ],
  });
}

export async function boardPackDocx(d: PackData, t: L, lang: 'en' | 'ar'): Promise<Buffer> {
  const rtl = lang === 'ar';
  const drawn = d.money.budget ? (d.money.actual / d.money.budget) * 100 : 0;

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: t('Portfolio Board Pack'), bold: true, size: 40, color: INK, rightToLeft: rtl })],
    }),
    new Paragraph({
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { after: 320 },
      children: [new TextRun({
        text: `${d.tenantName} · ${t('generated')} ${d.generatedAt.slice(0, 10)}`,
        color: DIM, size: 20, rightToLeft: rtl,
      })],
    }),

    h(`1 · ${t('Position')}`, HeadingLevel.HEADING_1, rtl),
    p([
      `${t('The portfolio holds')} `, { t: `${d.health.total} ${t('projects')}`, b: true }, ': ',
      { t: String(d.health.on_track), b: true }, ` ${t('on track')}, `,
      { t: String(d.health.at_risk), b: true }, ` ${t('at risk')}, `,
      { t: String(d.health.critical), b: true, c: CRIT }, ` ${t('critical')}. `,
      `${t('Average progress is')} `, { t: pct(d.health.avg_progress), b: true }, '. ',
      `${t('Of')} ${d.gatesSummary.active} ${t('active stage gates')}, `,
      { t: String(d.gatesSummary.blocked), b: true, c: d.gatesSummary.blocked ? CRIT : INK },
      ` ${t('are blocked, which holds the associated funding')}. `,
      `${t('Approved budget stands at')} `, { t: money(d.money.budget), b: true }, ' ',
      `${t('with')} `, { t: money(d.money.actual), b: true }, ` ${t('drawn')} (${pct(drawn)}).`,
    ], rtl),

    h(`2 · ${t('Gate status')}`, HeadingLevel.HEADING_1, rtl),
    table(
      [t('Project'), t('Gate'), t('Checklist'), t('Accountable'), t('Blocked by')],
      d.gates.map((g) => [
        { text: `${g.projectCode} — ${g.projectName}` },
        { text: `SG${g.seq} ${g.name}` },
        { text: g.criteriaTotal ? `${g.criteriaMet}/${g.criteriaTotal}` : t('no checklist'),
          crit: g.criteriaTotal === 0 },
        { text: g.accountable ?? t('unassigned'), crit: !g.accountable },
        { text: g.blockedBy.length ? g.blockedBy.join('; ') : '—', crit: g.blockedBy.length > 0 },
      ]),
      rtl),

    h(`3 · ${t('Executive priorities')}`, HeadingLevel.HEADING_1, rtl),
  ];

  if (d.attention.length === 0) {
    children.push(p([t('None.')], rtl));
  } else {
    for (const a of d.attention) {
      children.push(p([
        { t: `${a.code} — ${a.name}`, b: true },
        ` ${t('is')} `, { t: t(a.health.replace(/_/g, ' ')), c: CRIT }, ` ${t('at')} ${a.gate}.`,
        a.reasonParts.length ? ` ${t('The blocker is')}: ${localizedExportReasons(a, t)}.` : '',
      ], rtl));
    }
  }

  children.push(h(`4 · ${t('Decisions taken')}`, HeadingLevel.HEADING_1, rtl));
  children.push(d.decisions.length
    ? table([t('Decision'), t('Project'), t('Taken at'), t('Owner'), t('Date')],
        d.decisions.map((x) => [
          { text: x.title }, { text: x.project }, { text: x.gate ?? '—' },
          { text: x.owner ?? '—' }, { text: x.date ?? '—' },
        ]), rtl)
    : p([t('None.')], rtl));

  children.push(h(`5 · ${t('Benefits')}`, HeadingLevel.HEADING_1, rtl));
  children.push(d.benefits.length
    ? table([t('Benefit'), t('Measure'), t('Baseline'), t('Target'), t('Actual'), t('Status')],
        d.benefits.map((b) => [
          { text: b.name }, { text: b.measure },
          { text: b.baseline == null ? '—' : money(b.baseline) },
          { text: b.target == null ? '—' : money(b.target) },
          { text: b.actual == null ? '—' : money(b.actual) },
          { text: t(b.status.replace(/_/g, ' ')) },
        ]), rtl)
    : p([t('None.')], rtl));

  children.push(new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 400 },
    children: [new TextRun({
      text: t('Generated from live portfolio data. Every figure traces to a record in the platform.'),
      italics: true, color: DIM, size: 18, rightToLeft: rtl,
    })],
  }));

  const doc = new Document({
    creator: 'The EPMO',
    title: `${d.tenantName} — ${t('Portfolio Board Pack')}`,
    styles: {
      default: {
        document: { run: { font: rtl ? 'Arial' : 'Calibri', size: 21, color: INK } },
        heading1: { run: { size: 28, bold: true, color: ACCENT } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
