import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant, auditEvents } from '@pmo/db';
import { DEFAULT_GATES, WORKBOOK } from '@pmo/contracts';
import { previewImport } from './import-preflight.mjs';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { buildWorkbook, parseWorkbook, type WorkbookData } from './workbook';

const rows = (r: unknown) => r as unknown as any[];

export type ImportReport = {
  ok: boolean;
  projectCode?: string;
  /** What the import did, once it did something. */
  mode?: 'created' | 'updated';
  created: Record<string, number>;
  problems: string[];
  warnings: string[];
  /**
   * Set instead of `problems` when the only thing wrong is that the code is
   * already taken. The caller can offer to update that project and send the
   * same file back with mode 'update'; `holds` is what is there now, so the
   * question can say what is at stake rather than just asking twice.
   */
  conflict?: {
    code: string;
    name: string;
    createdAt: string | null;
    holds: Record<string, number>;
  };
};

/**
 * What an update replaces wholesale.
 *
 * These describe the state of the project right now, and the workbook is the
 * statement of that state — a schedule that still lists a task the sheet has
 * dropped is wrong, not historic.
 *
 * Deliberately absent: gates, gate criteria, approvals and signatures, which
 * are evidence that somebody accountable signed something and must survive a
 * re-upload; documents, which can be the evidence behind a criterion; the
 * register, where an item carries a history of its own; and updates, which
 * are a conversation. Those four are merged instead, never deleted.
 */
export const REPLACED_ON_UPDATE = ['schedule', 'costs', 'benefits',
                                   'stakeholders', 'resources'] as const;

@Injectable()
export class ExcelService {
  private ctx() { return currentContext(); }

  private async audit(tx: any, entity: string, entityId: string, action: string, diff?: unknown) {
    const { tenantId, userId } = this.ctx();
    await tx.insert(auditEvents).values({
      tenantId, actorId: userId, entity, entityId, action, diff: (diff ?? null) as any,
    });
  }

  /** Safe preflight: no writes and no project mutation. */
  async previewWorkbook(buf: Buffer) {
    requireCapability('pmoa_manage_projects');
    requireCapability('pmoa_manage_finance');
    return previewImport(await parseWorkbook(buf), WORKBOOK);
  }

  /** The blank master workbook: no data, gates and their checklist prefilled. */
  async template(lang: 'en' | 'ar') {
    return buildWorkbook({}, lang);
  }

  /**
   * One project, exported in the same shape as the template — so a customer can
   * download it, edit it in Excel, and upload it back.
   */
  async exportProject(code: string, lang: 'en' | 'ar'): Promise<{ buf: Buffer; name: string }> {
    // Exports contain full cost entries, approved budgets and benefit targets.
    requireCapability('pmoa_view_financials');
    const { tenantId } = this.ctx();
    const data = await withTenant(tenantId, async (tx) => {
      const [p] = rows(await tx.execute(sql`
        SELECT p.*, pr.name AS program_name, pf.name AS portfolio_name, u.email AS owner_email
        FROM projects p
        LEFT JOIN programs pr ON pr.id = p.program_id
        LEFT JOIN portfolios pf ON pf.id = pr.portfolio_id
        LEFT JOIN users u ON u.id = p.owner_id
        WHERE upper(p.code) = upper(${code})`));
      if (!p) throw new NotFoundException(`No project with code "${code}" in this workspace`);

      const gates = rows(await tx.execute(sql`
        SELECT g.seq, g.name AS gate_name, c.label AS criterion, c.evidence_url, c.is_met
        FROM gates g LEFT JOIN gate_criteria c ON c.gate_id = g.id
        WHERE g.project_id = ${p.id} ORDER BY g.seq, c.created_at`));

      const schedule = rows(await tx.execute(sql`
        SELECT name, kind, baseline_start, baseline_end, start_date, end_date,
               progress_pct, is_critical
        FROM schedule_items WHERE project_id = ${p.id} ORDER BY start_date NULLS LAST, name`));

      const raid = rows(await tx.execute(sql`
        SELECT r.kind, r.title, r.detail, r.severity, r.likelihood, r.status,
               u.email AS owner_email, r.due_date, g.seq AS blocks_gate
        FROM raid_items r
        LEFT JOIN users u ON u.id = r.owner_id
        LEFT JOIN gates g ON g.id = r.blocks_gate_id
        WHERE r.project_id = ${p.id} ORDER BY r.created_at`));

      const costs = rows(await tx.execute(sql`
        SELECT kind, category, amount, currency, period, note
        FROM cost_entries WHERE project_id = ${p.id} ORDER BY kind, category`));

      const benefits = rows(await tx.execute(sql`
        SELECT b.name, b.measure, b.baseline, b.target, b.actual, b.status,
               b.review_date, u.email AS owner_email
        FROM benefits b LEFT JOIN users u ON u.id = b.owner_id
        WHERE b.project_id = ${p.id} ORDER BY b.name`));

      const stakeholders = rows(await tx.execute(sql`
        SELECT name, organisation, role, influence, interest, is_external, email, phone
        FROM stakeholders WHERE project_id = ${p.id} OR project_id IS NULL ORDER BY name`));

      const resources = rows(await tx.execute(sql`
        SELECT u.email AS person_email, a.role, a.allocation_pct, a.start_date, a.end_date
        FROM allocations a JOIN users u ON u.id = a.user_id
        WHERE a.project_id = ${p.id} ORDER BY u.email`));

      const documents = rows(await tx.execute(sql`
        SELECT d.name, d.kind, d.version, d.status, d.url, u.email AS owner_email
        FROM documents d LEFT JOIN users u ON u.id = d.owner_id
        WHERE d.project_id = ${p.id} ORDER BY d.name`));

      const updates = rows(await tx.execute(sql`
        SELECT up.kind, up.body, u.email AS author_email, up.created_at
        FROM updates up LEFT JOIN users u ON u.id = up.author_id
        WHERE up.project_id = ${p.id} ORDER BY up.created_at DESC`));

      const wd: WorkbookData = {
        project: [{
          code: p.code, name: p.name, portfolio: p.portfolio_name, program: p.program_name,
          owner: p.owner_email, status: p.status, health: p.health,
          progressPct: p.progress_pct, startDate: p.start_date, endDate: p.end_date,
          budgetAmount: p.budget_amount, budgetCurrency: p.budget_currency,
        }],
        gates: gates.filter((g) => g.criterion).map((g) => ({
          seq: g.seq, gateName: g.gate_name, criterion: g.criterion,
          evidenceUrl: g.evidence_url, isMet: g.is_met,
        })),
        schedule: schedule.map((s) => ({
          name: s.name, kind: s.kind, baselineStart: s.baseline_start, baselineEnd: s.baseline_end,
          startDate: s.start_date, endDate: s.end_date, progressPct: s.progress_pct,
          isCritical: s.is_critical,
        })),
        raid: raid.map((r) => ({
          kind: r.kind, title: r.title, detail: r.detail, severity: r.severity,
          likelihood: r.likelihood, status: r.status, owner: r.owner_email,
          dueDate: r.due_date, blocksGate: r.blocks_gate,
        })),
        costs: costs.map((c) => ({
          kind: c.kind, category: c.category, amount: c.amount, currency: c.currency,
          period: c.period, note: c.note,
        })),
        benefits: benefits.map((b) => ({
          name: b.name, measure: b.measure, baseline: b.baseline, target: b.target,
          actual: b.actual, status: b.status, reviewDate: b.review_date, owner: b.owner_email,
        })),
        stakeholders: stakeholders.map((s) => ({
          name: s.name, organisation: s.organisation, role: s.role, influence: s.influence,
          interest: s.interest, isExternal: s.is_external, email: s.email, phone: s.phone,
        })),
        resources: resources.map((r) => ({
          person: r.person_email, role: r.role, allocationPct: r.allocation_pct,
          startDate: r.start_date, endDate: r.end_date,
        })),
        documents: documents.map((d) => ({
          name: d.name, kind: d.kind, version: d.version, status: d.status,
          url: d.url, owner: d.owner_email,
        })),
        updates: updates.map((u) => ({
          kind: u.kind, body: u.body, author: u.author_email, postedAt: u.created_at,
        })),
      };
      return { wd, code: p.code };
    });

    return { buf: await buildWorkbook(data.wd, lang), name: `${data.code}.xlsx` };
  }

  /**
   * Loads a filled workbook.
   *
   * The whole workbook lands in one transaction: a file that fails halfway
   * would leave a project with a schedule and no gates, which is worse than
   * no project at all. Unknown owners and unresolvable gate references are
   * reported as warnings and the row is kept — an import that refuses a
   * thousand rows over one stale email address is not usable.
   */
  async importWorkbook(buf: Buffer, mode: 'create' | 'update' = 'create'): Promise<ImportReport> {
    requireCapability('pmoa_manage_projects');
    // Import replaces cost entries, benefits and approved project budgets.
    requireCapability('pmoa_manage_finance');
    const { tenantId, userId } = this.ctx();

    const { sheets, problems, notes } = await parseWorkbook(buf);
    if (problems.length) return { ok: false, created: {}, problems, warnings: [] };

    const head = (sheets.project ?? [])[0];
    if (!head?.code || !head?.name) {
      return { ok: false, created: {}, warnings: [],
        problems: ['The Project sheet needs at least a project code and a project name.'] };
    }

    const warnings: string[] = [...notes];
    const created: Record<string, number> = {};

    return withTenant(tenantId, async (tx) => {
      const code = String(head.code).trim();
      const [existing] = rows(await tx.execute(sql`
        SELECT id, name, created_at FROM projects WHERE upper(code) = upper(${code})`));

      /*
       * A code already in use is a question, not a failure. Almost every time
       * it happens the customer exported this very project, edited it and is
       * sending it back; refusing that and telling them to delete the project
       * first is telling them to throw away its gate signatures to fix a typo.
       * So: say what is there, and let them decide.
       */
      if (existing && mode !== 'update') {
        return {
          ok: false, created: {}, problems: [], warnings,
          conflict: {
            code, name: existing.name,
            createdAt: existing.created_at ? new Date(existing.created_at).toISOString() : null,
            holds: await this.countChildren(tx, existing.id),
          },
        };
      }
      if (!existing && mode === 'update') {
        warnings.push(`Nothing here used the code "${code}", so the project was created rather than updated.`);
      }

      // People are matched by email; anyone unknown becomes a warning, not a stop.
      const people = new Map<string, string>();
      for (const u of rows(await tx.execute(sql`
        SELECT u.id, lower(u.email) AS email FROM users u
        JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId} AND m.is_active=true AND u.is_active=true`))) {
        people.set(u.email, u.id);
      }
      const person = (email: unknown, where: string): string | null => {
        if (!email) return null;
        const id = people.get(String(email).trim().toLowerCase());
        if (!id) warnings.push(`${where}: "${email}" is not a member of this workspace — left unassigned.`);
        return id ?? null;
      };

      // Portfolio and programme are created when named but absent, because
      // requiring them to exist first defeats the point of a single file.
      let programId: string | null = null;
      if (head.program) {
        let portfolioId: string | null = null;
        const pfName = String(head.portfolio ?? 'Imported').trim();
        const [pf] = rows(await tx.execute(sql`
          SELECT id FROM portfolios WHERE lower(name) = lower(${pfName})`));
        if (pf) portfolioId = pf.id;
        else {
          const [n] = rows(await tx.execute(sql`
            INSERT INTO portfolios (tenant_id, name) VALUES (${tenantId}, ${pfName}) RETURNING id`));
          portfolioId = n.id; created.portfolios = (created.portfolios ?? 0) + 1;
        }
        const pgName = String(head.program).trim();
        const [pg] = rows(await tx.execute(sql`
          SELECT id FROM programs WHERE lower(name) = lower(${pgName}) AND portfolio_id = ${portfolioId}`));
        if (pg) programId = pg.id;
        else {
          const [n] = rows(await tx.execute(sql`
            INSERT INTO programs (tenant_id, portfolio_id, name)
            VALUES (${tenantId}, ${portfolioId}, ${pgName}) RETURNING id`));
          programId = n.id; created.programs = (created.programs ?? 0) + 1;
        }
      }

      const ownerId = person(head.owner, 'Project owner');
      const updating = Boolean(existing);
      let proj: { id: string; code: string };

      if (updating) {
        // The programme is only moved when the sheet names one: a blank cell
        // means "not stated here", not "detach this project from its programme".
        const [p] = rows(await tx.execute(sql`
          UPDATE projects SET
            program_id = ${head.program ? programId : sql`program_id`},
            name = ${String(head.name)},
            status = ${(head.status ?? 'planning') as any}::project_status,
            health = ${(head.health ?? 'on_track') as any}::health,
            progress_pct = ${Number(head.progressPct ?? 0)},
            start_date = ${(head.startDate ?? null) as any},
            end_date = ${(head.endDate ?? null) as any},
            budget_amount = ${head.budgetAmount != null ? String(head.budgetAmount) : null},
            budget_currency = ${String(head.budgetCurrency ?? 'SAR')},
            owner_id = ${ownerId ?? sql`owner_id`}
          WHERE id = ${existing.id} RETURNING id, code`));
        proj = p;
        created.projects = 1;

        // Everything that describes the project's current state goes, so a row
        // dropped from the sheet is dropped here. What proves something — gates,
        // criteria, signatures, documents, the register, the update stream — is
        // left alone and merged below.
        await tx.execute(sql`DELETE FROM schedule_items WHERE project_id = ${proj.id}`);
        await tx.execute(sql`DELETE FROM cost_entries   WHERE project_id = ${proj.id}`);
        await tx.execute(sql`DELETE FROM benefits       WHERE project_id = ${proj.id}`);
        await tx.execute(sql`DELETE FROM stakeholders   WHERE project_id = ${proj.id}`);
        await tx.execute(sql`DELETE FROM allocations    WHERE project_id = ${proj.id}`);
      } else {
        const [p] = rows(await tx.execute(sql`
          INSERT INTO projects (tenant_id, program_id, code, name, status, health,
                                progress_pct, start_date, end_date, budget_amount,
                                budget_currency, owner_id)
          VALUES (${tenantId}, ${programId}, ${code}, ${String(head.name)},
                  ${(head.status ?? 'planning') as any}::project_status,
                  ${(head.health ?? 'on_track') as any}::health,
                  ${Number(head.progressPct ?? 0)},
                  ${(head.startDate ?? null) as any}, ${(head.endDate ?? null) as any},
                  ${head.budgetAmount != null ? String(head.budgetAmount) : null},
                  ${String(head.budgetCurrency ?? 'SAR')}, ${ownerId})
          RETURNING id, code`));
        proj = p;
        created.projects = 1;
      }

      // Gates always exist, even if the sheet only mentions some of them: a
      // project missing gate 3 cannot be governed through to handover. On an
      // update they are already there and are left exactly as they stand.
      const gateRows = sheets.gates ?? [];
      const namesFromSheet = new Map<number, string>();
      for (const g of gateRows) {
        const seq = Number(g.seq);
        if (Number.isInteger(seq) && g.gateName) namesFromSheet.set(seq, String(g.gateName));
      }
      const gateId = new Map<number, string>();
      const gateStatus = new Map<number, string>();
      if (updating) {
        // The workbook transaction already locked the project. Take gate locks
        // in sequence before changing criteria or blockers so imports cannot
        // race with an approval or stage-gate advance.
        for (const g of rows(await tx.execute(sql`
          SELECT id, seq, status FROM gates
          WHERE project_id = ${proj.id} ORDER BY seq FOR UPDATE`))) {
          gateId.set(Number(g.seq), g.id);
          gateStatus.set(Number(g.seq), g.status);
        }
      } else {
        for (const def of DEFAULT_GATES) {
          const [g] = rows(await tx.execute(sql`
            INSERT INTO gates (tenant_id, project_id, seq, name, status)
            VALUES (${tenantId}, ${proj.id}, ${def.seq},
                    ${namesFromSheet.get(def.seq) ?? def.name},
                    ${def.seq === 0 ? 'active' : 'locked'}::gate_status)
            RETURNING id`));
          gateId.set(def.seq, g.id);
        }
        created.gates = DEFAULT_GATES.length;
      }

      /*
       * Criteria are added, never removed and never un-met.
       *
       * A criterion already signed off is the record of somebody accountable
       * saying it was done. Re-reading it from a spreadsheet cell cannot undo
       * that, so an existing label is left exactly as it is and only genuinely
       * new ones are written.
       */
      const seenCriteria = new Set<string>();
      if (updating) {
        for (const c of rows(await tx.execute(sql`
          SELECT g.seq, lower(c.label) AS label FROM gate_criteria c
          JOIN gates g ON g.id = c.gate_id WHERE g.project_id = ${proj.id}`))) {
          seenCriteria.add(`${c.seq}\u0000${c.label}`);
        }
      }
      let criteria = 0, kept = 0;
      for (const row of gateRows) {
        const seq = Number(row.seq);
        const gid = gateId.get(seq);
        if (!gid || !row.criterion) continue;
        const key = `${seq}\u0000${String(row.criterion).toLowerCase()}`;
        if (seenCriteria.has(key)) { kept++; continue; }
        if (updating && gateStatus.get(seq) === 'approved') {
          warnings.push(`Gate ${seq} is approved: the new criterion "${row.criterion}" was not added to a signed-off gate.`);
          continue;
        }
        seenCriteria.add(key);
        const met = row.isMet === true && !!row.evidenceUrl;
        if (row.isMet === true && !row.evidenceUrl) {
          warnings.push(`Gate ${seq} "${row.criterion}": marked met with no evidence link — recorded as not met.`);
        }
        await tx.execute(sql`
          INSERT INTO gate_criteria (tenant_id, gate_id, label, is_met, evidence_url, met_by, met_at)
          VALUES (${tenantId}, ${gid}, ${String(row.criterion)}, ${met},
                  ${(row.evidenceUrl ?? null) as any},
                  ${met ? userId : null}, ${met ? sql`now()` : null})`);
        criteria++;
      }
      created.criteria = criteria;
      if (kept) {
        warnings.push(`${kept} gate criteria were already on this project and were left as they stand, ` +
                      `signatures and all.`);
      }

      // A gate with no checklist can never pass — nothing has been proven. The
      // import will not invent criteria, but it will say so plainly.
      const sg0Criteria = gateRows.filter((r) => Number(r.seq) === 0 && r.criterion).length;
      if (!updating && sg0Criteria === 0) {
        warnings.push(
          'Gate 0 has no criteria, so it cannot be passed until some are added. ' +
          'The blank template ships the standard checklist if you want a starting point.');
      }

      if (ownerId && !updating) {
        await tx.execute(sql`
          INSERT INTO approvals (tenant_id, gate_id, approver_id, is_accountable, decision)
          VALUES (${tenantId}, ${gateId.get(0)}, ${ownerId}, true, 'pending')`);
      }

      for (const s of sheets.schedule ?? []) {
        if (!s.name) continue;
        await tx.execute(sql`
          INSERT INTO schedule_items (tenant_id, project_id, name, kind, baseline_start,
                                      baseline_end, start_date, end_date, progress_pct, is_critical)
          VALUES (${tenantId}, ${proj.id}, ${String(s.name)},
                  ${(s.kind ?? 'activity') as any}::schedule_kind,
                  ${(s.baselineStart ?? null) as any}, ${(s.baselineEnd ?? null) as any},
                  ${(s.startDate ?? null) as any}, ${(s.endDate ?? null) as any},
                  ${Number(s.progressPct ?? 0)}, ${s.isCritical === true})`);
        created.schedule = (created.schedule ?? 0) + 1;
      }

      /*
       * The register is matched on title, because a risk is a thing with a
       * history — who owns it, what it blocks — and re-importing the sheet it
       * came from should move it on, not replace it with a copy of itself.
       * Items raised in the app and absent from the sheet are left alone.
       */
      const raidByTitle = new Map<string, string>();
      if (updating) {
        for (const r of rows(await tx.execute(sql`
          SELECT id, lower(title) AS title FROM raid_items WHERE project_id = ${proj.id}`))) {
          raidByTitle.set(r.title, r.id);
        }
      }
      for (const r of sheets.raid ?? []) {
        if (!r.title || !r.kind) continue;
        const blocks = r.blocksGate != null ? gateId.get(Number(r.blocksGate)) ?? null : null;
        if (r.blocksGate != null && !blocks) {
          warnings.push(`Register item "${r.title}": gate ${r.blocksGate} is not 0–6 — not linked.`);
        }
        const owner = person(r.owner, `Register item "${r.title}"`);
        const hit = raidByTitle.get(String(r.title).toLowerCase());
        if (hit) {
          await tx.execute(sql`
            UPDATE raid_items SET
              kind = ${r.kind as any}::raid_kind, detail = ${(r.detail ?? null) as any},
              severity = ${r.severity != null ? Number(r.severity) : null},
              likelihood = ${r.likelihood != null ? Number(r.likelihood) : null},
              status = ${(r.status ?? 'open') as any}::raid_status,
              owner_id = ${owner ?? sql`owner_id`},
              due_date = ${(r.dueDate ?? null) as any},
              blocks_gate_id = ${blocks}
            WHERE id = ${hit}`);
          created.raidUpdated = (created.raidUpdated ?? 0) + 1;
          continue;
        }
        await tx.execute(sql`
          INSERT INTO raid_items (tenant_id, project_id, kind, title, detail, severity,
                                  likelihood, status, owner_id, due_date, blocks_gate_id)
          VALUES (${tenantId}, ${proj.id}, ${r.kind as any}::raid_kind, ${String(r.title)},
                  ${(r.detail ?? null) as any},
                  ${r.severity != null ? Number(r.severity) : null},
                  ${r.likelihood != null ? Number(r.likelihood) : null},
                  ${(r.status ?? 'open') as any}::raid_status,
                  ${owner}, ${(r.dueDate ?? null) as any}, ${blocks})`);
        created.raid = (created.raid ?? 0) + 1;
      }

      for (const c of sheets.costs ?? []) {
        if (!c.kind || !c.category || c.amount == null) continue;
        await tx.execute(sql`
          INSERT INTO cost_entries (tenant_id, project_id, kind, category, amount, currency, period, note)
          VALUES (${tenantId}, ${proj.id}, ${c.kind as any}::cost_kind, ${String(c.category)},
                  ${String(c.amount)}, ${String(c.currency ?? 'SAR')},
                  ${(c.period ?? null) as any}, ${(c.note ?? null) as any})`);
        created.costs = (created.costs ?? 0) + 1;
      }

      for (const b of sheets.benefits ?? []) {
        if (!b.name || !b.measure) continue;
        await tx.execute(sql`
          INSERT INTO benefits (tenant_id, project_id, name, measure, baseline, target,
                                actual, status, review_date, owner_id)
          VALUES (${tenantId}, ${proj.id}, ${String(b.name)}, ${String(b.measure)},
                  ${b.baseline != null ? String(b.baseline) : null},
                  ${b.target != null ? String(b.target) : null},
                  ${b.actual != null ? String(b.actual) : null},
                  ${(b.status ?? 'planned') as any}::benefit_status,
                  ${(b.reviewDate ?? null) as any},
                  ${person(b.owner, `Benefit "${b.name}"`)})`);
        created.benefits = (created.benefits ?? 0) + 1;
      }

      for (const s of sheets.stakeholders ?? []) {
        if (!s.name) continue;
        await tx.execute(sql`
          INSERT INTO stakeholders (tenant_id, project_id, name, organisation, role,
                                    influence, interest, is_external, email, phone)
          VALUES (${tenantId}, ${proj.id}, ${String(s.name)},
                  ${(s.organisation ?? null) as any}, ${(s.role ?? null) as any},
                  ${s.influence != null ? Number(s.influence) : null},
                  ${s.interest != null ? Number(s.interest) : null},
                  ${s.isExternal === true}, ${(s.email ?? null) as any}, ${(s.phone ?? null) as any})`);
        created.stakeholders = (created.stakeholders ?? 0) + 1;
      }

      /*
       * Resources, documents and updates. Each names its person by email and
       * skips the row when that email is not a member here — person() records
       * the warning rather than failing the whole import, which matters most
       * on these three, where a missing colleague should not cost a customer
       * the rest of a working workbook.
       */
      for (const r of sheets.resources ?? []) {
        const uid = person(r.person, `Resource "${r.role ?? ''}"`);
        if (!uid || !r.role) continue;
        await tx.execute(sql`
          INSERT INTO allocations (tenant_id, user_id, project_id, role, allocation_pct,
                                   start_date, end_date)
          VALUES (${tenantId}, ${uid}, ${proj.id}, ${String(r.role)},
                  ${r.allocationPct != null ? Number(r.allocationPct) : 0},
                  ${(r.startDate ?? null) as any}, ${(r.endDate ?? null) as any})`);
        created.resources = (created.resources ?? 0) + 1;
      }

      // Documents are matched on name and never deleted: one of them may be the
      // evidence a gate criterion points at, and dropping it would quietly
      // unpick a signature.
      const docByName = new Map<string, string>();
      if (updating) {
        for (const d of rows(await tx.execute(sql`
          SELECT id, lower(name) AS name FROM documents WHERE project_id = ${proj.id}`))) {
          docByName.set(d.name, d.id);
        }
      }
      for (const d of sheets.documents ?? []) {
        if (!d.name || !d.kind) continue;
        const owner = person(d.owner, `Document "${d.name}"`);
        const hit = docByName.get(String(d.name).toLowerCase());
        if (hit) {
          await tx.execute(sql`
            UPDATE documents SET kind = ${String(d.kind)}, version = ${String(d.version ?? '1.0')},
              status = ${(d.status ?? 'draft') as any}::doc_status,
              url = ${(d.url ?? null) as any}, owner_id = ${owner ?? sql`owner_id`},
              updated_at = now()
            WHERE id = ${hit}`);
          created.documentsUpdated = (created.documentsUpdated ?? 0) + 1;
          continue;
        }
        await tx.execute(sql`
          INSERT INTO documents (tenant_id, project_id, name, kind, version, status, url, owner_id)
          VALUES (${tenantId}, ${proj.id}, ${String(d.name)}, ${String(d.kind)},
                  ${String(d.version ?? '1.0')}, ${(d.status ?? 'draft') as any}::doc_status,
                  ${(d.url ?? null) as any}, ${owner})`);
        created.documents = (created.documents ?? 0) + 1;
      }

      // Updates are a conversation, so they are only ever appended, and an
      // entry already recorded word for word is taken to be the same entry
      // coming back round rather than someone saying it twice.
      const saidAlready = new Set<string>();
      if (updating) {
        for (const u of rows(await tx.execute(sql`
          SELECT body FROM updates WHERE project_id = ${proj.id}`))) {
          saidAlready.add(String(u.body).trim());
        }
      }
      for (const u of sheets.updates ?? []) {
        if (!u.body || saidAlready.has(String(u.body).trim())) continue;
        saidAlready.add(String(u.body).trim());
        await tx.execute(sql`
          INSERT INTO updates (tenant_id, project_id, author_id, kind, body)
          VALUES (${tenantId}, ${proj.id}, ${person(u.author, 'Update')},
                  ${String(u.kind ?? 'note')}, ${String(u.body)})`);
        created.updates = (created.updates ?? 0) + 1;
      }

      await this.audit(tx, 'project', proj.id,
        updating ? 'project.reimported' : 'project.imported',
        { code: proj.code, created, warnings });
      return {
        ok: true, projectCode: proj.code, mode: updating ? 'updated' as const : 'created' as const,
        created, problems: [], warnings,
      };
    });
  }

  /** How much is hanging off a project, for the "update this instead?" question. */
  private async countChildren(tx: any, projectId: string): Promise<Record<string, number>> {
    const [n] = rows(await tx.execute(sql`
      SELECT
        (SELECT count(*) FROM schedule_items WHERE project_id = ${projectId}) AS schedule,
        (SELECT count(*) FROM raid_items     WHERE project_id = ${projectId}) AS raid,
        (SELECT count(*) FROM cost_entries   WHERE project_id = ${projectId}) AS costs,
        (SELECT count(*) FROM benefits       WHERE project_id = ${projectId}) AS benefits,
        (SELECT count(*) FROM stakeholders   WHERE project_id = ${projectId}) AS stakeholders,
        (SELECT count(*) FROM allocations    WHERE project_id = ${projectId}) AS resources,
        (SELECT count(*) FROM documents      WHERE project_id = ${projectId}) AS documents,
        (SELECT count(*) FROM updates        WHERE project_id = ${projectId}) AS updates,
        (SELECT count(*) FROM gate_criteria c JOIN gates g ON g.id = c.gate_id
          WHERE g.project_id = ${projectId} AND c.is_met) AS "criteria signed off"`));
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(n ?? {})) if (Number(v) > 0) out[k] = Number(v);
    return out;
  }
}
