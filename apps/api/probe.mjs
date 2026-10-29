import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
const input = process.argv[2];
if (!input) { console.error('Usage: node probe.mjs <spreadsheet.xlsx>'); process.exit(2); }
const buf = readFileSync(input);
const zip = await JSZip.loadAsync(buf);
for (const p of Object.keys(zip.files)) {
  if (!/\.(xml|rels)$/.test(p)) continue;
  let xml = await zip.file(p).async('string');
  const before = xml;
  if (/<x:/.test(xml)) xml = xml.replace(/<(\/?)x:/g, '<$1').replace(/\sxmlns:x=/g, ' xmlns=');
  if (p.endsWith('.rels')) xml = xml.replace(/Target="\/([^"]+)"/g, (m, t) => `Target="${t.replace(/^xl\//, '')}"`);
  if (xml !== before) zip.file(p, xml);
}
const out = await zip.generateAsync({ type: 'nodebuffer' });
const wb = new ExcelJS.Workbook();
try {
  await wb.xlsx.load(out);
  console.log('loaded:', wb.worksheets.length, 'sheets');
  const ws = wb.getWorksheet('Portfolios Programs Projects');
  console.log('A3:', JSON.stringify(ws.getRow(3).getCell(1).value));
  console.log('B3:', JSON.stringify(ws.getRow(3).getCell(2).value));
  console.log('A4:', JSON.stringify(ws.getRow(4).getCell(1).value));
  console.log('L4 (a date):', JSON.stringify(ws.getRow(4).getCell(12).value));
} catch (e) { console.log('FAILED:', e.message.slice(0,140)); }
