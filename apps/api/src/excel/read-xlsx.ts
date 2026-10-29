import JSZip from 'jszip';

/**
 * A deliberately forgiving .xlsx reader.
 *
 * ExcelJS reads what Excel writes. It does not read everything that is a valid
 * spreadsheet, and the difference stopped being academic the day a customer
 * sent a workbook their own system had generated: every element carried an
 * `x:` namespace prefix and every relationship target was absolute. Both are
 * legal OOXML; ExcelJS threw on the first and then on the second, and the
 * import failed with a message about a property called `name`.
 *
 * Writing stays with ExcelJS, which is good at it. Reading happens here, where
 * the only assumptions are the ones the format actually guarantees: a workbook
 * part naming its sheets, a relationship part locating them, an optional
 * shared-string table, and rows of cells carrying a reference like "C7".
 *
 * Everything comes back as text. Interpreting it — dates, numbers, choices —
 * is the importer's job, and it already does that carefully.
 */
export type SheetRows = { name: string; rows: string[][] };

/** Tag name without whatever namespace prefix the writer chose. */
const local = (tag: string) => tag.replace(/^[^:]+:/, '');

/** All occurrences of an element, prefixed or not. */
function elements(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(\\s[^>]*?)?(/>|>)`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[2] === '/>') { out.push(m[0]); continue; }
    const close = new RegExp(`</(?:[\\w.-]+:)?${tag}>`, 'g');
    close.lastIndex = re.lastIndex;
    const end = close.exec(xml);
    if (!end) { out.push(m[0]); continue; }
    out.push(xml.slice(m.index, end.index + end[0].length));
    re.lastIndex = end.index + end[0].length;
  }
  return out;
}

const attr = (frag: string, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(frag)?.[1];

const XML_ENT: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};
const unescape = (s: string) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
   .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENT[e]);

/** Concatenated text of every <t> inside a fragment — rich text is many runs. */
function textOf(frag: string): string {
  let out = '';
  for (const t of elements(frag, 't')) {
    const inner = /<[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/.exec(t);
    if (inner) out += unescape(inner[1]);
  }
  return out;
}

/** "BC12" → 54. Column letters are base-26 with no zero. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readWorkbook(buf: Buffer): Promise<SheetRows[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new Error('That file is not a readable .xlsx workbook.');
  }

  const read = async (path: string): Promise<string | null> => {
    const f = zip.file(path.replace(/^\//, ''));
    return f ? f.async('string') : null;
  };

  const wbXml = await read('xl/workbook.xml');
  if (!wbXml) throw new Error('That file is not a spreadsheet — no workbook part inside it.');

  // Sheet order and names live in the workbook; where each one is stored lives
  // in the relationships beside it.
  const relXml = (await read('xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  for (const rel of elements(relXml, 'Relationship')) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    // Targets are written both absolute ("/xl/worksheets/sheet1.xml") and
    // relative ("worksheets/sheet1.xml"). Normalise to a path inside the zip.
    if (id && target) {
      targets.set(id, target.startsWith('/') ? target.slice(1)
        : target.startsWith('xl/') ? target : `xl/${target}`);
    }
  }

  const shared: string[] = [];
  const ssXml = await read('xl/sharedStrings.xml');
  if (ssXml) for (const si of elements(ssXml, 'si')) shared.push(textOf(si));

  const sheets: SheetRows[] = [];
  let positional = 0;
  for (const s of elements(wbXml, 'sheet')) {
    const name = unescape(attr(s, 'name') ?? `Sheet${sheets.length + 1}`);
    const rid = attr(s, 'r:id') ?? attr(s, 'id');
    positional++;
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${positional}.xml`;
    const xml = await read(path);
    if (!xml) { sheets.push({ name, rows: [] }); continue; }

    const rows: string[][] = [];
    for (const rowXml of elements(xml, 'row')) {
      const cells: string[] = [];
      for (const c of elements(rowXml, 'c')) {
        const ref = attr(c, 'r');
        const type = attr(c, 't');
        let value = '';
        if (type === 'inlineStr') {
          value = textOf(c);
        } else {
          const v = elements(c, 'v')[0];
          const raw = v ? unescape(/<[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/.exec(v)?.[1] ?? '') : '';
          // A shared string cell holds an index into the table, not the text.
          value = type === 's' && /^\d+$/.test(raw) ? (shared[Number(raw)] ?? '') : raw;
        }
        // Empty cells are often omitted entirely, so place by reference rather
        // than by arrival order — otherwise every column after a gap shifts.
        const at = ref ? columnIndex(ref) : cells.length;
        while (cells.length < at) cells.push('');
        cells[at] = value;
      }
      const at = Number(attr(rowXml, 'r') ?? rows.length + 1) - 1;
      while (rows.length < at) rows.push([]);
      rows[at] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/**
 * Where the headings are.
 *
 * Customer workbooks open with a title, often a blank line, sometimes a note,
 * before the actual column headings. Assuming row 1 read a title as a column
 * name and then matched nothing. The heading row is the busiest of the first
 * few — a title spans one or two cells, a heading row spans the table.
 */
export function findHeaderRow(rows: string[][], search = 12): number {
  let best = 0, bestCount = 0;
  for (let i = 0; i < Math.min(search, rows.length); i++) {
    const filled = (rows[i] ?? []).filter((c) => String(c ?? '').trim() !== '').length;
    if (filled > bestCount) { bestCount = filled; best = i; }
  }
  return bestCount >= 2 ? best : 0;
}

/**
 * Headings arrive as "المحفظة | Portfolio", one cell carrying both languages.
 * Either side has to match, so a workbook filled in by an Arabic team and one
 * filled in by an English team are the same workbook.
 */
export function headerVariants(cell: string): string[] {
  const raw = String(cell ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts = raw.split(/\s*[|\/\n]\s*/).map((p) => p.trim()).filter(Boolean);
  return [...new Set([raw, ...parts])];
}
