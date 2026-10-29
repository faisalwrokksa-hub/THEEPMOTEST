import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@pmo/db';
import { build, type NotificationKind } from './templates';
import { packData, money } from '../exports/pack-data';
import { buildTransport, type MailTransport } from './transport';

const rows = (r: unknown) => r as unknown as any[];

export type Queued = {
  tenantId: string; userId: string | null; toEmail: string;
  kind: NotificationKind; subject: string; body: string; lang: 'en' | 'ar';
  entity: string | null; entityId: string | null; dedupeKey: string;
};

@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly log = new Logger('Notify');
  private readonly transport: MailTransport = buildTransport();
  private readonly webOrigin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0].trim();
  /** Guards against a slow run overlapping the next tick on one instance. */
  private running = false;

  onModuleInit() {
    this.log.log(this.transport.status);
  }

  get transportStatus() {
    return { name: this.transport.name, delivers: this.transport.delivers, status: this.transport.status };
  }

  /**
   * Insert, ignoring anything already queued under the same key.
   *
   * ON CONFLICT DO NOTHING is the whole dedupe mechanism: the rules below are
   * conditions, not events, so they re-evaluate to true every run while the
   * condition holds. The unique index makes a repeat send impossible rather
   * than merely unlikely.
   */
  private async enqueue(tx: any, n: Queued): Promise<boolean> {
    const r = rows(await tx.execute(sql`
      INSERT INTO notifications (tenant_id, user_id, to_email, kind, subject, body, lang,
                                 entity, entity_id, dedupe_key)
      VALUES (${n.tenantId}, ${n.userId}, ${n.toEmail}, ${n.kind}, ${n.subject}, ${n.body},
              ${n.lang}, ${n.entity}, ${n.entityId}, ${n.dedupeKey})
      ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
      RETURNING id`));
    return r.length > 0;
  }

  /** Which automations a workspace has switched on. */
  private async activeTriggers(tx: any): Promise<Set<string>> {
    const r = rows(await tx.execute(sql`
      SELECT trigger FROM automations WHERE is_active`));
    return new Set(r.map((x) => x.trigger as string));
  }

  /**
   * Walk every workspace and queue what its rules call for.
   *
   * Runs tenant by tenant inside `withTenant`, so the row-level policies apply
   * exactly as they do for a request — a notification job is not a reason to
   * reach across the tenant boundary.
   */
  async scan(): Promise<{ tenants: number; queued: number }> {
    const tenants = rows(await db.execute(sql`SELECT id, name FROM tenants ORDER BY name`));
    let queued = 0;

    for (const t of tenants) {
      queued += await withTenant(t.id, async (tx) => {
        const on = await this.activeTriggers(tx);
        let n = 0;
        if (on.has('gate.blocked'))  n += await this.gateBlocked(tx, t);
        if (on.has('gate.blocked'))  n += await this.approvalsPending(tx, t);
        if (on.has('task.overdue'))  n += await this.tasksOverdue(tx, t);
        // Scheduled reports are their own thing: they are not a condition
        // going wrong, they are a date arriving.
        n += await this.scheduledReports(tx, t);
        return n;
      });
    }
    return { tenants: tenants.length, queued };
  }

  /** The accountable owner of a gate that cannot pass. */
  private async gateBlocked(tx: any, t: { id: string; name: string }): Promise<number> {
    const list = rows(await tx.execute(sql`
      SELECT g.id AS gate_id, g.seq, g.name AS gate_name,
             p.id AS project_id, p.code, p.name AS project_name,
             u.id AS user_id, u.email, u.display_name,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id)               AS total,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND c.is_met)  AS met,
             (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='pending') AS unsigned,
             coalesce((SELECT array_agg(r.title) FROM raid_items r
                WHERE r.blocks_gate_id=g.id AND r.status <> 'closed'), '{}') AS blockers
      FROM gates g
      JOIN projects p ON p.id = g.project_id
      JOIN approvals a ON a.gate_id = g.id AND a.is_accountable
      JOIN users u ON u.id = a.approver_id
      WHERE g.status = 'active'`));

    let n = 0;
    for (const g of list) {
      const reasons: string[] = [];
      if (g.total === 0) reasons.push('No criteria have been defined, so nothing has been proven.');
      else if (g.met < g.total) reasons.push(`${g.total - g.met} of ${g.total} checklist items are still unmet.`);
      if (g.unsigned > 0) reasons.push(`${g.unsigned} signature(s) outstanding.`);
      for (const b of g.blockers ?? []) reasons.push(`Open register item: ${b}`);
      if (reasons.length === 0) continue;                 // it can pass — nothing to say

      const lang: 'en' | 'ar' = 'en';
      const { subject, body } = build('gate.blocked', {
        lang, webOrigin: this.webOrigin, recipientName: g.display_name, tenantName: t.name,
        data: { projectId: g.project_id, projectCode: g.code, projectName: g.project_name,
                seq: g.seq, gateName: g.gate_name, blockers: reasons },
      });
      // Keyed on the reasons as well as the gate: if the blockers change, the
      // owner is told again, because it is now a different situation.
      const key = `gate.blocked:${g.gate_id}:${Buffer.from(reasons.join('|')).toString('base64url').slice(0, 40)}`;
      if (await this.enqueue(tx, {
        tenantId: t.id, userId: g.user_id, toEmail: g.email, kind: 'gate.blocked',
        subject, body, lang, entity: 'gate', entityId: g.gate_id, dedupeKey: key,
      })) n++;
    }
    return n;
  }

  /** Anyone with a signature outstanding. */
  private async approvalsPending(tx: any, t: { id: string; name: string }): Promise<number> {
    const list = rows(await tx.execute(sql`
      SELECT a.id, g.id AS gate_id, g.seq, g.name AS gate_name,
             p.id AS project_id, p.code, p.name AS project_name,
             u.id AS user_id, u.email, u.display_name,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met) AS unmet,
             (SELECT count(*)::int FROM raid_items r
                WHERE r.blocks_gate_id=g.id AND r.status <> 'closed') AS blockers
      FROM approvals a
      JOIN gates g ON g.id = a.gate_id AND g.status = 'active'
      JOIN projects p ON p.id = g.project_id
      JOIN users u ON u.id = a.approver_id
      WHERE a.decision = 'pending'`));

    let n = 0;
    for (const a of list) {
      const lang: 'en' | 'ar' = 'en';
      const ready = a.unmet === 0 && a.blockers === 0;
      const { subject, body } = build('approval.pending', {
        lang, webOrigin: this.webOrigin, recipientName: a.display_name, tenantName: t.name,
        data: { projectId: a.project_id, projectCode: a.code, projectName: a.project_name,
                seq: a.seq, gateName: a.gate_name, ready },
      });
      // Told once while it is waiting, and once more when it becomes signable.
      if (await this.enqueue(tx, {
        tenantId: t.id, userId: a.user_id, toEmail: a.email, kind: 'approval.pending',
        subject, body, lang, entity: 'approval', entityId: a.id,
        dedupeKey: `approval.pending:${a.id}:${ready ? 'ready' : 'waiting'}`,
      })) n++;
    }
    return n;
  }

  /** Tasks past their due date and still open. */
  private async tasksOverdue(tx: any, t: { id: string; name: string }): Promise<number> {
    const list = rows(await tx.execute(sql`
      SELECT k.id, k.title, k.due_date, p.code, p.name AS project_name,
             u.id AS user_id, u.email, u.display_name
      FROM tasks k
      JOIN projects p ON p.id = k.project_id
      JOIN users u ON u.id = k.assignee_id
      WHERE k.state <> 'done' AND k.due_date IS NOT NULL AND k.due_date < current_date`));

    let n = 0;
    for (const k of list) {
      const lang: 'en' | 'ar' = 'en';
      const { subject, body } = build('task.overdue', {
        lang, webOrigin: this.webOrigin, recipientName: k.display_name, tenantName: t.name,
        data: { title: k.title, dueDate: k.due_date, projectCode: k.code, projectName: k.project_name },
      });
      // Weekly at most: a daily nudge on the same task is noise, not pressure.
      const week = new Date().toISOString().slice(0, 4) + '-W' +
        String(Math.ceil(((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7));
      if (await this.enqueue(tx, {
        tenantId: t.id, userId: k.user_id, toEmail: k.email, kind: 'task.overdue',
        subject, body, lang, entity: 'task', entityId: k.id,
        dedupeKey: `task.overdue:${k.id}:${week}`,
      })) n++;
    }
    return n;
  }


  /**
   * How often a report definition says it runs.
   *
   * The `schedule` column is prose a human typed — "Monthly, first Tuesday",
   * "Weekly, Monday". Rather than pretend to honour "first Tuesday", this
   * reads the cadence from the leading word and uses `last_run_at` to decide
   * whether that period has elapsed. It will send on the right frequency, and
   * it will not claim to send on a precise day it cannot guarantee.
   */
  private isDue(schedule: string | null, lastRun: Date | null): boolean {
    if (!schedule) return false;                       // on demand only
    const now = new Date();
    if (!lastRun) return true;
    const days = (now.getTime() - lastRun.getTime()) / 86_400_000;
    const cadence = schedule.trim().toLowerCase();
    if (cadence.startsWith('daily')) return days >= 1;
    if (cadence.startsWith('weekly')) return days >= 7;
    if (cadence.startsWith('fortnightly')) return days >= 14;
    if (cadence.startsWith('monthly')) {
      return now.getUTCFullYear() !== lastRun.getUTCFullYear()
          || now.getUTCMonth() !== lastRun.getUTCMonth();
    }
    if (cadence.startsWith('quarterly')) return days >= 90;
    return false;                                      // a cadence we do not know
  }

  /**
   * Board packs that have come round again.
   *
   * Recipients are the people who could act on one — owners, admins and PMO
   * leads — rather than the free-text `audience` column, which is a label for
   * humans ("Steering group") and not a list of addresses. Naming that
   * plainly is better than guessing at a mapping that would silently miss
   * people.
   */
  private async scheduledReports(tx: any, t: { id: string; name: string }): Promise<number> {
    const due = rows(await tx.execute(sql`
      SELECT id, name, kind, audience, schedule, last_run_at
      FROM report_defs WHERE schedule IS NOT NULL`))
      .filter((r) => this.isDue(r.schedule, r.last_run_at ? new Date(r.last_run_at) : null));
    if (due.length === 0) return 0;

    const recipients = rows(await tx.execute(sql`
      SELECT u.id, u.email, u.display_name FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${t.id}
      WHERE m.is_active=true AND u.is_active=true AND m.role IN ('owner', 'admin', 'pmo_lead')`));
    if (recipients.length === 0) return 0;

    const d = await packData(t.id);
    const drawn = d.money.budget ? Math.round((d.money.actual / d.money.budget) * 100) : 0;
    const period = new Date().toISOString().slice(0, 7);

    let n = 0;
    for (const r of due) {
      for (const who of recipients) {
        const lang: 'en' | 'ar' = 'en';
        const { subject, body } = build('report.board_pack', {
          lang, webOrigin: this.webOrigin, recipientName: who.display_name, tenantName: t.name,
          data: { period, projects: d.health.total, blocked: d.gatesSummary.blocked,
                  active: d.gatesSummary.active, drawn,
                  budget: money(d.money.budget), actual: money(d.money.actual) },
        });
        if (await this.enqueue(tx, {
          tenantId: t.id, userId: who.id, toEmail: who.email, kind: 'report.board_pack',
          subject, body, lang, entity: 'report', entityId: r.id,
          // Per report, per person, per period — so a second run in the same
          // month does not send the same pack twice.
          dedupeKey: `report:${r.id}:${who.id}:${period}`,
        })) n++;
      }
      await tx.execute(sql`UPDATE report_defs SET last_run_at = now() WHERE id = ${r.id}`);
    }
    return n;
  }

  /**
   * Attempt delivery of what is queued.
   *
   * With no transport the rows stay queued rather than being marked failed:
   * they are not undeliverable, they are waiting for configuration, and the
   * difference matters when someone later asks what was missed.
   */
  async flush(limit = 50): Promise<{ sent: number; failed: number; held: number }> {
    if (!this.transport.delivers) {
      const [c] = rows(await db.execute(sql`
        SELECT count(*)::int AS n FROM notifications WHERE status = 'queued'`));
      return { sent: 0, failed: 0, held: c?.n ?? 0 };
    }

    const due = rows(await db.execute(sql`
      SELECT id, to_email, subject, body, lang FROM notifications
      WHERE status = 'queued' ORDER BY created_at LIMIT ${limit}`));

    let sent = 0, failed = 0;
    for (const m of due) {
      const r = await this.transport.send({
        to: m.to_email, subject: m.subject, body: m.body, lang: m.lang,
      });
      if (r.ok) {
        await db.execute(sql`
          UPDATE notifications SET status='sent', sent_at=now(), error=NULL WHERE id=${m.id}`);
        sent++;
      } else {
        await db.execute(sql`
          UPDATE notifications SET status='failed', error=${r.error} WHERE id=${m.id}`);
        failed++;
      }
    }
    return { sent, failed, held: 0 };
  }

  /**
   * One tick: work out what should be said, then try to say it.
   *
   * Hourly rather than by-the-minute because every rule here is a condition
   * that persists — nothing is lost by noticing it an hour later, and an
   * hourly cadence keeps a stuck gate from generating a stream of mail.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'notify' })
  async tick() {
    if (this.running) { this.log.warn('Previous run still going; skipping this tick.'); return; }
    this.running = true;
    try {
      const s = await this.scan();
      const f = await this.flush();
      if (s.queued || f.sent || f.failed) {
        this.log.log(`queued ${s.queued} across ${s.tenants} workspaces · sent ${f.sent} · failed ${f.failed}` +
                     (f.held ? ` · ${f.held} held, no transport` : ''));
      }
    } catch (e) {
      // SMTP/provider errors may contain customer email addresses or message bodies.
      this.log.error('Notification run failed; inspect restricted provider telemetry.');
    } finally {
      this.running = false;
    }
  }
}
