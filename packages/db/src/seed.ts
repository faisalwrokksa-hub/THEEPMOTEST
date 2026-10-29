import './env';
import { assertDisposableSeedSafety } from './seed-safety';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as s from './schema';
import * as bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';

function workspaceRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir); if (up === dir) return null; dir = up;
  }
  return null;
}

/**
 * Reseeding generates new UUIDs, which would leave apps/web/.env.local pointing
 * at a tenant that no longer exists. Rewrite it here so that cannot happen.
 *
 * Only when the seed is pointed at THIS machine's database, though. Seeding a
 * deployed environment — over an SSH tunnel, say, which also arrives on
 * 127.0.0.1 — must not repoint the local dev server at rows it cannot see.
 * The test is exact: the URL in use must be the one the repository's own .env
 * names.
 */
function writeDevEnv(tenantId: string, userId: string) {
  const dir = workspaceRoot();
  if (!dir) return;

  const envFile = resolve(dir, '.env');
  const localUrl = existsSync(envFile)
    ? /^DATABASE_URL_ADMIN=(.*)$/m.exec(readFileSync(envFile, 'utf8'))?.[1]?.trim()
    : undefined;
  if (!localUrl || localUrl !== adminUrl) {
    console.log('\nLeft apps/web/.env.local alone — this seed was not pointed at the local database.');
    return;
  }

  const target = resolve(dir, 'apps/web/.env.local');
  writeFileSync(target,
    `NEXT_PUBLIC_API_URL=http://localhost:4000\n` +
    `# Written by \`pnpm db:seed\` — dev identity only, replaced by real auth at G4.\n` +
    `NEXT_PUBLIC_DEV_TENANT_ID=${tenantId}\n` +
    `NEXT_PUBLIC_DEV_USER_ID=${userId}\n`);
  console.log(`\nWrote apps/web/.env.local  (tenant ${tenantId.slice(0, 8)}, user ${userId.slice(0, 8)})`);
  console.log('If the web dev server is already running, restart it to pick this up.');
}

/** Seeds as the ADMIN role: it writes across two tenants, which RLS forbids by design. */
// Validate the exact intended local test database and explicit acknowledgement
// BEFORE creating any client or running destructive DELETE statements.
assertDisposableSeedSafety(process.env);
const adminUrl = process.env.DATABASE_URL_ADMIN!;
const client = postgres(adminUrl, { max: 1 });
const db = drizzle(client, { schema: s });

async function main() {
  console.log('Seeding demo data…');

  /**
   * Destructive ONLY for the demo tenants. Every tenant-scoped table declares
   * ON DELETE CASCADE, so removing these two tenant rows removes exactly their
   * data — a real workspace on the same database is untouched.
   */
  const DEMO_SLUGS = ['al-nakheel', 'nexa'];
  const DEMO_EMAILS = ['fatima@al-nakheel.test', 'khalid@nexa.test', 'pm@pmoalign.test',
                       'platform@aetherix.test', 'portfolio@al-nakheel.test',
                       'governance@al-nakheel.test', 'finance@al-nakheel.test',
                       'exec@al-nakheel.test', 'engineer@al-nakheel.test'];

  await db.delete(s.tenants).where(inArray(s.tenants.slug, DEMO_SLUGS));
  await db.delete(s.users).where(inArray(s.users.email, DEMO_EMAILS));

  const [acme, nexa] = await db.insert(s.tenants).values([
    { name: 'Al-Nakheel Development', slug: 'al-nakheel' },
    { name: 'Nexa Holdings',          slug: 'nexa' },
  ]).returning();

  // Dev password for every seeded account. Printed at the end so it is never
  // a secret hidden in code — and it is only ever used by the seed.
  const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'pmoalign-dev';
  const hash = await bcrypt.hash(DEV_PASSWORD, 12);


  const [fatima, khalid, consultant, platformAdmin,
         pfMgr, govRisk, finBen, execView, engineer] = await db.insert(s.users).values([
    { email: 'fatima@al-nakheel.test', displayName: 'Fatima Al-Zahrani', passwordHash: hash },
    { email: 'khalid@nexa.test',       displayName: 'Khalid Al-Rashidi', passwordHash: hash },
    { email: 'pm@pmoalign.test', username: 'pmo_consultant',
      displayName: 'The EPMO Consultant', passwordHash: hash },
    /* Vendor staff. The only account that may change module entitlements —
       a customer's own owner deliberately cannot, because entitlements are
       what the customer is billed for. */
    { email: 'platform@aetherix.test', username: 'platform_admin',
      displayName: 'Aetherix Platform Admin', passwordHash: hash, isPlatformAdmin: true },
    /* One person per distinctive role, so the Settings page shows the role set
       working rather than describing it, and so each can be signed into. */
    { email: 'portfolio@al-nakheel.test',  displayName: 'Noura Al-Otaibi', passwordHash: hash },
    { email: 'governance@al-nakheel.test', displayName: 'Sara Al-Harbi',   passwordHash: hash },
    { email: 'finance@al-nakheel.test',    displayName: 'Omar Hassan',     passwordHash: hash },
    { email: 'exec@al-nakheel.test',       displayName: 'Abdullah Al-Rashid', passwordHash: hash },
    { email: 'engineer@al-nakheel.test',   displayName: 'Yousef Al-Dosari',   passwordHash: hash },
  ]).returning();

  await db.insert(s.memberships).values([
    { tenantId: acme.id, userId: fatima.id,     role: 'owner' },
    { tenantId: nexa.id, userId: khalid.id,     role: 'owner' },
    // the managed-PMO model: one of our people engaged inside two client
    // workspaces, which is also what makes the workspace switcher testable
    { tenantId: acme.id, userId: consultant.id, role: 'staff_consultant' },
    { tenantId: nexa.id, userId: consultant.id, role: 'staff_consultant' },
  ]);

  /**
   * The owner account survives a reseed.
   *
   * Dropping the demo tenants cascades their memberships away, so an account
   * that lives outside this seed (the real sign-in advertised on the login
   * page) silently loses access every time the demo data is rebuilt. Recreate
   * its membership here — keeping any password it already has, so a rotated
   * password is not reset by a reseed.
   */
  // `??` alone is not enough: an env var set to the empty string is not
  // undefined, and would sail through as a blank password.
  const envOr = (name: string, fallback: string) => {
    const v = process.env[name];
    return v === undefined || v.trim() === '' ? fallback : v;
  };
  const OWNER_USERNAME = envOr('SEED_OWNER_USERNAME', 'ankit_aetherix');
  const OWNER_EMAIL    = envOr('SEED_OWNER_EMAIL', 'ankit@aetherixsystems.com');
  // No default: a password that lives in source ends up in the repository, and
  // this one is a real sign-in. If the account does not exist yet and nothing
  // was supplied, generate one and print it once.
  const OWNER_PASSWORD = envOr('SEED_OWNER_PASSWORD', randomBytes(9).toString('base64url'));

  const existingOwner = await db.query.users.findFirst({
    where: eq(s.users.username, OWNER_USERNAME),
  });
  const owner = existingOwner ?? (await db.insert(s.users).values({
    username: OWNER_USERNAME, email: OWNER_EMAIL, displayName: 'Ankit Sharma',
    passwordHash: await bcrypt.hash(OWNER_PASSWORD, 12),
    isPlatformAdmin: true,
  }).returning())[0];
  // Vendor staff, so the flag is reasserted even when the account predates it.
  await db.update(s.users).set({ isPlatformAdmin: true }).where(eq(s.users.id, owner.id));

  await db.insert(s.memberships).values([
    { tenantId: acme.id, userId: owner.id, role: 'owner' },
    { tenantId: nexa.id, userId: owner.id, role: 'owner' },
    // Vendor staff sit inside both workspaces as admins; what makes them a
    // platform administrator is the flag on the person, not these rows.
    { tenantId: acme.id, userId: platformAdmin.id, role: 'admin' },
    { tenantId: nexa.id, userId: platformAdmin.id, role: 'admin' },
    { tenantId: acme.id, userId: pfMgr.id,    role: 'portfolio_manager' },
    { tenantId: acme.id, userId: govRisk.id,  role: 'governance_risk' },
    { tenantId: acme.id, userId: finBen.id,   role: 'finance_benefits' },
    { tenantId: acme.id, userId: execView.id, role: 'executive_viewer' },
    { tenantId: acme.id, userId: engineer.id, role: 'team_member' },
  ]).onConflictDoNothing();

  const [pfA, pfB] = await db.insert(s.portfolios).values([
    { tenantId: acme.id, name: '2026 Strategic Transformation', health: 'at_risk' },
    { tenantId: nexa.id, name: 'Enterprise Transformation Office', health: 'on_track' },
  ]).returning();

  const [pgA, pgB] = await db.insert(s.programs).values([
    { tenantId: acme.id, portfolioId: pfA.id, name: 'Residential Delivery', health: 'at_risk' },
    { tenantId: nexa.id, portfolioId: pfB.id, name: 'Core Systems Renewal', health: 'on_track' },
  ]).returning();

  const projectRows = await db.insert(s.projects).values([
    { tenantId: acme.id, programId: pgA.id, code: 'ANR', name: 'Al-Nakheel Residential Complex',
      status: 'active', health: 'at_risk', progressPct: 35, budgetAmount: '680000000',
      startDate: '2026-03-01', endDate: '2026-08-31', ownerId: fatima.id },
    { tenantId: acme.id, programId: pgA.id, code: 'RCM', name: 'Riyadh Central Mall',
      status: 'active', health: 'critical', progressPct: 62, budgetAmount: '1240000000',
      startDate: '2026-01-15', endDate: '2027-02-28', ownerId: fatima.id },
    { tenantId: acme.id, programId: pgA.id, code: 'JWH', name: 'Jeddah Waterfront Hotel',
      status: 'planning', health: 'on_track', progressPct: 8, budgetAmount: '410000000',
      startDate: '2026-09-01', ownerId: consultant.id },
    { tenantId: nexa.id, programId: pgB.id, code: 'NXC', name: 'Nexa Core Platform',
      status: 'active', health: 'on_track', progressPct: 48, budgetAmount: '92000000',
      startDate: '2026-02-01', endDate: '2026-12-31', ownerId: khalid.id },

    /* Five more, so the portfolio charts have a distribution to show rather
       than three points. Spread across every health band and every stage of
       life, because a donut of three equal slices and a funnel one project
       wide demonstrate nothing. */
    { tenantId: acme.id, programId: pgA.id, code: 'DMD', name: 'Dammam Logistics Park',
      status: 'active', health: 'on_track', progressPct: 54, budgetAmount: '845000000',
      startDate: '2026-02-10', endDate: '2027-04-30', ownerId: fatima.id },
    { tenantId: acme.id, programId: pgA.id, code: 'MKS', name: 'Makkah Station Interchange',
      status: 'active', health: 'at_risk', progressPct: 41, budgetAmount: '1560000000',
      startDate: '2025-11-01', endDate: '2027-06-30', ownerId: consultant.id },
    { tenantId: acme.id, programId: pgA.id, code: 'KAP', name: 'King Abdullah Park Upgrade',
      status: 'active', health: 'on_track', progressPct: 77, budgetAmount: '318000000',
      startDate: '2025-09-15', endDate: '2026-11-30', ownerId: fatima.id },
    { tenantId: acme.id, programId: pgA.id, code: 'QTF', name: 'Qiddiya Trunk Infrastructure',
      status: 'active', health: 'critical', progressPct: 23, budgetAmount: '2100000000',
      startDate: '2026-01-05', endDate: '2028-03-31', ownerId: consultant.id },
    { tenantId: acme.id, programId: pgA.id, code: 'YNB', name: 'Yanbu Desalination Link',
      status: 'closed', health: 'on_track', progressPct: 100, budgetAmount: '268000000',
      startDate: '2025-04-01', endDate: '2026-06-30', ownerId: fatima.id },
  ]).returning();
  const [anr, rcm, jwh, nxc, dmd, mks, kap, qtf, ynb] = projectRows;

  /* ── The Al-Nakheel story, told in rows ────────────────────────────────
     Seven gates per project. ANR has passed SG0–SG3, is sitting at SG4
     (Procurement), and cannot pass it because a contractor dependency is
     open. That single fact is what turns the portfolio amber.          */

  const GATES = ['Concept', 'Feasibility', 'Design Development', 'Detailed Design',
                 'Procurement', 'Construction', 'Handover'];

  const mkGates = (projectId: string, tenantId: string, activeSeq: number) =>
    GATES.map((name, seq) => ({
      tenantId, projectId, seq, name,
      status: (seq < activeSeq ? 'approved' : seq === activeSeq ? 'active' : 'locked') as any,
      openedAt: seq <= activeSeq ? new Date(2026, 2 + seq, 1) : null,
      decidedAt: seq < activeSeq ? new Date(2026, 2 + seq, 20) : null,
    }));

  const gateRows = await db.insert(s.gates).values([
    ...mkGates(anr.id, acme.id, 4),   // at Procurement
    ...mkGates(rcm.id, acme.id, 5),   // at Construction
    ...mkGates(jwh.id, acme.id, 0),   // just started
    ...mkGates(nxc.id, nexa.id, 3),
    // Spread across the ladder so the gate funnel has a shape, and so the
    // throughput chart has decisions in more than one month.
    ...mkGates(dmd.id, acme.id, 4),
    ...mkGates(mks.id, acme.id, 3),
    ...mkGates(kap.id, acme.id, 5),
    ...mkGates(qtf.id, acme.id, 2),
    ...mkGates(ynb.id, acme.id, 6),
  ]).returning();

  const gateOf = (projectId: string, seq: number) =>
    gateRows.find((g) => g.projectId === projectId && g.seq === seq)!;

  const anrSG4 = gateOf(anr.id, 4);
  const jwhSG0 = gateOf(jwh.id, 0);

  // ANR's Procurement checklist: 2 of 5 done. This is why the gate is shut.
  await db.insert(s.gateCriteria).values([
    { tenantId: acme.id, gateId: anrSG4.id, label: 'Tender documents package issued',
      isMet: true, evidenceUrl: 'https://docs.example/anr/tender-pack.pdf',
      metAt: new Date('2026-08-12'), metBy: fatima.id },
    { tenantId: acme.id, gateId: anrSG4.id, label: 'Bid evaluation report signed',
      isMet: true, evidenceUrl: 'https://docs.example/anr/bid-eval.pdf',
      metAt: new Date('2026-08-28'), metBy: consultant.id },
    { tenantId: acme.id, gateId: anrSG4.id, label: 'Main contractor selected', isMet: false },
    { tenantId: acme.id, gateId: anrSG4.id, label: 'Contract award approved by board', isMet: false },
    { tenantId: acme.id, gateId: anrSG4.id, label: 'Insurance and bonds in place', isMet: false },
    { tenantId: acme.id, gateId: jwhSG0.id, label: 'Market study completed', isMet: true,
      metAt: new Date('2026-09-02'), metBy: consultant.id },
    { tenantId: acme.id, gateId: jwhSG0.id, label: 'Outline budget approved', isMet: false },
  ]);

  // Who signs SG4. Fatima is Accountable — exactly one per gate, enforced by index.
  await db.insert(s.approvals).values([
    { tenantId: acme.id, gateId: anrSG4.id, approverId: fatima.id,
      isAccountable: true, decision: 'pending' },
    { tenantId: acme.id, gateId: anrSG4.id, approverId: consultant.id,
      isAccountable: false, decision: 'approved', comment: 'Technical review complete.',
      decidedAt: new Date('2026-08-29') },
  ]);

  // The register. The dependency is the thing with teeth: it points at SG4.
  await db.insert(s.raidItems).values([
    { tenantId: acme.id, projectId: anr.id, kind: 'dependency',
      title: 'Contractor has not submitted signed bonds',
      detail: 'Al-Faisal Contracting owes performance bond + insurance certificates before award.',
      severity: 4, likelihood: 5, status: 'open', ownerId: fatima.id,
      blocksGateId: anrSG4.id, dueDate: '2026-09-15' },
    { tenantId: acme.id, projectId: anr.id, kind: 'risk',
      title: 'Steel price escalation could exceed contingency',
      detail: 'Rebar up 18% since tender. Contingency covers 12%.',
      severity: 4, likelihood: 3, status: 'mitigating', ownerId: consultant.id, dueDate: '2026-10-01' },
    { tenantId: acme.id, projectId: rcm.id, kind: 'issue',
      title: 'MEP installation behind on critical path',
      detail: 'Mechanical subcontractor 3 weeks late; delays fit-out.',
      severity: 5, likelihood: 5, status: 'open', ownerId: fatima.id, dueDate: '2026-09-20' },
    { tenantId: acme.id, projectId: anr.id, kind: 'decision',
      title: 'Approved switch to precast facade',
      detail: 'Saves 6 weeks. Decided at SG3.', status: 'closed', ownerId: fatima.id },
  ]);

  await db.insert(s.tasks).values([
    { tenantId: acme.id, projectId: anr.id, title: 'Chase Al-Faisal for bonds',
      state: 'in_progress', assigneeId: fatima.id, dueDate: '2026-09-10', estimateHours: 4 },
    { tenantId: acme.id, projectId: anr.id, title: 'Prepare board award paper',
      state: 'blocked', assigneeId: consultant.id, dueDate: '2026-09-18', estimateHours: 16 },
    { tenantId: acme.id, projectId: jwh.id, title: 'Draft outline budget',
      state: 'todo', assigneeId: consultant.id, dueDate: '2026-09-25', estimateHours: 24 },
  ]);

  const counts = {
    tenants: 2, users: 3,
    'projects (Al-Nakheel)': 3,
    'projects (Nexa)': 1,
  };
  console.table(counts);

  /* ── schedule: phases with baselines, so slippage is visible ────────── */
  await db.insert(s.scheduleItems).values([
    { tenantId: acme.id, projectId: anr.id, name: 'Design development', kind: 'phase',
      startDate: '2026-03-01', endDate: '2026-05-30', baselineStart: '2026-03-01',
      baselineEnd: '2026-05-15', progressPct: 100, isCritical: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Detailed design', kind: 'phase',
      startDate: '2026-05-15', endDate: '2026-07-31', baselineStart: '2026-05-01',
      baselineEnd: '2026-07-01', progressPct: 100, isCritical: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Tender & award', kind: 'phase',
      startDate: '2026-08-01', endDate: '2026-10-15', baselineStart: '2026-07-01',
      baselineEnd: '2026-09-01', progressPct: 40, isCritical: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Contract award', kind: 'milestone',
      startDate: '2026-10-15', endDate: '2026-10-15', baselineStart: '2026-09-01',
      baselineEnd: '2026-09-01', progressPct: 0, isCritical: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Enabling works', kind: 'activity',
      startDate: '2026-10-16', endDate: '2027-01-31', progressPct: 0 },
    { tenantId: acme.id, projectId: rcm.id, name: 'Structure', kind: 'phase',
      startDate: '2026-02-01', endDate: '2026-08-31', baselineStart: '2026-02-01',
      baselineEnd: '2026-08-01', progressPct: 92, isCritical: true },
    { tenantId: acme.id, projectId: rcm.id, name: 'MEP installation', kind: 'phase',
      startDate: '2026-07-01', endDate: '2026-11-30', baselineStart: '2026-06-15',
      baselineEnd: '2026-10-15', progressPct: 35, isCritical: true },
    { tenantId: acme.id, projectId: rcm.id, name: 'Fit-out', kind: 'phase',
      startDate: '2026-11-01', endDate: '2027-02-28', progressPct: 0 },
    { tenantId: acme.id, projectId: jwh.id, name: 'Feasibility study', kind: 'phase',
      startDate: '2026-09-01', endDate: '2026-11-30', progressPct: 15 },
    { tenantId: nexa.id, projectId: nxc.id, name: 'Platform build', kind: 'phase',
      startDate: '2026-02-01', endDate: '2026-10-31', baselineStart: '2026-02-01',
      baselineEnd: '2026-10-31', progressPct: 48, isCritical: true },
  ]);

  /* ── financials: budget vs committed vs actual ──────────────────────── */
  /**
   * Costs accrue month by month, not in one lump on a single date.
   *
   * The totals are deliberately unchanged — only their distribution over time
   * — because every figure the platform reports is a sum. What the spread buys
   * is an S-curve that means something: a cumulative plot of planned against
   * actual is a straight line unless the entries carry the month they belong
   * to, and a straight line is exactly the shape that hides an overrun.
   *
   * Budget and forecast spread across the whole project window; actuals only
   * as far as today, which is what makes the two curves diverge.
   */
  const monthsFrom = (startISO: string, n: number) => {
    const [y, m] = startISO.split('-').map(Number);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      return d.toISOString().slice(0, 10);
    });
  };

  /** Cosine-eased instalments summing to exactly `total`. */
  const sCurve = (total: number, n: number): number[] => {
    if (n <= 1) return [total];
    const cum = Array.from({ length: n + 1 }, (_, i) =>
      Math.round(total * (1 - Math.cos(Math.PI * (i / n))) / 2));
    const out = Array.from({ length: n }, (_, i) => cum[i + 1] - cum[i]);
    // Rounding lands in the last instalment so the sum is exact.
    out[n - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  };

  const cost = (
    projectId: string, tenantId: string,
    rows: [string, string, number][],
    window: { start: string; months: number; elapsed: number },
  ) =>
    rows.flatMap(([kind, category, amount]) => {
      // Actuals and commitments have only happened up to now; budget and
      // forecast describe the whole plan.
      const n = kind === 'actual' || kind === 'commitment'
        ? Math.max(1, window.elapsed) : window.months;
      const periods = monthsFrom(window.start, n);
      return sCurve(amount, n)
        .map((part, i) => ({
          tenantId, projectId, kind: kind as any, category,
          amount: String(part), period: periods[i],
        }))
        // Only empty instalments are dropped; dropping a real one would change
        // a total, and every figure the platform shows is a sum of these.
        .filter((r) => Number(r.amount) !== 0);
    });
  await db.insert(s.costEntries).values([
    ...cost(anr.id, acme.id, [
      ['budget', 'Construction', 520_000_000], ['budget', 'Design fees', 42_000_000],
      ['budget', 'Contingency', 68_000_000],   ['budget', 'Permits & fees', 50_000_000],
      ['commitment', 'Design fees', 42_000_000], ['commitment', 'Permits & fees', 31_000_000],
      ['actual', 'Design fees', 38_500_000],     ['actual', 'Permits & fees', 22_400_000],
      ['forecast', 'Construction', 548_000_000],
    ], { start: '2026-03-01', months: 6,  elapsed: 6 }),
    ...cost(rcm.id, acme.id, [
      ['budget', 'Construction', 980_000_000], ['budget', 'Design fees', 74_000_000],
      ['budget', 'Contingency', 186_000_000],
      ['commitment', 'Construction', 980_000_000], ['commitment', 'Design fees', 74_000_000],
      ['actual', 'Construction', 742_000_000],     ['actual', 'Design fees', 74_000_000],
      ['forecast', 'Construction', 1_058_000_000],
    ], { start: '2026-01-15', months: 14, elapsed: 8 }),
    ...cost(jwh.id, acme.id, [
      ['budget', 'Design fees', 18_000_000], ['budget', 'Construction', 392_000_000],
      ['actual', 'Design fees', 1_200_000],
    ], { start: '2026-09-01', months: 12, elapsed: 1 }),
    ...cost(nxc.id, nexa.id, [
      ['budget', 'Build', 74_000_000], ['budget', 'Licences', 18_000_000],
      ['commitment', 'Build', 74_000_000], ['actual', 'Build', 31_500_000],
    ], { start: '2026-02-01', months: 11, elapsed: 7 }),

    /* Each new project's budget lines sum to the figure on the project, which
       `pnpm check:data` asserts — a project whose budget disagrees with its
       cost lines makes every financial rollup wrong. */
    ...cost(dmd.id, acme.id, [
      ['budget', 'Civils', 610_000_000], ['budget', 'Design fees', 38_000_000],
      ['budget', 'Contingency', 197_000_000],
      ['commitment', 'Civils', 540_000_000],
      ['actual', 'Civils', 402_000_000], ['actual', 'Design fees', 31_000_000],
      ['forecast', 'Civils', 628_000_000], ['forecast', 'Design fees', 38_000_000],
      ['forecast', 'Contingency', 150_000_000],
    ], { start: '2026-02-01', months: 15, elapsed: 8 }),

    ...cost(mks.id, acme.id, [
      ['budget', 'Structures', 1_180_000_000], ['budget', 'Systems', 240_000_000],
      ['budget', 'Contingency', 140_000_000],
      ['commitment', 'Structures', 980_000_000],
      ['actual', 'Structures', 612_000_000], ['actual', 'Systems', 74_000_000],
      ['forecast', 'Structures', 1_265_000_000], ['forecast', 'Systems', 258_000_000],
      ['forecast', 'Contingency', 140_000_000],
    ], { start: '2025-11-01', months: 20, elapsed: 11 }),

    ...cost(kap.id, acme.id, [
      ['budget', 'Landscaping', 214_000_000], ['budget', 'Lighting', 62_000_000],
      ['budget', 'Contingency', 42_000_000],
      ['commitment', 'Landscaping', 210_000_000],
      ['actual', 'Landscaping', 186_000_000], ['actual', 'Lighting', 48_000_000],
      ['forecast', 'Landscaping', 212_000_000], ['forecast', 'Lighting', 60_000_000],
      ['forecast', 'Contingency', 20_000_000],
    ], { start: '2025-09-01', months: 15, elapsed: 13 }),

    ...cost(qtf.id, acme.id, [
      ['budget', 'Earthworks', 980_000_000], ['budget', 'Utilities', 820_000_000],
      ['budget', 'Contingency', 300_000_000],
      ['commitment', 'Earthworks', 760_000_000],
      ['actual', 'Earthworks', 388_000_000], ['actual', 'Utilities', 121_000_000],
      ['forecast', 'Earthworks', 1_090_000_000], ['forecast', 'Utilities', 905_000_000],
      ['forecast', 'Contingency', 300_000_000],
    ], { start: '2026-01-01', months: 27, elapsed: 9 }),

    ...cost(ynb.id, acme.id, [
      ['budget', 'Pipeline', 196_000_000], ['budget', 'Pumping', 72_000_000],
      ['commitment', 'Pipeline', 196_000_000],
      ['actual', 'Pipeline', 193_000_000], ['actual', 'Pumping', 70_500_000],
      ['forecast', 'Pipeline', 193_000_000], ['forecast', 'Pumping', 70_500_000],
    ], { start: '2025-04-01', months: 15, elapsed: 15 }),
  ]);

  /* ── benefits: tracked past closure ─────────────────────────────────── */
  await db.insert(s.benefits).values([
    { tenantId: acme.id, projectId: anr.id, name: 'Annual rental income',
      measure: 'SAR per year', baseline: '0', target: '96000000', actual: '0',
      status: 'planned', reviewDate: '2027-12-31', ownerId: fatima.id },
    { tenantId: acme.id, projectId: anr.id, name: 'Units sold within 12 months',
      measure: 'units', baseline: '0', target: '850', actual: '0',
      status: 'planned', reviewDate: '2027-09-30', ownerId: fatima.id },
    { tenantId: acme.id, projectId: rcm.id, name: 'Retail occupancy at opening',
      measure: '% leased', baseline: '0', target: '85', actual: '61',
      status: 'in_progress', reviewDate: '2027-03-31', ownerId: fatima.id },
    { tenantId: acme.id, projectId: rcm.id, name: 'Footfall',
      measure: 'visitors per month', baseline: '0', target: '1200000', actual: '0',
      status: 'planned', reviewDate: '2027-06-30', ownerId: consultant.id },
    // A reduction target (lower is better) inside the fully licensed tenant,
    // so the direction-aware progress maths stays testable.
    { tenantId: acme.id, projectId: rcm.id, name: 'Rework hours per unit',
      measure: 'hours per unit', baseline: '18', target: '6', actual: '11',
      status: 'in_progress', reviewDate: '2027-04-30', ownerId: fatima.id },
    { tenantId: nexa.id, projectId: nxc.id, name: 'Manual processing hours saved',
      measure: 'hours per month', baseline: '4200', target: '900', actual: '2100',
      status: 'in_progress', reviewDate: '2027-01-31', ownerId: khalid.id },
  ]);

  /* ── resources: who is on what, and how loaded ──────────────────────── */
  await db.insert(s.allocations).values([
    { tenantId: acme.id, userId: fatima.id, projectId: anr.id, role: 'Project Director',
      allocationPct: 50, startDate: '2026-03-01', endDate: '2027-06-30' },
    { tenantId: acme.id, userId: fatima.id, projectId: rcm.id, role: 'Project Director',
      allocationPct: 70, startDate: '2026-01-15', endDate: '2027-02-28' },
    { tenantId: acme.id, userId: consultant.id, projectId: anr.id, role: 'PMO Consultant',
      allocationPct: 40, startDate: '2026-06-01', endDate: '2026-12-31' },
    { tenantId: acme.id, userId: consultant.id, projectId: jwh.id, role: 'PMO Consultant',
      allocationPct: 30, startDate: '2026-09-01', endDate: '2027-03-31' },
    { tenantId: nexa.id, userId: khalid.id, projectId: nxc.id, role: 'Programme Manager',
      allocationPct: 80, startDate: '2026-02-01', endDate: '2026-12-31' },
  ]);
  const effort: any[] = [];
  for (let d = 1; d <= 5; d++) {
    effort.push(
      { tenantId: acme.id, userId: fatima.id, projectId: anr.id,
        workDate: `2026-09-0${d}`, hours: '3.5', note: 'Tender review' },
      { tenantId: acme.id, userId: fatima.id, projectId: rcm.id,
        workDate: `2026-09-0${d}`, hours: '4.5', note: 'MEP recovery plan' },
      { tenantId: acme.id, userId: consultant.id, projectId: anr.id,
        workDate: `2026-09-0${d}`, hours: '3', note: 'Bid evaluation' },
    );
  }
  await db.insert(s.effortEntries).values(effort);

  /* ── Platform Studio config ─────────────────────────────────────────── */
  await db.insert(s.customFields).values([
    { tenantId: acme.id, appliesTo: 'project', label: 'Municipality', fieldKey: 'municipality',
      fieldType: 'select', options: ['Riyadh', 'Jeddah', 'Dammam', 'Makkah'], isRequired: true },
    { tenantId: acme.id, appliesTo: 'project', label: 'Plot number', fieldKey: 'plot_no',
      fieldType: 'text' },
    { tenantId: acme.id, appliesTo: 'project', label: 'Gross floor area (m²)', fieldKey: 'gfa',
      fieldType: 'number' },
    { tenantId: acme.id, appliesTo: 'raid_item', label: 'Escalated to board', fieldKey: 'escalated',
      fieldType: 'boolean' },
    { tenantId: nexa.id, appliesTo: 'project', label: 'Business unit', fieldKey: 'bu',
      fieldType: 'select', options: ['Retail', 'Logistics', 'Corporate'] },
  ]);
  await db.insert(s.gateTemplates).values([
    { tenantId: acme.id, name: 'Real estate development (7 gates)', projectType: 'Real estate',
      definition: {
        gates: GATES,
        // Overrides the built-in defaults for this tenant's project type.
        criteriaByGate: {
          Construction: [
            'Site mobilisation complete',
            'Health and safety plan in force',
            'Monthly progress and cost reporting established',
            'Municipality inspection passed',
          ],
          Handover: [
            'Practical completion certificate issued',
            'As-built documentation delivered',
            'Operations and maintenance handover accepted',
            'Final account settled',
          ],
        },
      } },
    { tenantId: acme.id, name: 'Fit-out (4 gates)', projectType: 'Fit-out',
      definition: { gates: ['Concept', 'Design', 'Build', 'Handover'], criteriaPerGate: 3 } },
    { tenantId: nexa.id, name: 'IT programme (5 gates)', projectType: 'Technology',
      definition: { gates: ['Discovery', 'Design', 'Build', 'UAT', 'Go-live'], criteriaPerGate: 4 } },
  ]);
  await db.insert(s.automations).values([
    { tenantId: acme.id, name: 'Notify accountable when a gate is blocked',
      trigger: 'gate.blocked', action: 'notify.accountable', runCount: 14,
      lastRunAt: new Date('2026-09-05T08:12:00Z') },
    { tenantId: acme.id, name: 'Escalate critical risks to the board',
      trigger: 'raid.score_gte_20', action: 'notify.board', runCount: 3,
      lastRunAt: new Date('2026-09-02T14:40:00Z') },
    { tenantId: acme.id, name: 'Flag project amber when a gate slips 14 days',
      trigger: 'gate.overdue_14d', action: 'project.set_health_at_risk', runCount: 6,
      lastRunAt: new Date('2026-08-28T06:00:00Z') },
    { tenantId: acme.id, name: 'Weekly board pack', trigger: 'schedule.weekly',
      action: 'report.generate', isActive: false, runCount: 0 },
  ]);
  await db.insert(s.reportDefs).values([
    { tenantId: acme.id, name: 'Monthly board pack', kind: 'board_pack', audience: 'Board',
      schedule: 'Monthly, first Tuesday', lastRunAt: new Date('2026-09-01T07:00:00Z') },
    { tenantId: acme.id, name: 'Gate status summary', kind: 'gate_status', audience: 'PMO',
      schedule: 'Weekly, Monday', lastRunAt: new Date('2026-09-02T07:00:00Z') },
    { tenantId: acme.id, name: 'Cost & commitment report', kind: 'cost', audience: 'Finance',
      schedule: 'Monthly', lastRunAt: new Date('2026-09-01T07:00:00Z') },
    { tenantId: acme.id, name: 'Benefits realization review', kind: 'benefits',
      audience: 'Executive committee', schedule: 'Quarterly' },
    { tenantId: nexa.id, name: 'Programme status', kind: 'board_pack', audience: 'Steering group',
      schedule: 'Fortnightly', lastRunAt: new Date('2026-09-03T07:00:00Z') },
  ]);


  /* ── documents: some are gate evidence ──────────────────────────────── */
  const crit = await db.select().from(s.gateCriteria);
  const tenderPack = crit.find((c) => c.label.startsWith('Tender documents'));
  const bidEval = crit.find((c) => c.label.startsWith('Bid evaluation'));
  await db.insert(s.documents).values([
    { tenantId: acme.id, projectId: anr.id, criterionId: tenderPack?.id ?? null,
      name: 'ANR — Tender documents package', kind: 'Tender', version: '2.1',
      status: 'approved', url: 'https://docs.example/anr/tender-pack.pdf',
      sizeKb: 8420, ownerId: fatima.id },
    { tenantId: acme.id, projectId: anr.id, criterionId: bidEval?.id ?? null,
      name: 'ANR — Bid evaluation report', kind: 'Report', version: '1.0',
      status: 'approved', url: 'https://docs.example/anr/bid-eval.pdf',
      sizeKb: 1310, ownerId: consultant.id },
    { tenantId: acme.id, projectId: anr.id, name: 'ANR — Performance bond (awaited)',
      kind: 'Contract', version: '0.1', status: 'draft', sizeKb: null, ownerId: fatima.id },
    { tenantId: acme.id, projectId: rcm.id, name: 'RCM — MEP recovery programme',
      kind: 'Schedule', version: '3.0', status: 'in_review', sizeKb: 2260, ownerId: fatima.id },
    { tenantId: acme.id, projectId: rcm.id, name: 'RCM — Structural drawings rev C',
      kind: 'Drawing', version: 'C', status: 'approved', sizeKb: 41800, ownerId: consultant.id },
    { tenantId: acme.id, projectId: jwh.id, name: 'JWH — Market study',
      kind: 'Report', version: '1.0', status: 'approved', sizeKb: 3170, ownerId: consultant.id },
    { tenantId: nexa.id, projectId: nxc.id, name: 'NXC — Solution architecture',
      kind: 'Report', version: '2.0', status: 'approved', sizeKb: 5400, ownerId: khalid.id },
  ]);

  /* ── updates: the collaboration feed ────────────────────────────────── */
  await db.insert(s.updates).values([
    { tenantId: acme.id, projectId: anr.id, authorId: fatima.id, kind: 'escalation',
      body: 'Al-Faisal still has not returned the signed bonds. Escalating to the board if not received by 15 Sep — SG4 cannot open without them.' },
    { tenantId: acme.id, projectId: anr.id, authorId: consultant.id, kind: 'status',
      body: 'Bid evaluation complete and signed. Two of five SG4 criteria now met.' },
    { tenantId: acme.id, projectId: rcm.id, authorId: fatima.id, kind: 'escalation',
      body: 'MEP subcontractor three weeks behind on the critical path. Recovery programme rev 3 issued for review.' },
    { tenantId: acme.id, projectId: rcm.id, authorId: consultant.id, kind: 'note',
      body: 'Structural drawings rev C approved. Frame handover on track.' },
    { tenantId: acme.id, projectId: jwh.id, authorId: consultant.id, kind: 'status',
      body: 'Market study accepted. Outline budget still outstanding before SG0 can close.' },
    { tenantId: nexa.id, projectId: nxc.id, authorId: khalid.id, kind: 'status',
      body: 'Platform build at 48%. Processing hours down from 4,200 to 2,100 per month.' },
  ]);

  /* ── stakeholders: influence x interest ─────────────────────────────── */
  await db.insert(s.stakeholders).values([
    { tenantId: acme.id, projectId: anr.id, name: 'Eng. Sultan Al-Harbi',
      organisation: 'Riyadh Municipality', role: 'Permitting authority',
      influence: 5, interest: 3, email: 'permits@riyadh.gov.example', isExternal: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Al-Faisal Contracting',
      organisation: 'Al-Faisal Contracting', role: 'Main contractor (pending award)',
      influence: 4, interest: 5, email: 'bids@alfaisal.example', isExternal: true },
    { tenantId: acme.id, projectId: anr.id, name: 'Noura Al-Qahtani',
      organisation: 'Al-Nakheel Development', role: 'Board sponsor',
      influence: 5, interest: 4, email: 'noura@al-nakheel.test' },
    { tenantId: acme.id, projectId: rcm.id, name: 'Gulf Retail Partners',
      organisation: 'Gulf Retail Partners', role: 'Anchor tenant',
      influence: 3, interest: 5, isExternal: true },
    { tenantId: acme.id, projectId: rcm.id, name: 'Prime MEP Services',
      organisation: 'Prime MEP', role: 'MEP subcontractor',
      influence: 2, interest: 4, isExternal: true },
    { tenantId: nexa.id, projectId: nxc.id, name: 'Reem Al-Dosari',
      organisation: 'Nexa Holdings', role: 'Operations director', influence: 4, interest: 5 },
  ]);

  /* ── integrations ───────────────────────────────────────────────────────
     Sync times are relative to the seed run, not fixed dates. A hard-coded
     timestamp is accurate for about a day and then quietly becomes a defect:
     these read "last sync 17 days ago" on a healthy connection, which on a
     customer's screen is indistinguishable from a broken one. */
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  await db.insert(s.integrations).values([
    { tenantId: acme.id, name: 'Primavera P6 — schedule import', provider: 'primavera_p6',
      direction: 'inbound', status: 'connected', recordsSynced: 1284,
      lastSyncAt: hoursAgo(3) },
    /* No SharePoint or Power BI rows here any more. Those two are real now:
       the Microsoft panel at the top of the same page says whether this
       workspace has actually connected them. A seeded card claiming
       "SharePoint — connected" directly above a live one saying "not
       connected" is not a demonstration, it is a contradiction. */
    { tenantId: acme.id, name: 'WhatsApp — approval reminders', provider: 'whatsapp',
      direction: 'outbound', status: 'pending', recordsSynced: 0 },
    { tenantId: nexa.id, name: 'Jira — delivery sync', provider: 'jira',
      direction: 'bidirectional', status: 'connected', recordsSynced: 3160,
      lastSyncAt: hoursAgo(4) },
  ]);

  /* Entitlements. Al-Nakheel takes the full built suite; Nexa is on a
     PMO-only plan, which makes the licensing boundary visible in the UI. */
  // Al-Nakheel is the full-suite demo; Nexa is deliberately on a PMO-only
  // plan, which is what makes the licensing boundary demonstrable.
  const BUILT = ['core360','pmo360','analytics360','benefits360',
                 'finance360','risk360','document360','hr360','crm360','ai360'];
  for (const id of BUILT)
    await db.insert(s.tenantModules).values({
      tenantId: acme.id, moduleId: id, enabled: true, tier: 'enterprise', enabledAt: new Date(),
    }).onConflictDoNothing();
  for (const id of ['core360','pmo360','risk360'])
    await db.insert(s.tenantModules).values({
      tenantId: nexa.id, moduleId: id, enabled: true, tier: 'standard', enabledAt: new Date(),
    }).onConflictDoNothing();

  writeDevEnv(acme.id, fatima.id);
  console.log(`
Demo accounts (password: ${DEV_PASSWORD})`);
  console.log(`  fatima@al-nakheel.test   owner, Al-Nakheel`);
  console.log(`  pm@pmoalign.test         staff consultant, Al-Nakheel`);
  console.log(`  platform@aetherix.test   PLATFORM ADMIN — the only one who may license modules`);
  console.log(`  khalid@nexa.test         owner, Nexa`);
  console.log(existingOwner
    ? `\n  ${OWNER_USERNAME}  owner of both workspaces (its own password, untouched by this reseed)`
    : `\n  ${OWNER_USERNAME}  owner of both workspaces — CREATED, password: ${OWNER_PASSWORD}\n`
      + `  Write that down; it is not stored anywhere else and will not be printed again.`);
  /* ── portfolio history ──────────────────────────────────────────────────
     The snapshot table is written nightly in a running system, so a fresh
     database has no history and the "portfolio over time" chart correctly
     refuses to draw one. For a demo that is a blank panel, so six months of
     plausible nights are written here — walking backwards from today's real
     figures rather than inventing a shape, so the last point on the chart is
     the number on the screen beside it.                                    */
  const today = new Date();
  const snapshots: (typeof s.portfolioSnapshots.$inferInsert)[] = [];
  for (const [tenantId, live] of [
    [acme.id, { projects: 8, onTrack: 4, atRisk: 2, critical: 2, avgProgress: 50,
                gatesActive: 8, gatesBlocked: 2, openRegister: 4,
                budget: 7_421_000_000, actual: 2_216_700_000, forecast: 7_709_000_000 }],
    [nexa.id, { projects: 1, onTrack: 1, atRisk: 0, critical: 0, avgProgress: 48,
                gatesActive: 1, gatesBlocked: 0, openRegister: 0,
                budget: 92_000_000, actual: 31_500_000, forecast: 92_000_000 }],
  ] as const) {
    for (let back = 180; back >= 0; back -= 3) {
      const d = new Date(today.getTime() - back * 86400000);
      // Further back means less done: progress and spend ease off, and the
      // earlier months carry a little more risk, which is what recovery
      // actually looks like.
      const t = (180 - back) / 180;                       // 0 at the oldest
      const ease = t * t * (3 - 2 * t);                   // smoothstep
      const risky = back > 90;
      snapshots.push({
        tenantId,
        onDate: d.toISOString().slice(0, 10),
        projects: Math.max(1, Math.round(live.projects * (0.55 + 0.45 * ease))),
        onTrack: Math.max(0, Math.round(live.onTrack * (0.5 + 0.5 * ease))),
        atRisk: Math.max(0, live.atRisk + (risky ? 1 : 0)),
        critical: Math.max(0, live.critical - (risky ? 0 : 0)),
        avgProgress: Math.round(live.avgProgress * ease),
        gatesActive: Math.max(1, Math.round(live.gatesActive * (0.6 + 0.4 * ease))),
        gatesBlocked: risky ? live.gatesBlocked + 1 : live.gatesBlocked,
        openRegister: Math.max(0, Math.round(live.openRegister * (1.4 - 0.4 * ease))),
        budget: String(Math.round(live.budget * (0.7 + 0.3 * ease))),
        actual: String(Math.round(live.actual * ease)),
        forecast: String(Math.round(live.forecast * (0.72 + 0.28 * ease))),
      });
    }
  }
  await db.insert(s.portfolioSnapshots).values(snapshots);

  console.log('\nSeeded. Verify the tenant boundary with:  pnpm verify:rls');
}

main().then(() => client.end()).catch(async (e) => {
  console.error(e); await client.end(); process.exit(1);
});
