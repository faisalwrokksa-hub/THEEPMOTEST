import { translator, type Lang } from '@pmo/contracts';

/**
 * What a notification actually says.
 *
 * Every one of these answers three questions in order: what happened, why it
 * matters, and what to do about it. A notification that only says "gate SG4 is
 * blocked" makes the reader open the platform to find out whether they care —
 * which is the behaviour that gets notifications filtered to a folder.
 */

export type NotificationKind =
  | 'gate.blocked'
  | 'approval.pending'
  | 'task.overdue'
  | 'gate.passed'
  | 'report.board_pack';

export type Built = { subject: string; body: string };

type Ctx = {
  lang: Lang;
  webOrigin: string;
  recipientName: string;
  tenantName: string;
  /** Free-form per kind; each builder documents what it needs. */
  data: Record<string, any>;
};

const sign = (t: (s: string) => string, c: Ctx) =>
  `\n\n— ${c.tenantName} · The EPMO\n${c.webOrigin}\n\n` +
  t('You are receiving this because a notification rule in this workspace names your role. An administrator can change the rules under Automations.');

export function build(kind: NotificationKind, c: Ctx): Built {
  const t = translator(c.lang);
  const d = c.data;
  const hi = `${t('Hello')} ${c.recipientName},\n\n`;

  switch (kind) {
    case 'gate.blocked': {
      const reasons = (d.blockers as string[]).map((b) => `  · ${b}`).join('\n');
      return {
        subject: `${d.projectCode} — ${t('gate blocked')}: SG${d.seq} ${d.gateName}`,
        body: hi +
          `${t('The gate')} SG${d.seq} ${d.gateName} ${t('on')} ${d.projectCode} — ${d.projectName} ` +
          `${t('cannot be passed, so the funding it releases is on hold')}.\n\n` +
          `${t('What is holding it')}:\n${reasons}\n\n` +
          `${t('You are named as accountable for this gate')}.\n\n` +
          `${c.webOrigin}/governance/${d.projectId}` +
          sign(t, c),
      };
    }

    case 'approval.pending': {
      const ready = d.ready
        ? t('The checklist is complete and nothing is blocking, so it is ready for your signature now.')
        : t('It is not signable yet — the checklist or an open register item still has to be cleared first. You will not be asked again when that changes; check the gate when you are ready.');
      return {
        subject: `${t('Signature needed')}: ${d.projectCode} SG${d.seq} ${d.gateName}`,
        body: hi +
          `${t('You are the approver on')} SG${d.seq} ${d.gateName} ${t('for')} ${d.projectCode} — ${d.projectName}.\n\n` +
          `${ready}\n\n${c.webOrigin}/governance/${d.projectId}` +
          sign(t, c),
      };
    }

    case 'task.overdue': {
      return {
        subject: `${t('Overdue')}: ${d.title}`,
        body: hi +
          `${t('This task was due on')} ${d.dueDate} ${t('and is still open')}:\n\n` +
          `  ${d.title}\n  ${d.projectCode} — ${d.projectName}\n\n` +
          (d.blocksGate
            ? `${t('It is holding a stage gate, so it is not only late — it is stopping the project moving.')}\n\n`
            : '') +
          `${c.webOrigin}/board` +
          sign(t, c),
      };
    }

    case 'gate.passed': {
      return {
        subject: `${d.projectCode} — ${t('gate passed')}: SG${d.seq} ${d.gateName}`,
        body: hi +
          `SG${d.seq} ${d.gateName} ${t('on')} ${d.projectCode} — ${d.projectName} ${t('has been passed')}.\n\n` +
          (d.nextGate
            ? `${t('The next gate is now open')}: SG${d.nextSeq} ${d.nextGate}. ` +
              `${t('Its checklist has been created and an accountable owner assigned.')}\n\n`
            : `${t('That was the final gate — this project is complete.')}\n\n`) +
          `${c.webOrigin}/governance/${d.projectId}` +
          sign(t, c),
      };
    }

    case 'report.board_pack': {
      return {
        subject: `${c.tenantName} — ${t('Portfolio Board Pack')} (${d.period})`,
        body: hi +
          `${t('The board pack for')} ${d.period} ${t('is ready')}.\n\n` +
          `  ${d.projects} ${t('projects')} · ${d.blocked} ${t('of')} ${d.active} ${t('gates blocked')} · ` +
          `${d.drawn}% ${t('of budget drawn')}\n\n` +
          `${t('Open it, or download it as Word or PowerPoint, here')}:\n` +
          `${c.webOrigin}/reports` +
          sign(t, c),
      };
    }
  }
}

/** The strings above, so a missing translation is visible in one place. */
export const TEMPLATE_STRINGS = [
  'Hello', 'gate blocked', 'The gate', 'on',
  'cannot be passed, so the funding it releases is on hold',
  'What is holding it', 'You are named as accountable for this gate',
  'Signature needed', 'You are the approver on', 'for',
  'The checklist is complete and nothing is blocking, so it is ready for your signature now.',
  'It is not signable yet — the checklist or an open register item still has to be cleared first. You will not be asked again when that changes; check the gate when you are ready.',
  'Overdue', 'This task was due on', 'and is still open',
  'It is holding a stage gate, so it is not only late — it is stopping the project moving.',
  'gate passed', 'has been passed', 'The next gate is now open',
  'Its checklist has been created and an accountable owner assigned.',
  'That was the final gate — this project is complete.',
  'The board pack for', 'is ready', 'of budget drawn', 'gates blocked',
  'Open it, or download it as Word or PowerPoint, here',
  'You are receiving this because a notification rule in this workspace names your role. An administrator can change the rules under Automations.',
] as const;
