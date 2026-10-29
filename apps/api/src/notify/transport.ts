import { Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * How mail leaves the building — or doesn't.
 *
 * The platform is useful before any of this is configured: notifications are
 * written to the outbox either way, so the rules can be built, seen and argued
 * about while the domain is still being verified. `none` is therefore the
 * default rather than an error state, and the interface says plainly that
 * nothing is being delivered rather than implying silence means success.
 */
export type Sendable = { to: string; subject: string; body: string; lang: 'en' | 'ar' };
export type SendResult = { ok: true } | { ok: false; error: string };

export interface MailTransport {
  readonly name: string;
  /** False when mail is only being recorded, never delivered. */
  readonly delivers: boolean;
  /** Why it is not delivering, in words a non-engineer can act on. */
  readonly status: string;
  send(m: Sendable): Promise<SendResult>;
}

class NoTransport implements MailTransport {
  readonly name = 'none';
  readonly delivers = false;
  constructor(readonly status: string) {}
  async send(): Promise<SendResult> {
    return { ok: false, error: 'No mail transport is configured.' };
  }
}

class SesTransport implements MailTransport {
  readonly name = 'ses';
  readonly delivers = true;
  readonly status: string;
  private readonly client: SESv2Client;

  constructor(private readonly from: string, private readonly region: string,
              private readonly configurationSet?: string) {
    this.client = new SESv2Client({ region });
    this.status = `Sending as ${from} through Amazon SES in ${region}.`;
  }

  async send(m: Sendable): Promise<SendResult> {
    try {
      await this.client.send(new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [m.to] },
        ConfigurationSetName: this.configurationSet,
        Content: {
          Simple: {
            Subject: { Data: m.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: m.body, Charset: 'UTF-8' } },
          },
        },
      }));
      return { ok: true };
    } catch (e) {
      const err = e as { name?: string; message?: string };
      // SES in sandbox refuses unverified recipients. That is a setup state,
      // not a bug, and the message should say which.
      const hint = err.name === 'MessageRejected' && /not verified/i.test(err.message ?? '')
        ? ' — the account is still in the SES sandbox, so only verified addresses can receive mail.'
        : '';
      return { ok: false, error: `${err.name ?? 'SendFailed'}: ${err.message ?? 'unknown'}${hint}` };
    }
  }
}

/**
 * Built once at startup from the environment. Misconfiguration produces a
 * transport that refuses and explains, never one that silently drops mail.
 */
export function buildTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  const log = new Logger('Mail');
  const kind = (env.MAIL_TRANSPORT ?? 'none').trim().toLowerCase();

  if (kind === 'none' || kind === '') {
    log.log('MAIL_TRANSPORT is not set — notifications will be recorded but not sent.');
    return new NoTransport(
      'No mail transport is configured. Notifications are being recorded in full, ' +
      'and will send once MAIL_TRANSPORT and MAIL_FROM are set.');
  }

  if (kind === 'ses') {
    const from = (env.MAIL_FROM ?? '').trim();
    const region = (env.MAIL_REGION ?? env.AWS_REGION ?? 'ap-south-1').trim();
    if (!from) {
      log.error('MAIL_TRANSPORT=ses but MAIL_FROM is not set.');
      return new NoTransport(
        'MAIL_TRANSPORT is set to ses, but MAIL_FROM is empty — so there is no verified ' +
        'address to send from. Notifications are being recorded, not sent.');
    }
    log.log(`Mail via SES as ${from} (${region}).`);
    return new SesTransport(from, region, env.MAIL_CONFIGURATION_SET?.trim() || undefined);
  }

  log.error(`Unknown MAIL_TRANSPORT "${kind}".`);
  return new NoTransport(`MAIL_TRANSPORT is set to "${kind}", which this build does not know how to use.`);
}
