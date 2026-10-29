/**
 * The master workbook.
 *
 * One shape serves three jobs, deliberately: the blank template you download
 * to start a project, the export of what is already in the platform, and the
 * upload that loads it back. If those were three definitions they would drift,
 * and a customer would discover it by having a filled-in workbook rejected.
 *
 * Column order here is the column order in the file. `key` is what the reader
 * looks for, matched case-insensitively against the header row, so a customer
 * reordering or re-labelling columns does not break the import — but a missing
 * required column does, loudly.
 */

export type CellKind = 'text' | 'number' | 'money' | 'date' | 'percent' | 'choice' | 'bool';

export type WorkbookColumn = {
  key: string;
  header: string;
  headerAr: string;
  kind: CellKind;
  /** Allowed values for `choice`. Becomes a real dropdown in the file. */
  choices?: readonly string[];
  required?: boolean;
  width?: number;
  /** Shown in the row under the header, in grey — guidance, not data. */
  hint?: string;
  hintAr?: string;
  /*
   * Other names this column is known by, so a workbook a customer already
   * maintains imports without being rewritten first. Matched case- and
   * space-insensitively, in either language.
   */
  aliases?: readonly string[];
};

export type WorkbookSheet = {
  /** Other tab names this sheet answers to, for the same reason. */
  nameAliases?: readonly string[];
  key: string;
  name: string;
  nameAr: string;
  /** One row per project (`single`) or many (`list`). */
  shape: 'single' | 'list';
  purpose: string;
  purposeAr: string;
  columns: readonly WorkbookColumn[];
};

const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'closed'] as const;
const HEALTH = ['on_track', 'at_risk', 'critical'] as const;
const RAID_KIND = ['risk', 'assumption', 'issue', 'dependency', 'change', 'decision'] as const;
const RAID_STATUS = ['open', 'mitigating', 'closed'] as const;
const COST_KIND = ['budget', 'commitment', 'actual', 'forecast'] as const;
const BENEFIT_STATUS = ['planned', 'in_progress', 'realized', 'missed'] as const;
const SCHEDULE_KIND = ['phase', 'activity', 'milestone'] as const;

export const WORKBOOK: readonly WorkbookSheet[] = [
  {
    key: 'project',
    nameAliases: ['Portfolios Programs Projects', 'Portfolios, Programs & Projects', 'المحافظ والبرامج والمشاريع'],
    name: 'Project',
    nameAr: 'المشروع',
    shape: 'single',
    purpose: 'The project itself. One row. Everything else in this workbook hangs off it.',
    purposeAr: 'المشروع نفسه. صف واحد. كل ما تبقّى في هذا المصنّف يتفرّع عنه.',
    columns: [
      { key: 'code', header: 'Project code', headerAr: 'رمز المشروع', kind: 'text',
        required: true, width: 16, hint: '2–16 letters, digits or hyphens. Unique in the workspace.', hintAr: '٢–١٦ حرفًا أو رقمًا أو شرطة. فريد داخل مساحة العمل.', 
        aliases: ['Project ID'] },
      { key: 'name', header: 'Project name', headerAr: 'اسم المشروع', kind: 'text',
        required: true, width: 40, 
        aliases: ['Project'] },
      { key: 'portfolio', header: 'Portfolio', headerAr: 'المحفظة', kind: 'text', width: 28,
        hint: 'Created if it does not exist yet.', hintAr: 'تُنشأ إن لم تكن موجودة.', 
        aliases: ['Portfolio'] },
      { key: 'program', header: 'Programme', headerAr: 'البرنامج', kind: 'text', width: 28,
        hint: 'Created inside the portfolio above if it does not exist yet.', hintAr: 'يُنشأ داخل المحفظة أعلاه إن لم يكن موجودًا.', 
        aliases: ['Programme', 'Program'] },
      { key: 'owner', header: 'Owner (email)', headerAr: 'المالك (البريد)', kind: 'text', width: 28,
        hint: 'Must already be a member of this workspace. Becomes accountable on SG0.', hintAr: 'يجب أن يكون عضوًا في مساحة العمل هذه. يصبح المسؤول عن البوابة صفر.', 
        aliases: ['Project Manager', 'Sponsor'] },
      { key: 'status', header: 'Status', headerAr: 'الحالة', kind: 'choice',
        choices: PROJECT_STATUS, width: 14 },
      { key: 'health', header: 'Health', headerAr: 'الحالة الصحية', kind: 'choice',
        choices: HEALTH, width: 14 },
      { key: 'progressPct', header: 'Progress %', headerAr: 'نسبة الإنجاز', kind: 'percent', width: 12, 
        aliases: ['Progress'] },
      { key: 'startDate', header: 'Start date', headerAr: 'تاريخ البدء', kind: 'date', width: 14, 
        aliases: ['Start', 'Baseline Start'] },
      { key: 'endDate', header: 'Target finish', headerAr: 'الانتهاء المستهدف', kind: 'date', width: 14, 
        aliases: ['Finish', 'Forecast Finish', 'Target finish'] },
      { key: 'budgetAmount', header: 'Budget', headerAr: 'الميزانية', kind: 'money', width: 18, 
        aliases: ['Approved Budget'] },
      { key: 'budgetCurrency', header: 'Currency', headerAr: 'العملة', kind: 'text', width: 10 },
    ],
  },
  {
    key: 'gates',
    nameAliases: ['Stage Gates', 'بوابات المراحل'],
    name: 'Stage Gates',
    nameAr: 'بوابات المراحل',
    shape: 'list',
    purpose: 'The seven gates and the checklist each one must satisfy. Prefilled with the standard set — edit the criteria, do not renumber the gates.',
    purposeAr: 'البوابات السبع وقائمة التحقق التي يجب أن تستوفيها كل واحدة. مُعبّأة مسبقًا بالمجموعة المعيارية — عدّل المعايير ولا تُعد ترقيم البوابات.',
    columns: [
      { key: 'seq', header: 'Gate', headerAr: 'البوابة', kind: 'number', required: true, width: 8,
        hint: '0 to 6.', hintAr: 'من ٠ إلى ٦.' },
      { key: 'gateName', header: 'Gate name', headerAr: 'اسم البوابة', kind: 'text', width: 24 },
      { key: 'criterion', header: 'Criterion', headerAr: 'المعيار', kind: 'text', width: 52,
        hint: 'One row per checklist item. Leave blank for a gate with no criteria.', hintAr: 'صف لكل بند في قائمة التحقق. اتركه فارغًا لبوابة بلا معايير.' },
      { key: 'evidenceUrl', header: 'Evidence link', headerAr: 'رابط الإثبات', kind: 'text', width: 40,
        hint: 'A criterion cannot be marked met without one.', hintAr: 'لا يمكن تحديد المعيار كمستوفى بدونه.' },
      { key: 'isMet', header: 'Met?', headerAr: 'مستوفى؟', kind: 'bool', width: 10 },
    ],
  },
  {
    key: 'schedule',
    name: 'Schedule',
    nameAr: 'الجدول',
    shape: 'list',
    purpose: 'Work items with baseline and current dates. Slippage is the difference, which is why both are asked for.',
    purposeAr: 'بنود العمل بتواريخ خط الأساس والتواريخ الحالية. الانزلاق هو الفرق بينهما، ولهذا يُطلب الاثنان.',
    columns: [
      { key: 'name', header: 'Item', headerAr: 'البند', kind: 'text', required: true, width: 40 , aliases: ['Task'] },
      { key: 'kind', header: 'Type', headerAr: 'النوع', kind: 'choice', choices: SCHEDULE_KIND, width: 14 },
      { key: 'baselineStart', header: 'Baseline start', headerAr: 'بداية خط الأساس', kind: 'date', width: 15, 
        aliases: ['Baseline Start'] },
      { key: 'baselineEnd', header: 'Baseline finish', headerAr: 'نهاية خط الأساس', kind: 'date', width: 15, 
        aliases: ['Baseline Finish'] },
      { key: 'startDate', header: 'Actual start', headerAr: 'البداية الفعلية', kind: 'date', width: 15 },
      { key: 'endDate', header: 'Actual finish', headerAr: 'النهاية الفعلية', kind: 'date', width: 15 },
      { key: 'progressPct', header: 'Progress %', headerAr: 'نسبة الإنجاز', kind: 'percent', width: 12 },
      { key: 'isCritical', header: 'Critical path?', headerAr: 'المسار الحرج؟', kind: 'bool', width: 13, 
        aliases: ['Critical'] },
    ],
  },
  {
    key: 'raid',
    nameAliases: ['RAID', 'المخاطر والقضايا والافتراضات والقرارات'],
    name: 'RAID',
    nameAr: 'سجل المخاطر والقضايا',
    shape: 'list',
    purpose: 'Risks, assumptions, issues, dependencies, changes and decisions. Point one at a gate and that gate cannot pass until it is closed.',
    purposeAr: 'المخاطر والافتراضات والمشكلات والاعتماديات والتغييرات والقرارات. وجّه أحدها إلى بوابة فلن تتجاوز تلك البوابة حتى يُغلق.',
    columns: [
      { key: 'kind', header: 'Type', headerAr: 'النوع', kind: 'choice', choices: RAID_KIND,
        required: true, width: 14 },
      { key: 'title', header: 'Title', headerAr: 'العنوان', kind: 'text', required: true, width: 44 },
      { key: 'detail', header: 'Detail', headerAr: 'التفاصيل', kind: 'text', width: 52, 
        aliases: ['Description'] },
      { key: 'severity', header: 'Impact 1-5', headerAr: 'الأثر ١-٥', kind: 'number', width: 12, 
        aliases: ['Impact'] },
      { key: 'likelihood', header: 'Likelihood 1-5', headerAr: 'الاحتمالية ١-٥', kind: 'number', width: 14, 
        aliases: ['Probability'] },
      { key: 'status', header: 'Status', headerAr: 'الحالة', kind: 'choice', choices: RAID_STATUS, width: 14 },
      { key: 'owner', header: 'Owner (email)', headerAr: 'المالك (البريد)', kind: 'text', width: 26 },
      { key: 'dueDate', header: 'Due', headerAr: 'الاستحقاق', kind: 'date', width: 13, 
        aliases: ['Due Date'] },
      { key: 'blocksGate', header: 'Blocks gate', headerAr: 'يحجب البوابة', kind: 'number', width: 12,
        hint: 'Gate number 0–6. Leave blank if it blocks nothing.', hintAr: 'رقم البوابة ٠–٦. اتركه فارغًا إن كان لا يحجب شيئًا.' },
    ],
  },
  {
    key: 'costs',
    nameAliases: ['Budget Lines', 'بنود الميزانية'],
    name: 'Costs',
    nameAr: 'التكاليف',
    shape: 'list',
    purpose: 'Budget, commitments, actuals and forecast by category. Earned value and CPI are computed from these.',
    purposeAr: 'الميزانية والالتزامات والفعلي والتوقّع حسب الفئة. تُحسب منها القيمة المكتسبة ومؤشر أداء التكلفة.',
    columns: [
      { key: 'kind', header: 'Kind', headerAr: 'النوع', kind: 'choice', choices: COST_KIND,
        required: true, width: 14 },
      { key: 'category', header: 'Category', headerAr: 'الفئة', kind: 'text', required: true, width: 30 },
      { key: 'amount', header: 'Amount', headerAr: 'المبلغ', kind: 'money', required: true, width: 18 },
      { key: 'currency', header: 'Currency', headerAr: 'العملة', kind: 'text', width: 10 },
      { key: 'period', header: 'Period', headerAr: 'الفترة', kind: 'date', width: 13,
        hint: 'The month this belongs to.', hintAr: 'الشهر الذي ينتمي إليه.' },
      { key: 'note', header: 'Note', headerAr: 'ملاحظة', kind: 'text', width: 40 },
    ],
  },
  {
    key: 'benefits',
    name: 'Benefits',
    nameAr: 'المنافع',
    shape: 'list',
    purpose: 'What the project is for. Baseline is where you started, target what you promised, actual where you are.',
    purposeAr: 'الغاية من المشروع. خط الأساس نقطة البداية، والمستهدف ما وعدت به، والفعلي أين أنت الآن.',
    columns: [
      { key: 'name', header: 'Benefit', headerAr: 'المنفعة', kind: 'text', required: true, width: 36 },
      { key: 'measure', header: 'Measure', headerAr: 'المقياس', kind: 'text', required: true, width: 36,
        hint: 'What is counted, and in what unit.', hintAr: 'ما الذي يُقاس، وبأي وحدة.', 
        aliases: ['Unit'] },
      { key: 'baseline', header: 'Baseline', headerAr: 'خط الأساس', kind: 'number', width: 15 },
      { key: 'target', header: 'Target', headerAr: 'المستهدف', kind: 'number', width: 15 },
      { key: 'actual', header: 'Actual', headerAr: 'الفعلي', kind: 'number', width: 15 },
      { key: 'status', header: 'Status', headerAr: 'الحالة', kind: 'choice', choices: BENEFIT_STATUS, width: 14 },
      { key: 'reviewDate', header: 'Review date', headerAr: 'تاريخ المراجعة', kind: 'date', width: 14,
        hint: 'Often a year or more after handover.', hintAr: 'غالبًا بعد عام أو أكثر من التسليم.', 
        aliases: ['Measurement Date'] },
      { key: 'owner', header: 'Owner (email)', headerAr: 'المالك (البريد)', kind: 'text', width: 26 },
    ],
  },
  {
    key: 'stakeholders',
    name: 'Stakeholders',
    nameAr: 'أصحاب المصلحة',
    shape: 'list',
    purpose: 'Who can affect delivery. Influence and interest place them on the grid and decide how closely each is managed.',
    purposeAr: 'من يمكنه التأثير على التنفيذ. التأثير والاهتمام يحدّدان موضعهم على الشبكة ومدى قرب متابعتهم.',
    columns: [
      { key: 'name', header: 'Name', headerAr: 'الاسم', kind: 'text', required: true, width: 28 },
      { key: 'organisation', header: 'Organisation', headerAr: 'الجهة', kind: 'text', width: 30, 
        aliases: ['Organization'] },
      { key: 'role', header: 'Role', headerAr: 'الدور', kind: 'text', width: 26 , aliases: ['Role'] },
      { key: 'influence', header: 'Influence 1-5', headerAr: 'التأثير ١-٥', kind: 'number', width: 14, 
        aliases: ['Influence'] },
      { key: 'interest', header: 'Interest 1-5', headerAr: 'الاهتمام ١-٥', kind: 'number', width: 14, 
        aliases: ['Interest'] },
      { key: 'isExternal', header: 'External?', headerAr: 'خارجي؟', kind: 'bool', width: 11 },
      { key: 'email', header: 'Email', headerAr: 'البريد الإلكتروني', kind: 'text', width: 28 },
      { key: 'phone', header: 'Phone', headerAr: 'الهاتف', kind: 'text', width: 18 },
    ],
  },
  /*
   * Added once the platform learned to write these records, so the workbook
   * keeps covering everything a project holds rather than the subset it
   * happened to cover first. An export that omits a section quietly teaches
   * people that the section does not matter.
   */
  {
    key: 'resources',
    nameAliases: ['Resource Assignments', 'تخصيص الموارد'],
    name: 'Resources',
    nameAr: 'الموارد',
    shape: 'list',
    purpose: 'Who is committed to this project, in what role and at what share of their time.',
    purposeAr: 'من المسند إلى هذا المشروع، بأي دور وبأي نسبة من وقته.',
    columns: [
      { key: 'person', header: 'Person (email)', headerAr: 'الشخص (البريد)', kind: 'text',
        required: true, width: 30,
        hint: 'Must already be a member of this workspace.',
        hintAr: 'يجب أن يكون عضوًا في مساحة العمل هذه مسبقًا.', 
        aliases: ['Employee ID'] },
      { key: 'role', header: 'Role', headerAr: 'الدور', kind: 'text', required: true, width: 26 },
      { key: 'allocationPct', header: 'Allocation %', headerAr: 'نسبة الإسناد', kind: 'number', width: 14, 
        aliases: ['Allocation'] },
      { key: 'startDate', header: 'From', headerAr: 'من', kind: 'date', width: 14 },
      { key: 'endDate', header: 'To', headerAr: 'إلى', kind: 'date', width: 14 },
    ],
  },
  {
    key: 'documents',
    name: 'Documents',
    nameAr: 'الوثائق',
    shape: 'list',
    purpose: 'The controlled documents behind the gates — where each lives and what state it is in.',
    purposeAr: 'الوثائق المضبوطة خلف البوابات — أين توجد كل منها وما حالتها.',
    columns: [
      { key: 'name', header: 'Document', headerAr: 'الوثيقة', kind: 'text', required: true, width: 34 , aliases: ['Title'] },
      { key: 'kind', header: 'Type', headerAr: 'النوع', kind: 'text', required: true, width: 18 , aliases: ['Document Type'] },
      { key: 'version', header: 'Version', headerAr: 'الإصدار', kind: 'text', width: 12, 
        aliases: ['Version'] },
      { key: 'status', header: 'Status', headerAr: 'الحالة', kind: 'choice', width: 16,
        choices: ['draft', 'in_review', 'approved', 'superseded'] },
      { key: 'url', header: 'Link', headerAr: 'الرابط', kind: 'text', width: 40,
        hint: 'The file stays where it already lives; this records where that is.',
        hintAr: 'يبقى الملف في مكانه؛ هنا يُسجَّل موضعه فقط.', 
        aliases: ['Repository Link'] },
      { key: 'owner', header: 'Owner (email)', headerAr: 'المالك (البريد)', kind: 'text', width: 28 },
    ],
  },
  {
    key: 'updates',
    name: 'Updates',
    nameAr: 'التحديثات',
    shape: 'list',
    purpose: 'The narrative record — what the numbers do not say, and who said it.',
    purposeAr: 'السجل السردي — ما لا تقوله الأرقام، ومن قاله.',
    columns: [
      { key: 'kind', header: 'Kind', headerAr: 'النوع', kind: 'choice', width: 16,
        choices: ['note', 'status', 'escalation'] },
      { key: 'body', header: 'Update', headerAr: 'التحديث', kind: 'text', required: true, width: 70 , aliases: ['Achievements', 'Update'] },
      { key: 'author', header: 'Author (email)', headerAr: 'الكاتب (البريد)', kind: 'text', width: 28 },
      { key: 'postedAt', header: 'Posted', headerAr: 'تاريخ النشر', kind: 'date', width: 16 },
    ],
  },
] as const;

export const sheetByKey = (key: string) => WORKBOOK.find((s) => s.key === key);

/** The seven gates and the checklist a new project starts with. */
export const DEFAULT_GATES: readonly { seq: number; name: string; criteria: readonly string[] }[] = [
  { seq: 0, name: 'Concept', criteria: [
    'Business case drafted and reviewed',
    'Strategic fit confirmed against portfolio objectives'] },
  { seq: 1, name: 'Feasibility', criteria: [
    'Feasibility study complete',
    'Order-of-magnitude cost estimate prepared',
    'Key risks identified and owned'] },
  { seq: 2, name: 'Design Development', criteria: [
    'Concept design approved',
    'Planning consent route agreed'] },
  { seq: 3, name: 'Detailed Design', criteria: [
    'Detailed design issued for construction',
    'Cost plan updated and within budget',
    'Permits obtained'] },
  { seq: 4, name: 'Procurement', criteria: [
    'Tender issued to qualified bidders',
    'Bid evaluation complete and signed',
    'Contractor prequalification verified',
    'Performance bonds and insurances received',
    'Contract award approved'] },
  { seq: 5, name: 'Construction', criteria: [
    'Site mobilisation complete',
    'Quality and HSE plans in place',
    'Progress against baseline reported monthly'] },
  { seq: 6, name: 'Handover', criteria: [
    'Snagging closed out',
    'As-built documentation handed over',
    'Benefits review scheduled'] },
];
