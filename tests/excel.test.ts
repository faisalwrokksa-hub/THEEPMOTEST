import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { API, login, as, get, reseed, psql } from './helpers';

/**
 * The workbook is the one place a customer's own data crosses a format
 * boundary twice — out to Excel and back. These tests care about whether it
 * survives the trip unchanged, not about how the file looks.
 */

let token: string;
const created: string[] = [];

async function download(path: string): Promise<ExcelJS.Workbook> {
  const res = await fetch(`${API}${path}`, { headers: as(token) });
  expect(res.status).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  return wb;
}

async function upload(wb: ExcelJS.Workbook, mode: 'create' | 'update' = 'create') {
  const buf = await wb.xlsx.writeBuffer();
  const form = new FormData();
  form.append('file', new Blob([buf]), 'test.xlsx');
  form.append('mode', mode);
  const res = await fetch(`${API}/api/v1/excel/import`, {
    method: 'POST', headers: as(token), body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function send(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { 'content-type': 'application/json', ...as(token) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  reseed();
  token = (await login('fatima@al-nakheel.test')).token!;
}, 120_000);

afterAll(async () => {
  // Leave the workspace as it was found.
  if (created.length) reseed();
}, 120_000);

describe('the master workbook', () => {
  it('ships a blank template with every sheet and the gates prefilled', async () => {
    const wb = await download('/api/v1/excel/template');
    expect(wb.worksheets.map((w) => w.name)).toEqual(
      ['Project', 'Stage Gates', 'Schedule', 'RAID', 'Costs', 'Benefits', 'Stakeholders',
       'Resources', 'Documents', 'Updates']);

    // A gate with no checklist can never pass, so the template must not be blank.
    const gates = wb.getWorksheet('Stage Gates')!;
    const seqs = new Set<number>();
    for (let r = 5; r <= gates.rowCount; r++) {
      const v = gates.getCell(r, 1).value;
      if (typeof v === 'number') seqs.add(v);
    }
    expect([...seqs].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('exports in the same shape it accepts', async () => {
    const tpl = await download('/api/v1/excel/template');
    const exp = await download('/api/v1/excel/project?code=ANR');
    for (const ws of tpl.worksheets) {
      const other = exp.getWorksheet(ws.name);
      expect(other, `export is missing sheet ${ws.name}`).toBeTruthy();
      const head = (n: ExcelJS.Worksheet) =>
        (n.getRow(3).values as any[]).slice(1).map((v) => String(v ?? ''));
      expect(head(other!)).toEqual(head(ws));
    }
  });

  it('round-trips a project without changing a single value', async () => {
    const wb = await download('/api/v1/excel/project?code=ANR');
    wb.getWorksheet('Project')!.getCell(5, 1).value = 'RTT';
    const { status, body } = await upload(wb);
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    created.push('RTT');

    const again = await download('/api/v1/excel/project?code=RTT');
    const skip = new Set(['Project']);        // the code was deliberately changed
    for (const ws of wb.worksheets) {
      if (skip.has(ws.name)) continue;
      const b = again.getWorksheet(ws.name)!;
      const read = (n: ExcelJS.Worksheet) => {
        const out: string[] = [];
        for (let r = 5; r <= n.rowCount; r++) {
          const cells: string[] = [];
          for (let c = 1; c <= n.columnCount; c++) {
            let v: any = n.getCell(r, c).value;
            if (v && typeof v === 'object' && 'result' in v) v = v.result;
            cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''));
          }
          const line = cells.join('|');
          if (line.replace(/\|/g, '').trim()) out.push(line);
        }
        return out.sort();
      };
      expect(read(b), `sheet ${ws.name} changed on the round trip`).toEqual(read(ws));
    }
  }, 60_000);

  it('keeps calendar dates on the day they were written', async () => {
    // A date written as midnight UTC renders as the previous day west of
    // Greenwich, and Excel stores what it rendered. This is the regression.
    const wb = await download('/api/v1/excel/template');
    wb.getWorksheet('Project')!.getCell(5, 1).value = 'TZ1';
    wb.getWorksheet('Project')!.getCell(5, 2).value = 'Timezone check';
    wb.getWorksheet('Project')!.getCell(5, 9).value = new Date(Date.UTC(2026, 0, 1, 12));
    const sch = wb.getWorksheet('Schedule')!;
    sch.getCell(5, 1).value = 'New year start';
    sch.getCell(5, 3).value = new Date(Date.UTC(2026, 0, 1, 12));

    const { body } = await upload(wb);
    expect(body.ok).toBe(true);
    created.push('TZ1');

    const back = await download('/api/v1/excel/project?code=TZ1');
    const d = back.getWorksheet('Schedule')!.getCell(5, 3).value as Date;
    expect(d.toISOString().slice(0, 10)).toBe('2026-01-01');
  }, 60_000);

  it('creates a project that is immediately governable', async () => {
    const wb = await download('/api/v1/excel/template');
    const P = wb.getWorksheet('Project')!;
    P.getCell(5, 1).value = 'GOV1';
    P.getCell(5, 2).value = 'Governable on arrival';
    P.getCell(5, 5).value = 'fatima@al-nakheel.test';
    const { body } = await upload(wb);
    expect(body.ok).toBe(true);
    created.push('GOV1');

    // All seven gates, SG0 open with a real checklist, and a named owner.
    expect(body.created.gates).toBe(7);
    expect(body.created.criteria).toBeGreaterThan(0);

    const gates = await get('/api/v1/gates', token);
    const row = gates.body.find((g: any) => g.projectCode === 'GOV1');
    expect(row).toBeTruthy();
    expect(row.criteriaTotal).toBeGreaterThan(0);
    expect(row.mayPass).toBe(false);          // nothing is proven yet
    expect(row.accountable).toBeTruthy();
  }, 60_000);

  it('asks about a code already in use instead of refusing it', async () => {
    const wb = await download('/api/v1/excel/template');
    wb.getWorksheet('Project')!.getCell(5, 1).value = 'ANR';
    wb.getWorksheet('Project')!.getCell(5, 2).value = 'Collides with the real one';
    const { body } = await upload(wb);

    // Not an error with advice to go and delete something — a question, with
    // enough about what is already there for the answer to be informed.
    expect(body.ok).toBe(false);
    expect(body.problems).toEqual([]);
    expect(body.conflict.code).toBe('ANR');
    expect(body.conflict.name).toBeTruthy();
    expect(Object.keys(body.conflict.holds).length).toBeGreaterThan(0);

    // And nothing was written while asking.
    const after = await get('/api/v1/projects', token);
    expect(after.body.items.find((p: any) => p.code === 'ANR').name)
      .not.toBe('Collides with the real one');
  }, 60_000);

  it('updates the project in place when told to, without a second copy', async () => {
    const wb = await download('/api/v1/excel/project?code=ANR');
    wb.getWorksheet('Project')!.getCell(5, 2).value = 'Renamed by re-import';
    const { body } = await upload(wb, 'update');
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('updated');

    expect(Number(psql(`SELECT count(*) FROM projects WHERE code = 'ANR'`))).toBe(1);
    const after = await get('/api/v1/projects', token);
    expect(after.body.items.find((p: any) => p.code === 'ANR').name).toBe('Renamed by re-import');

    // Seven gates, not fourteen.
    expect(Number(psql(
      `SELECT count(*) FROM gates g JOIN projects p ON p.id = g.project_id WHERE p.code = 'ANR'`)))
      .toBe(7);
  }, 60_000);

  it('leaves a signed-off criterion signed off when the sheet is sent back', async () => {
    // Sign something off the way a person would, then re-import the workbook
    // that criterion came from. A spreadsheet cell must not be able to undo a
    // signature, and re-reading the same label must not duplicate it.
    const projectId = psql(`select id from projects where code='ANR'`);
    const g = (await get(`/api/v1/projects/${projectId}/governance`, token)).body;
    const active = g.gates.find((x: any) => x.status === 'active');
    const target = g.criteria.find((c: any) => c.gateId === active.id && !c.isMet);
    const r = await send(`/api/v1/gate-criteria/${target.id}`, 'PATCH',
      { isMet: true, evidenceUrl: 'https://example.test/evidence.pdf' });
    expect(r.status).toBe(200);

    const before = Number(psql(
      `SELECT count(*) FROM gate_criteria c JOIN gates g ON g.id = c.gate_id
       JOIN projects p ON p.id = g.project_id WHERE p.code = 'ANR'`));

    const wb = await download('/api/v1/excel/project?code=ANR');
    expect((await upload(wb, 'update')).body.ok).toBe(true);

    const still = (await get(`/api/v1/projects/${projectId}/governance`, token)).body
      .criteria.find((c: any) => c.id === target.id);
    expect(still.isMet).toBe(true);
    expect(still.metBy ?? still.metAt).toBeTruthy();

    const after = Number(psql(
      `SELECT count(*) FROM gate_criteria c JOIN gates g ON g.id = c.gate_id
       JOIN projects p ON p.id = g.project_id WHERE p.code = 'ANR'`));
    expect(after).toBe(before);
  }, 60_000);

  it('replaces the schedule from the sheet but keeps the update stream', async () => {
    const wb = await download('/api/v1/excel/project?code=ANR');
    const sch = wb.getWorksheet('Schedule')!;
    const dropped = String(sch.getCell(5, 1).value ?? '');
    expect(dropped).toBeTruthy();
    sch.spliceRows(5, 1);                       // drop the first real task

    const updates = Number(psql(
      `SELECT count(*) FROM updates u JOIN projects p ON p.id = u.project_id WHERE p.code = 'ANR'`));

    const { body } = await upload(wb, 'update');
    expect(body.ok).toBe(true);

    // The schedule is a statement of where things stand, so a task the sheet
    // no longer lists is gone.
    const back = await download('/api/v1/excel/project?code=ANR');
    const names = new Set<string>();
    const bs = back.getWorksheet('Schedule')!;
    for (let r = 5; r <= bs.rowCount; r++) names.add(String(bs.getCell(r, 1).value ?? ''));
    expect(names.has(dropped)).toBe(false);

    // The update stream is a conversation, so re-importing it says nothing twice.
    expect(Number(psql(
      `SELECT count(*) FROM updates u JOIN projects p ON p.id = u.project_id WHERE p.code = 'ANR'`)))
      .toBe(updates);
  }, 60_000);

  it('creates rather than fails when asked to update a code nobody uses', async () => {
    const wb = await download('/api/v1/excel/template');
    wb.getWorksheet('Project')!.getCell(5, 1).value = 'NEW9';
    wb.getWorksheet('Project')!.getCell(5, 2).value = 'Not here yet';
    const { body } = await upload(wb, 'update');
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('created');
    expect(body.warnings.join(' ')).toMatch(/created rather than updated/i);
    created.push('NEW9');
  }, 60_000);

  it('reports an unknown owner instead of failing the whole import', async () => {
    const wb = await download('/api/v1/excel/template');
    const P = wb.getWorksheet('Project')!;
    P.getCell(5, 1).value = 'WARN1';
    P.getCell(5, 2).value = 'Unknown owner';
    P.getCell(5, 5).value = 'someone@nowhere.test';
    const { body } = await upload(wb);
    expect(body.ok).toBe(true);
    created.push('WARN1');
    expect(body.warnings.join(' ')).toMatch(/not a member of this workspace/i);
  }, 60_000);

  it('will not mark a criterion met without evidence, even from a spreadsheet', async () => {
    const wb = await download('/api/v1/excel/template');
    const P = wb.getWorksheet('Project')!;
    P.getCell(5, 1).value = 'EV1';
    P.getCell(5, 2).value = 'Evidence rule holds through import';
    const G = wb.getWorksheet('Stage Gates')!;
    G.getCell(5, 5).value = 'yes';            // met, with the evidence column blank
    const { body } = await upload(wb);
    expect(body.ok).toBe(true);
    created.push('EV1');
    expect(body.warnings.join(' ')).toMatch(/no evidence link/i);

    const back = await download('/api/v1/excel/project?code=EV1');
    expect(String(back.getWorksheet('Stage Gates')!.getCell(5, 5).value)).toBe('no');
  }, 60_000);

  it('rejects a workbook whose sheets are not the workbook', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Sheet1').getCell(1, 1).value = 'nothing to do with us';
    const { body } = await upload(wb);
    expect(body.ok).toBe(false);
    expect(body.problems.length).toBeGreaterThan(0);
  });
});
