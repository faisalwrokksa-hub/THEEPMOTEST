import ExcelJS from 'exceljs';
import { readWorkbook, findHeaderRow, headerVariants } from './read-xlsx';
import { WORKBOOK, DEFAULT_GATES, type WorkbookSheet, type WorkbookColumn } from '@pmo/contracts';

/**
 * Reading and writing the master workbook.
 *
 * Both directions share `WORKBOOK` from contracts, so a column added there
 * appears in the template, in the export and in the importer at once. The one
 * thing this file owns is how a cell looks and how a cell is read back.
 */

const HEADER_FILL = 'FF1F2430';
const HINT_FILL   = 'FFF3F5FA';
const ACCENT      = 'FF4F52E0';

const NUM_FMT: Record<string, string> = {
  money:   '#,##0.00',
  number:  '#,##0.##',
  percent: '0"%"',
  date:    'dd mmm yyyy',
};

/**
 * Dates are calendar dates, not instants.
 *
 * `new Date('2026-03-01')` is midnight UTC, which in any timezone west of
 * Greenwich is the 28th of February locally — and Excel stores whatever the
 * local rendering was. Anchoring at noon UTC puts twelve hours of slack on
 * either side, so no timezone can push the value across a day boundary, and
 * reading uses UTC parts for the same reason.
 */
function dateOnly(v: unknown): Date | null {
  if (v instanceof Date) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const d = new Date(String(v));
  return isNaN(d.getTime())
    ? null
    : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
}

const isoDate = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** Row 1 is a title, row 2 the purpose, row 3 headers, row 4 hints, data from row 5. */
const HEADER_ROW = 3;
const HINT_ROW = 4;
const FIRST_DATA_ROW = 5;

function styleSheet(ws: ExcelJS.Worksheet, sheet: WorkbookSheet, lang: 'en' | 'ar') {
  const cols = sheet.columns;

  ws.mergeCells(1, 1, 1, cols.length);
  const title = ws.getCell(1, 1);
  title.value = lang === 'ar' ? sheet.nameAr : sheet.name;
  title.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  title.alignment = { vertical: 'middle', horizontal: lang === 'ar' ? 'right' : 'left', indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, cols.length);
  const purpose = ws.getCell(2, 1);
  purpose.value = lang === 'ar' ? sheet.purposeAr : sheet.purpose;
  purpose.font = { size: 10, italic: true, color: { argb: 'FF5A6072' } };
  purpose.alignment = { vertical: 'middle', horizontal: lang === 'ar' ? 'right' : 'left', indent: 1, wrapText: true };
  ws.getRow(2).height = 28;

  cols.forEach((c, i) => {
    const n = i + 1;
    ws.getColumn(n).width = c.width ?? 18;

    const h = ws.getCell(HEADER_ROW, n);
    h.value = (lang === 'ar' ? c.headerAr : c.header) + (c.required ? ' *' : '');
    h.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid',
               fgColor: { argb: c.required ? ACCENT : HEADER_FILL } };
    h.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    h.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };

    const hint = ws.getCell(HINT_ROW, n);
    hint.value = (lang === 'ar' ? c.hintAr ?? c.hint : c.hint)
      ?? (c.choices ? c.choices.join(' · ') : '');
    hint.font = { size: 9, italic: true, color: { argb: 'FF7A8095' } };
    hint.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HINT_FILL } };
    hint.alignment = { vertical: 'top', wrapText: true };

    if (NUM_FMT[c.kind]) {
      ws.getColumn(n).numFmt = NUM_FMT[c.kind];
    }

    // A dropdown beats a free-text field that gets rejected on upload.
    if (c.choices?.length) {
      for (let r = FIRST_DATA_ROW; r < FIRST_DATA_ROW + 400; r++) {
        ws.getCell(r, n).dataValidation = {
          type: 'list', allowBlank: !c.required,
          formulae: [`"${c.choices.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Not a valid value',
          error: `Choose one of: ${c.choices.join(', ')}`,
        };
      }
    }
    if (c.kind === 'bool') {
      for (let r = FIRST_DATA_ROW; r < FIRST_DATA_ROW + 400; r++) {
        ws.getCell(r, n).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"yes,no"'], showErrorMessage: true,
        };
      }
    }
  });

  ws.getRow(HEADER_ROW).height = 30;
  ws.getRow(HINT_ROW).height = 26;
  ws.views = [{ state: 'frozen', ySplit: HINT_ROW, rightToLeft: lang === 'ar' }];
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: cols.length },
  };
}

function put(ws: ExcelJS.Worksheet, row: number, cols: readonly WorkbookColumn[], data: Record<string, unknown>) {
  cols.forEach((c, i) => {
    const raw = data[c.key];
    if (raw === undefined || raw === null || raw === '') return;
    const cell = ws.getCell(row, i + 1);
    switch (c.kind) {
      case 'date': {
        const d = dateOnly(raw);
        if (!d) return;
        cell.value = d;
        break;
      }
      case 'money': case 'number': case 'percent':
        cell.value = Number(raw);
        break;
      case 'bool':
        cell.value = raw === true || raw === 'true' || raw === 'yes' ? 'yes' : 'no';
        break;
      default:
        cell.value = String(raw);
    }
    cell.alignment = { vertical: 'top', wrapText: c.width !== undefined && c.width > 30 };
  });
}

export type WorkbookData = Partial<Record<string, Record<string, unknown>[]>>;

/**
 * Builds the workbook. With no data it is the blank template, prefilled with
 * the seven gates and their standard checklist — which is the point: a project
 * arrives governable rather than as an empty grid.
 */
export async function buildWorkbook(data: WorkbookData = {}, lang: 'en' | 'ar' = 'en'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The EPMO';
  wb.created = new Date();

  for (const sheet of WORKBOOK) {
    const ws = wb.addWorksheet(lang === 'ar' ? sheet.nameAr : sheet.name, {
      views: [{ rightToLeft: lang === 'ar' }],
    });
    styleSheet(ws, sheet, lang);

    let rows = data[sheet.key] ?? [];
    // The gates sheet is never blank: an empty checklist is a gate that can
    // never pass, so the template ships the standard set to edit.
    if (sheet.key === 'gates' && rows.length === 0) {
      rows = DEFAULT_GATES.flatMap((g) =>
        g.criteria.map((criterion) => ({ seq: g.seq, gateName: g.name, criterion })));
    }
    rows.forEach((r, i) => put(ws, FIRST_DATA_ROW + i, sheet.columns, r));
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/* ── reading ──────────────────────────────────────────────────────────── */

export type ParsedSheet = Record<string, unknown>[];
export type ParsedWorkbook = {
  sheets: Record<string, ParsedSheet>;
  problems: string[];
  /* Columns we did not recognise. Not failures — a customer's own workbook
     carries more than this platform stores — but worth saying out loud so
     nobody assumes a column was imported when it was ignored. */
  notes: string[];
};

const norm = (s: unknown) => String(s ?? '').replace(/\s*\*\s*$/, '').trim().toLowerCase();

/**
 * A serial number as Excel counts days: from 1899-12-30, because Excel
 * believes 1900 was a leap year and the offset absorbs its mistake.
 */
function fromSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;   // 1954–2119
  // Floor, not round: the fractional part is the time of day. This workbook
  // writes dates at noon so they cannot drift a day west of Greenwich, and
  // rounding that .5 up moved every exported date forward by one.
  const ms = Math.floor(n) * 86400000 + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Data cells carry both languages too — "التنفيذ | Execution" — not only the
 * headings. Split them and keep the side that means something here; if a
 * column has a list of allowed values, that decides which side wins.
 */
function pickLanguage(text: string, choices?: readonly string[]): string {
  const parts = text.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return text.trim();
  if (choices?.length) {
    const want = choices.map((c) => c.toLowerCase().replace(/[\s_]+/g, ''));
    const hit = parts.find((p) => want.includes(p.toLowerCase().replace(/[\s_]+/g, '')));
    if (hit) return hit;
  }
  // Otherwise take the Latin side: every enum this platform stores is written
  // in English, and Arabic display text is produced at render time.
  return parts.find((p) => /[A-Za-z]/.test(p)) ?? parts[0];
}

/** Cells arrive as text from the reader; this turns one into what it means. */
function cellValue(raw: unknown, kind: string, choices?: readonly string[]): unknown {
  const v: any = raw;
  if (v === null || v === undefined || String(v).trim() === '') return null;

  switch (kind) {
    case 'date': {
      const text = String(v).trim();
      // A date may arrive as text, or as the number of days Excel stores.
      if (/^\d+(\.\d+)?$/.test(text)) {
        const serial = fromSerial(Number(text));
        if (serial) return serial;
      }
      const d = dateOnly(text);
      return d ? isoDate(d) : null;
    }
    case 'percent': {
      const n = Number(String(v).replace(/[, %]/g, ''));
      if (isNaN(n)) return null;
      // Some workbooks keep progress as a fraction of one. Anything in that
      // range is read as a proportion, because a project at 0.35 per cent is
      // not a thing anybody records.
      return n > 0 && n <= 1 ? Math.round(n * 100) : n;
    }
    case 'money': case 'number': {
      const n = Number(String(v).replace(/[, %]/g, ''));
      return isNaN(n) ? null : n;
    }
    case 'bool': {
      const s = pickLanguage(String(v)).trim().toLowerCase();
      return ['yes', 'true', '1', 'y', 'نعم'].includes(s);
    }
    case 'choice':
      return pickLanguage(String(v), choices);
    default:
      return pickLanguage(String(v));
  }
}

/**
 * Reads a filled workbook back.
 *
 * Headers are matched by name, case-insensitively and in either language, so
 * a customer who reorders columns or works in the Arabic template is fine. A
 * sheet whose required columns are missing is reported rather than silently
 * skipped — a quiet partial import is the worst outcome here.
 */
export async function parseWorkbook(buf: Buffer): Promise<ParsedWorkbook> {
  // Read with our own parser rather than ExcelJS: customer workbooks are
  // generated by all sorts of tools, and the ones that use namespace prefixes
  // or absolute relationship targets are perfectly valid and unreadable to it.
  const wb = await readWorkbook(buf);

  const sheets: Record<string, ParsedSheet> = {};
  const problems: string[] = [];
  const notes: string[] = [];

  const names = (sheet: WorkbookSheet) =>
    new Set([sheet.name, sheet.nameAr, ...(sheet.nameAliases ?? [])].map(norm));

/**
 * Some workbooks keep money wide — a column each for budget, committed, actual
 * and forecast — where this one keeps it long, a row per kind. Neither is
 * wrong, and the customer should not have to rearrange their own file, so a
 * wide sheet is folded into rows here.
 */
const WIDE_COST: { kind: string; headers: string[] }[] = [
  { kind: 'budget',     headers: ['approved budget', 'revised budget', 'budget'] },
  { kind: 'commitment', headers: ['committed', 'commitment'] },
  { kind: 'actual',     headers: ['actual', 'spent'] },
  { kind: 'forecast',   headers: ['forecast', 'eac'] },
];

function foldWideCosts(rows: string[][], headerRow: number): ParsedSheet | null {
  const heads = (rows[headerRow] ?? []).map((h) => headerVariants(h).map(norm));
  const at = (want: string[]) =>
    heads.findIndex((vs) => vs.some((v) => want.includes(v)));

  const found = WIDE_COST.map((w) => ({ ...w, col: at(w.headers) })).filter((w) => w.col >= 0);
  if (found.length < 2) return null;                 // not a wide sheet

  const categoryCol = at(['account', 'cost centre', 'cost center', 'category']);
  const out: ParsedSheet = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = rows[r] ?? [];
    if (!cells.some((c) => String(c ?? '').trim())) continue;
    const category = categoryCol >= 0
      ? String(cells[categoryCol] ?? '').trim() : '';
    for (const w of found) {
      const n = Number(String(cells[w.col] ?? '').replace(/[, ]/g, ''));
      if (!Number.isFinite(n) || n === 0) continue;  // an empty column is not a zero cost
      out.push({ kind: w.kind, category: category || 'Uncategorised', amount: n });
    }
  }
  return out.length ? out : null;
}

  for (const sheet of WORKBOOK) {
    const want = names(sheet);
    const ws = wb.find((w) => want.has(norm(w.name)));
    if (!ws) {
      problems.push(`Sheet "${sheet.name}" is missing from the workbook.`);
      continue;
    }

    const headerRow = findHeaderRow(ws.rows);
    const headers = ws.rows[headerRow] ?? [];

    // A heading may carry both languages in one cell — "المحفظة | Portfolio" —
    // so either side has to match, and so does any name the column is also
    // known by in a workbook the customer already maintains.
    const byCol = new Map<number, WorkbookColumn>();
    for (let n = 0; n < headers.length; n++) {
      const variants = headerVariants(headers[n]).map(norm);
      if (!variants.length) continue;
      const col = sheet.columns.find((c) =>
        variants.includes(norm(c.header)) ||
        variants.includes(norm(c.headerAr)) ||
        (c.aliases ?? []).some((a) => variants.includes(norm(a))));
      if (col && ![...byCol.values()].includes(col)) byCol.set(n, col);
    }

    const missing = sheet.columns
      .filter((c) => c.required && ![...byCol.values()].includes(c))
      .map((c) => c.header);
    if (missing.length && sheet.key === 'costs') {
      const folded = foldWideCosts(ws.rows, headerRow);
      if (folded) {
        sheets.costs = folded;
        notes.push(`Sheet "${ws.name}": money was kept as a column per kind and has been folded into ${folded.length} cost lines.`);
        continue;
      }
    }
    if (missing.length) {
      problems.push(`Sheet "${sheet.name}" is missing required column(s): ${missing.join(', ')}.`);
      continue;
    }

    const unread = headers.filter((h, n) => String(h ?? '').trim() && !byCol.has(n)).length;
    if (unread) {
      notes.push(`Sheet "${sheet.name}": ${unread} column(s) were not recognised and were left alone.`);
    }

    const rows: ParsedSheet = [];
    for (let r = headerRow + 1; r < ws.rows.length; r++) {
      const cells = ws.rows[r] ?? [];
      const row: Record<string, unknown> = {};
      let any = false;
      for (const [n, col] of byCol) {
        const v = cellValue(cells[n], col.kind, col.choices);
        if (v !== null && v !== '') { row[col.key] = v; any = true; }
      }
      if (!any) continue;
      // The hint row sits directly under the headers and is not data.
      const looksLikeHint = sheet.columns.some((c) => c.hint && row[c.key] === c.hint) ||
        sheet.columns.some((c) => c.choices && row[c.key] === c.choices.join(' · '));
      if (looksLikeHint) continue;
      rows.push(row);
    }
    sheets[sheet.key] = rows;
  }

  return { sheets, problems, notes };
}
