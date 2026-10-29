/**
 * Translation, keyed by the English source string.
 *
 * Deliberately not keyed by invented ids ('exec.tiles.budget'). Two reasons:
 * the English text stays readable at the call site, so nobody has to look up
 * what a key renders as; and a string with no entry falls back to English
 * rather than showing a raw key to a customer. A half-translated screen is a
 * bug we can see; `exec.tiles.budget` on a director's dashboard is not.
 *
 * Lives in contracts because both ends need it: the web app renders with it,
 * and the API writes Word, PowerPoint and Excel files with it. A second copy
 * would mean a board pack in Arabic disagreeing with the screen it came from.
 *
 * No provider and no context: a server component reads the cookie, a client
 * component takes `lang` as a prop. Both call `translator(lang)`.
 */
export type Lang = 'en' | 'ar';

/** English source → Arabic. */
const AR: Record<string, string> = {
  'The EPMO': 'المكتب التنفيذي لإدارة المشاريع',
  // ── shared chrome ──────────────────────────────────────────────────────
  'Search': 'بحث',
  'Nothing here yet.': 'لا يوجد شيء هنا بعد.',
  'Saved.': 'تم الحفظ.',
  'Not included in your plan': 'غير مشمول في باقتك',
  'This module is not enabled': 'هذه الوحدة غير مفعّلة',
  'The EPMO is licensed per module. An administrator can turn this on from':
    'يُرخَّص المكتب التنفيذي لإدارة المشاريع لكل وحدة على حدة. يمكن للمسؤول تفعيلها من',
  'Platform & Modules': 'المنصة والوحدات',
  'Not permitted': 'غير مصرّح',
  'Your role cannot open this': 'دورك لا يسمح بفتح هذه الصفحة',
  'Could not reach the API.': 'تعذّر الوصول إلى الخادم.',
  'Filter…': 'تصفية…',
  'Filter rows': 'تصفية الصفوف',
  'No rows match that filter.': 'لا توجد صفوف مطابقة.',
  'Cancel': 'إلغاء',
  'Checking…': 'جارٍ التحقق…',
  'Microsoft 365': 'مايكروسوفت 365',
  'not connected': 'غير متصل',
  'SharePoint, OneDrive and Power BI, in the customer’s own Microsoft tenant. Documents uploaded here are written to their storage and stay there — under their retention, their permissions and their legal hold. The EPMO keeps a pointer, never a copy.':
    'شيربوينت ووان درايف وباور بي آي، داخل حساب مايكروسوفت الخاص بالعميل. المستندات المرفوعة هنا تُكتب في مساحته وتبقى فيها — ضمن سياسات الاحتفاظ والصلاحيات والحجز القانوني لديه. يحتفظ المكتب التنفيذي لإدارة المشاريع بمؤشر فقط، لا بنسخة.',
  'Microsoft is connected.': 'تم ربط مايكروسوفت.',
  'Not configured on this server yet': 'لم تُهيّأ بعد على هذا الخادم',
  'An administrator needs to register The EPMO as a multi-tenant application in Entra ID, then set MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REDIRECT_URI and MS_TOKEN_KEY. Until then there is nothing for a customer to connect to. The steps are in docs/microsoft-setup.md.':
    'يحتاج المسؤول إلى تسجيل المكتب التنفيذي لإدارة المشاريع كتطبيق متعدد المستأجرين في Entra ID، ثم ضبط MS_CLIENT_ID وMS_CLIENT_SECRET وMS_REDIRECT_URI وMS_TOKEN_KEY. قبل ذلك لا يوجد ما يمكن للعميل الاتصال به. الخطوات في docs/microsoft-setup.md.',
  'Connect Microsoft': 'ربط مايكروسوفت',
  'Opening Microsoft…': 'جارٍ فتح مايكروسوفت…',
  'Only an administrator can connect this.': 'الربط متاح للمسؤول فقط.',
  'Only workspace administrators can view Microsoft connection details.': 'تفاصيل اتصال مايكروسوفت متاحة لمسؤولي مساحة العمل فقط.',
  'Reports use the workspace-connected Microsoft account; an administrator must approve Power BI before reports appear.': 'تعتمد التقارير على حساب مايكروسوفت المرتبط بمساحة العمل؛ ويجب أن يوافق المسؤول على باور بي آي قبل عرضها.',
  'Reports use the workspace-connected Microsoft account, not each EPMO user’s personal Power BI identity. Restrict that account to the minimum datasets necessary and grant access only to workspace administrators.': 'تستخدم التقارير حساب مايكروسوفت المرتبط بمساحة العمل وليس هوية باور بي آي الشخصية لكل مستخدم. يجب قصر صلاحيات الحساب على مجموعات البيانات الضرورية وإتاحة الوصول لمسؤولي مساحة العمل فقط.',
  'Account': 'الحساب',
  'Files go to': 'تُحفظ الملفات في',
  'nowhere yet — choose a library below': 'لم يُحدَّد بعد — اختر مكتبة أدناه',
  'Power BI': 'باور بي آي',
  'not approved': 'غير معتمد',
  'Connected': 'تاريخ الربط',
  'Choose where files go': 'اختر مكان حفظ الملفات',
  'Change location': 'تغيير المكان',
  'Looking…': 'جارٍ البحث…',
  'Add Power BI': 'إضافة باور بي آي',
  'Disconnect': 'قطع الاتصال',
  'Disconnecting…': 'جارٍ قطع الاتصال…',
  'Disconnected. {n} documents still point at files in that Microsoft tenant — the files are untouched, and reconnecting restores the links.':
    'تم قطع الاتصال. ما زال {n} مستندًا يشير إلى ملفات في حساب مايكروسوفت ذاك — الملفات كما هي، وإعادة الربط تستعيد الروابط.',
  'Which document library?': 'أي مكتبة مستندات؟',
  'Where should documents live?': 'أين تُحفظ المستندات؟',
  'Find a SharePoint site': 'ابحث عن موقع شيربوينت',
  'name or part of one': 'الاسم أو جزء منه',
  'My OneDrive': 'ون درايف الخاص بي',
  'Only this account can reach it. Fine for a trial; a SharePoint library is what a team wants.':
    'هذا الحساب وحده يصل إليه. مناسب للتجربة؛ أما الفريق فيحتاج مكتبة شيربوينت.',
  'No SharePoint sites came back for that account.':
    'لم تظهر أي مواقع شيربوينت لهذا الحساب.',
  'Back': 'رجوع',
  'Everything else': 'كل ما عدا ذلك',
  'Power BI is not connected yet': 'باور بي آي غير مرتبط بعد',
  'Reports are read from the customer’s own Power BI with their own account, so nothing appears here until somebody with their Microsoft credentials approves it.':
    'تُقرأ التقارير من باور بي آي الخاص بالعميل بحسابه هو، فلا يظهر هنا شيء حتى يعتمد ذلك شخص لديه بيانات دخول مايكروسوفت.',
  'Go to Integrations': 'الذهاب إلى التكاملات',
  'Open in Power BI': 'فتح في باور بي آي',
  'That Microsoft account can see no Power BI reports. Someone has to share a workspace with it, or publish a report into one.':
    'لا يرى حساب مايكروسوفت هذا أي تقارير في باور بي آي. على أحدهم مشاركة مساحة عمل معه أو نشر تقرير فيها.',
  'Why the reports are theirs and not ours': 'لماذا التقارير تقاريرهم لا تقاريرنا',
  'Finance teams have already built the reports they trust, against data we do not hold — ledgers, payroll, procurement. Rebuilding those inside The EPMO would mean a second version of a number that somebody has to reconcile every month. Embedding the real report instead means there is one version, it is theirs, and the permissions on it are the ones their own IT already set.':
    'بنت الفرق المالية بالفعل التقارير التي تثق بها، على بيانات لا نملكها — دفاتر الحسابات والرواتب والمشتريات. إعادة بنائها داخل المكتب التنفيذي لإدارة المشاريع تعني نسخة ثانية من رقم يحتاج أحدهم إلى مطابقتها كل شهر. تضمين التقرير الحقيقي يعني نسخة واحدة، هي نسختهم، وبالصلاحيات التي ضبطتها إدارة تقنية المعلومات لديهم.',
  'Upload to SharePoint': 'الرفع إلى شيربوينت',
  'The file is written to your own Microsoft storage, in a folder named for the project. The EPMO records where it is — it never keeps a copy.':
    'يُكتب الملف في مساحة مايكروسوفت الخاصة بك، داخل مجلد باسم المشروع. يسجّل المكتب التنفيذي لإدارة المشاريع موضعه فقط — ولا يحتفظ بنسخة.',
  '— workspace folder —': '— مجلد مساحة العمل —',
  'Uploading…': 'جارٍ الرفع…',
  'Upload': 'رفع',
  'Uploaded': 'تم الرفع',
  'Open in SharePoint': 'فتح في شيربوينت',
  'in SharePoint': 'في شيربوينت',
  'Contract': 'عقد',
  'Reading…': 'جارٍ القراءة…',
  'Updating…': 'جارٍ التحديث…',
  'The import failed.': 'فشل الاستيراد.',
  'That code is already in use': 'هذا الرمز مستخدم بالفعل',
  'in this workspace since': 'في مساحة العمل منذ',
  'Updating it would': 'التحديث سيؤدي إلى',
  'It would not touch': 'ولن يمسّ',
  'replace the schedule, cost lines, benefits, stakeholders and resourcing with what is in the sheet':
    'استبدال الجدول الزمني وبنود التكلفة والمنافع وأصحاب المصلحة والموارد بما في الملف',
  'update register items and documents that match by name, and add the ones that do not':
    'تحديث بنود السجل والمستندات المطابقة بالاسم، وإضافة غير المطابقة',
  'add any new update entries, skipping ones already recorded word for word':
    'إضافة التحديثات الجديدة فقط، مع تجاوز ما سبق تسجيله حرفيًا',
  'the gates, their checklists, or anything already signed off':
    'البوابات وقوائم التحقق الخاصة بها وكل ما تم اعتماده',
  'register items and documents that are not named in the sheet':
    'بنود السجل والمستندات غير المذكورة في الملف',
  'To load it as a separate project instead, change the project code in the sheet and upload again.':
    'لتحميله كمشروع منفصل، غيّر رمز المشروع في الملف ثم ارفعه من جديد.',
  'programmes': 'برامج',
  'gate criteria': 'معايير البوابات',
  'schedule items': 'بنود الجدول الزمني',
  'register items': 'بنود السجل',
  'register items updated': 'بنود سجل محدَّثة',
  'cost lines': 'بنود التكلفة',
  'resource allocations': 'تخصيصات الموارد',
  'documents updated': 'مستندات محدَّثة',
  'criteria signed off': 'معايير معتمدة',
  'Saving…': 'جارٍ الحفظ…',
  'That could not be saved.': 'تعذّر الحفظ.',
  'Could not reach the server. Check your connection and try again.':
    'تعذّر الوصول إلى الخادم. تحقّق من اتصالك وحاول مرة أخرى.',
  'At least 10 characters. They should change it after signing in.':
    '10 أحرف على الأقل. ينبغي تغييرها بعد تسجيل الدخول.',
  'Only an Owner, Administrator or Client Administrator can add people to this workspace. Ask one of them, or ask to be made a Client Administrator.':
    'إضافة الأشخاص إلى مساحة العمل متاحة للمالك أو مدير النظام أو مدير العميل فقط. اطلب ذلك من أحدهم، أو اطلب ترقيتك إلى مدير عميل.',
  'Save': 'حفظ',
  'Close': 'إغلاق',
  'Open': 'فتح',

  // ── controlled vocabulary ──────────────────────────────────────────────
  'on track': 'على المسار',
  'at risk': 'في خطر',
  'critical': 'حرج',
  'planning': 'التخطيط',
  'active': 'نشط',
  'on hold': 'معلّق',
  'closed': 'مغلق',
  'open': 'مفتوح',
  'mitigating': 'قيد المعالجة',
  'locked': 'مقفل',
  'approved': 'معتمد',
  'rejected': 'مرفوض',
  'pending': 'قيد الانتظار',
  'risk': 'مخاطرة',
  'assumption': 'افتراض',
  'issue': 'مشكلة',
  'dependency': 'اعتمادية',
  'change': 'تغيير',
  'decision': 'قرار',
  'note': 'ملاحظة',
  'status': 'حالة',
  'escalation': 'تصعيد',
  'To do': 'قيد الانتظار',
  'In progress': 'قيد التنفيذ',
  'Blocked': 'محجوب',
  'Done': 'منجز',
  'draft': 'مسودة',
  'in review': 'قيد المراجعة',
  'superseded': 'مستبدل',
  'accountable': 'مسؤول',
  'consulted': 'مستشار',
  'available': 'متاح',
  'beta': 'تجريبي',
  'unassigned': 'غير مُسند',
  'always on': 'مفعّل دائمًا',

  // ── executive overview ─────────────────────────────────────────────────
  'Executive Overview': 'النظرة التنفيذية',
  'Are we delivering the strategy? What needs attention now, and where is a decision required?':
    'هل ننفّذ الاستراتيجية؟ ما الذي يحتاج انتباهًا الآن، وأين يلزم اتخاذ قرار؟',
  'Projects': 'المشاريع',
  'Average progress': 'متوسط الإنجاز',
  'Gates blocked': 'البوابات المحجوبة',
  'a blocked gate holds funding': 'البوابة المحجوبة توقف التمويل',
  'Budget drawn': 'الميزانية المصروفة',
  'Open register items': 'بنود السجل المفتوحة',
  'Benefits on track': 'المنافع على المسار',
  'Needs attention': 'يحتاج انتباهًا',
  'Executive priorities': 'الأولويات التنفيذية',
  'Priority queue includes gate blockers, critical risks and overdue items.':
    'تشمل قائمة الأولويات عوائق البوابات والمخاطر الحرجة والبنود المتأخرة.',
  'No active gate': 'لا توجد بوابة نشطة',
  '{code} — {name} is {health} and has no active gate.':
    '{code} — {name} حالته {health} ولا توجد له بوابة نشطة.',
  'Missing gate checklist': 'قائمة متطلبات البوابة غير محددة',
  'Unmet criteria': 'معايير غير مستوفاة',
  'No approvers assigned': 'لا يوجد معتمدون معيّنون',
  'No accountable approver': 'لا يوجد معتمد مسؤول',
  'Pending signatures': 'توقيعات معلّقة',
  'Rejected approvals': 'اعتمادات مرفوضة',
  'Unapproved prior gates': 'بوابات سابقة غير معتمدة',
  'Open gate blockers': 'عوائق بوابة مفتوحة',
  'Critical RAID items': 'بنود حرجة في سجل المخاطر والقضايا',
  'Overdue RAID items': 'بنود متأخرة في سجل المخاطر والقضايا',
  'Nothing is off track. Unusual — check the data is current.':
    'لا شيء خارج المسار. أمر غير معتاد — تأكد من حداثة البيانات.',
  'Project': 'المشروع',
  'Health': 'الحالة الصحية',
  'Current gate': 'البوابة الحالية',
  'Why': 'السبب',
  'health flag, no blocker recorded': 'مؤشر حالة، دون تسجيل أي عائق',
  'on track ': 'على المسار ',
  'at risk ': 'في خطر ',
  'critical ': 'حرج ',
  'overdue': 'متأخر',
  'realized': 'محقّقة',
  'of': 'من',
  'SAR': 'ريال',

  // ── my work ────────────────────────────────────────────────────────────
  'My Work': 'عملي',
  'Everything assigned to you, ranked by what is blocking a gate rather than by due date.':
    'كل ما هو مُسند إليك، مرتبًا بما يحجب البوابات لا بتاريخ الاستحقاق.',
  'Open tasks': 'المهام المفتوحة',
  'Awaiting your signature': 'بانتظار توقيعك',
  'Criteria to evidence': 'معايير تحتاج إثباتًا',
  'Hours logged, 7 days': 'الساعات المسجلة، ٧ أيام',
  'Approvals waiting on you': 'الموافقات بانتظارك',
  'Blocking': 'العائق',
  'Gate': 'البوابة',
  'Role': 'الدور',

  // ── activity ───────────────────────────────────────────────────────────
  'Activity & Attention': 'النشاط والانتباه',
  'What changed, and what needs a decision now. The audit trail is append-only — nothing here can be edited after the fact.':
    'ما الذي تغيّر، وما الذي يحتاج قرارًا الآن. سجل التدقيق للإضافة فقط — لا يمكن تعديل أي شيء هنا لاحقًا.',
  'Needs a decision': 'يحتاج قرارًا',
  'Audit trail': 'سجل التدقيق',
  'Type': 'النوع',
  'Detail': 'التفاصيل',
  'Due': 'الاستحقاق',
  'When': 'الوقت',
  'Who': 'من',
  'Action': 'الإجراء',
  'Entity': 'العنصر',

  // ── portfolios ─────────────────────────────────────────────────────────
  'Portfolios & Programs': 'المحافظ والبرامج',
  'How projects are grouped for funding and management.':
    'كيف تُجمَّع المشاريع لأغراض التمويل والإدارة.',
  'Portfolio': 'المحفظة',
  'Programs': 'البرامج',
  'New portfolio': 'محفظة جديدة',
  'New programme': 'برنامج جديد',
  'Portfolio name': 'اسم المحفظة',
  'Programme name': 'اسم البرنامج',

  // ── projects ───────────────────────────────────────────────────────────
  'Everything being delivered, with budget, health and progress. Creating a project also opens its first gate.':
    'كل ما يجري تنفيذه، بالميزانية والحالة والإنجاز. إنشاء مشروع يفتح أيضًا بوابته الأولى.',
  'New project': 'مشروع جديد',
  'Code': 'الرمز',
  'Status': 'الحالة',
  'Progress': 'الإنجاز',
  'Budget': 'الميزانية',
  'Project code': 'رمز المشروع',
  'Project name': 'اسم المشروع',
  'Filter by code, name or status…': 'تصفية بالرمز أو الاسم أو الحالة…',

  // ── work board ─────────────────────────────────────────────────────────
  'Work Board': 'لوحة العمل',
  'Day-to-day work across the portfolio, by workflow state. Use the arrows on a card to move it — every move is recorded in the audit trail.':
    'العمل اليومي عبر المحفظة، حسب حالة سير العمل. استخدم الأسهم على البطاقة لنقلها — كل نقل يُسجَّل في سجل التدقيق.',
  'No tasks yet.': 'لا توجد مهام بعد.',
  'Move to': 'نقل إلى',

  // ── planner ────────────────────────────────────────────────────────────
  'Planner, Gantt & Calendar': 'المخطط وجانت والتقويم',
  'Delivery dates against baseline. A red edge means the item finishes later than it was originally planned to.':
    'تواريخ التسليم مقابل خط الأساس. الحد الأحمر يعني أن البند ينتهي متأخرًا عمّا خُطط له.',
  'Slippage against baseline': 'الانزلاق مقابل خط الأساس',
  'Item': 'البند',
  'Planned finish': 'الانتهاء المخطط',
  'Now finishing': 'الانتهاء الحالي',
  'Slip': 'الانزلاق',

  // ── governance ─────────────────────────────────────────────────────────
  'Stage Gates': 'بوابات المراحل',
  'Which projects are stuck, at which gate, and why. Open one to tick criteria, sign approvals and pass the gate.':
    'أي المشاريع متوقفة، وعند أي بوابة، ولماذا. افتح مشروعًا لتأشير المعايير وتوقيع الموافقات وتجاوز البوابة.',
  'Checklist': 'قائمة التحقق',
  'Signatures': 'التواقيع',
  'Accountable': 'المسؤول',
  'Blocked by': 'محجوب بواسطة',
  'Can pass?': 'يمكن التجاوز؟',
  'yes': 'نعم',
  'no': 'لا',
  'no checklist': 'لا توجد قائمة تحقق',
  'all signed': 'وُقّعت بالكامل',
  'Pass this gate': 'تجاوز هذه البوابة',
  'Cannot pass yet': 'لا يمكن التجاوز بعد',
  'Ready to pass': 'جاهزة للتجاوز',
  'Mark met': 'تحديد كمستوفى',
  'Sign': 'توقيع',
  'Reject': 'رفض',
  'Close item': 'إغلاق البند',
  'Criteria': 'المعايير',
  'Approvers': 'المعتمدون',
  'Blockers': 'العوائق',
  'Add criterion': 'إضافة معيار',
  'Link to the evidence document (required)': 'رابط مستند الإثبات (مطلوب)',
  'Stage gate governance.': 'حوكمة بوابات المراحل.',

  // ── raid ───────────────────────────────────────────────────────────────
  'RAID & Governance': 'سجل المخاطر والحوكمة',
  'Risks, assumptions, issues, dependencies, changes and decisions. An open item pointed at a gate holds that gate shut.':
    'المخاطر والافتراضات والمشكلات والاعتماديات والتغييرات والقرارات. أي بند مفتوح موجَّه إلى بوابة يُبقيها مغلقة.',
  'New register item': 'بند سجل جديد',
  'Add to register': 'إضافة إلى السجل',
  'Blocks': 'يحجب',
  'Owner': 'المالك',
  'Title': 'العنوان',
  'Impact': 'الأثر',
  'Likelihood': 'الاحتمالية',
  'Score': 'الدرجة',

  // ── decisions ──────────────────────────────────────────────────────────
  'Decisions': 'القرارات',
  'The decision log. Every recorded decision, who owned it, and which gate it was taken at — the record auditors ask for first.':
    'سجل القرارات. كل قرار مسجَّل، ومن تولّاه، وعند أي بوابة اتُّخذ — أول ما يطلبه المدققون.',
  'Decision': 'القرار',
  'Taken at': 'اتُّخذ عند',
  'Date': 'التاريخ',
  'State': 'الحالة',

  // ── approvals ──────────────────────────────────────────────────────────
  'Approvals': 'الموافقات',
  'Every signature the platform is waiting on, and whether the gate is actually ready to sign.':
    'كل توقيع تنتظره المنصة، وما إذا كانت البوابة جاهزة فعلًا للتوقيع.',
  'Awaiting signature': 'بانتظار التوقيع',
  'Ready to sign now': 'جاهزة للتوقيع الآن',
  'Ready?': 'جاهزة؟',

  // ── analytics ──────────────────────────────────────────────────────────
  'Portfolio Analytics': 'تحليلات المحفظة',
  'Distributions across the whole portfolio — where the risk, the slippage and the spend actually sit.':
    'التوزيعات عبر المحفظة كاملة — أين تقع المخاطر والانزلاق والإنفاق فعليًا.',
  'Project health': 'صحة المشاريع',
  'Gate funnel': 'مسار البوابات',
  'Risk heat map': 'خريطة حرارة المخاطر',
  'Budget vs spend': 'الميزانية مقابل الإنفاق',
  'Schedule slippage': 'انزلاق الجدول',
  'Baselined items': 'البنود المعتمدة بخط أساس',
  'Slipped': 'منزلقة',
  'Worst slip': 'أسوأ انزلاق',

  // ── financials ─────────────────────────────────────────────────────────
  'Financials': 'الماليات',
  'Budget, committed, spent and forecast — with earned value, so an overrun shows before it lands.':
    'الميزانية والالتزامات والمصروف والتوقّع — مع القيمة المكتسبة، ليظهر التجاوز قبل وقوعه.',
  'Committed': 'ملتزم به',
  'Actual': 'الفعلي',
  'Forecast': 'التوقّع',
  'Earned value': 'القيمة المكتسبة',
  'Variance': 'الانحراف',
  'too early': 'مبكر جدًا',

  // ── benefits ───────────────────────────────────────────────────────────
  'Benefits': 'المنافع',
  'Did the project deliver the value it promised? Tracked after handover — the step most tools skip.':
    'هل حقّق المشروع القيمة التي وعد بها؟ تُتابَع بعد التسليم — الخطوة التي تتجاهلها معظم الأدوات.',
  'Baseline': 'خط الأساس',
  'Target': 'المستهدف',
  'Review': 'المراجعة',
  'lower is better': 'الأقل أفضل',

  // ── resources ──────────────────────────────────────────────────────────
  'Resources': 'الموارد',
  'Who is working on what, and who is over-committed. Over-allocation is the earliest warning of slippage.':
    'من يعمل على ماذا، ومن حُمِّل فوق طاقته. الإفراط في التخصيص أبكر إنذار بالانزلاق.',
  'Allocated': 'المخصص',
  'Hours, 7 days': 'الساعات، ٧ أيام',
  'Person': 'الشخص',

  // ── reports ────────────────────────────────────────────────────────────
  'Reports': 'التقارير',
  'Board packs generated from live data rather than assembled by hand.':
    'حزم مجلس الإدارة مُولَّدة من بيانات حيّة بدل تجميعها يدويًا.',
  'Report': 'التقرير',
  'Audience': 'الجمهور',
  'Schedule': 'الجدولة',
  'Last generated': 'آخر توليد',

  // ── documents ──────────────────────────────────────────────────────────
  'Documents': 'المستندات',
  'Deliverables and gate evidence. A document linked to a gate criterion is what turns a tick into proof.':
    'المخرجات وأدلة البوابات. المستند المرتبط بمعيار بوابة هو ما يحوّل العلامة إلى إثبات.',
  'Document': 'المستند',
  'Ver': 'الإصدار',
  'Evidence for': 'إثبات لـ',
  'Size': 'الحجم',

  // ── updates ────────────────────────────────────────────────────────────
  'Updates': 'التحديثات',
  'Narrative from the delivery teams — what the numbers do not say.':
    'سرد من فرق التنفيذ — ما لا تقوله الأرقام.',
  'New update': 'تحديث جديد',

  // ── stakeholders ───────────────────────────────────────────────────────
  'Stakeholders': 'أصحاب المصلحة',
  'Who can affect delivery, and how closely each needs managing. Placement comes from influence × interest.':
    'من يمكنه التأثير على التنفيذ، وكم يحتاج كل منهم إلى متابعة. الموضع من التأثير × الاهتمام.',
  'Influence': 'التأثير',
  'Interest': 'الاهتمام',
  'Handling': 'أسلوب التعامل',
  'manage closely': 'إدارة لصيقة',
  'keep satisfied': 'إبقاؤه راضيًا',
  'keep informed': 'إبقاؤه مطّلعًا',
  'monitor': 'مراقبة',
  'External': 'خارجي',

  // ── studio / integrations / settings / platform ────────────────────────
  'Platform Studio': 'استوديو المنصة',
  'Configure the platform without code — custom fields, gate templates and automations.':
    'اضبط المنصة دون برمجة — حقول مخصصة وقوالب بوابات وأتمتة.',
  'Automations': 'الأتمتة',
  'Custom fields': 'الحقول المخصصة',
  'Gate templates': 'قوالب البوابات',
  'Then': 'عندها',
  'Key': 'المفتاح',
  'Integrations': 'التكاملات',
  'Connections to the systems the delivery world actually runs on.':
    'اتصالات بالأنظمة التي يعمل عليها عالم التنفيذ فعليًا.',
  'Last sync': 'آخر مزامنة',
  'Workspace Settings': 'إعدادات مساحة العمل',
  'Who is in this workspace, what they can do, and how it is configured.':
    'من في مساحة العمل هذه، وما الذي يمكنهم فعله، وكيف جرى ضبطها.',
  'Members': 'الأعضاء',
  'What your role can do': 'ما يمكن لدورك فعله',
  'Capability': 'الصلاحية',
  'The EPMO is a set of modules on one platform. Enable what this workspace has licensed — the server enforces it, so a disabled module refuses even if its address is typed directly.':
    'المكتب التنفيذي لإدارة المشاريع مجموعة وحدات على منصة واحدة. فعّل ما رخّصته مساحة العمل هذه — الخادم هو من يفرض ذلك، فالوحدة المعطّلة ترفض الطلب حتى لو كُتب عنوانها مباشرة.',
  'Modules': 'الوحدات',
  'Modules enabled': 'الوحدات المفعّلة',
  'In the catalogue': 'في الكتالوج',
  'Platform version': 'إصدار المنصة',
  'licensable modules': 'وحدات قابلة للترخيص',
  'modular monolith': 'كيان معياري موحّد',
  'Enable': 'تفعيل',
  'Disable': 'تعطيل',
  'Part of the platform': 'جزء من المنصة',
  'No dependencies': 'بلا اعتماديات',
  'Requires': 'يتطلب',
  // ── added while converting screens ─────────────────────────────────────
  'No projects have an active gate.': 'لا توجد مشاريع لديها بوابة نشطة.',
  'Nothing awaiting approval.': 'لا شيء بانتظار الموافقة.',
  'No projects yet.': 'لا توجد مشاريع بعد.',
  'Queue': 'قائمة الانتظار',
  'Approver': 'المعتمِد',
  'criteria met, nothing blocking': 'المعايير مستوفاة، لا شيء يحجب',
  'cannot sign yet': 'لا يمكن التوقيع بعد',
  'criteria left': 'معايير متبقية',
  'blocker': 'عائق',
  'blockers': 'عوائق',
  'ready': 'جاهزة',
  'Why an approval can be “pending” but not signable':
    'لماذا تكون الموافقة «قيد الانتظار» وغير قابلة للتوقيع',
  'A signature is only meaningful once the evidence exists. The platform will not let an approver sign a gate whose checklist is incomplete or which has an open blocker pointed at it — so “pending” and “ready” are different states, and this queue tells the approver which of the two they are looking at.':
    'لا معنى للتوقيع إلا بعد وجود الإثبات. لن تسمح المنصة للمعتمِد بتوقيع بوابة قائمة تحققها غير مكتملة أو لديها عائق مفتوح موجَّه إليها — لذا «قيد الانتظار» و«جاهزة» حالتان مختلفتان، وهذه القائمة تخبر المعتمِد أيهما ينظر إليه.',

  // ── remaining screens ──────────────────────────────────────────────────
  'Active automations': 'الأتمتة النشطة',
  'Actual spend': 'الإنفاق الفعلي',
  'Allocation': 'التخصيص',
  'Allocations by project': 'التخصيصات حسب المشروع',
  'Applies to': 'ينطبق على',
  'Approved budget': 'الميزانية المعتمدة',
  'Automation': 'أتمتة',
  'Benefit': 'المنفعة',
  'By category': 'حسب الفئة',
  'By project': 'حسب المشروع',
  'CPI': 'مؤشر أداء التكلفة',
  'Category': 'الفئة',
  'Connected systems': 'الأنظمة المتصلة',
  'Criterion': 'المعيار',
  'Drawn': 'المصروف',
  'Email': 'البريد الإلكتروني',
  'Evidence you owe': 'إثباتات مطلوبة منك',
  'Forecast variance': 'انحراف التوقّع',
  'How documents connect to governance': 'كيف ترتبط المستندات بالحوكمة',
  'Label': 'التسمية',
  'Last run': 'آخر تشغيل',
  'Load': 'الحِمل',
  'Measure': 'المقياس',
  'Name': 'الاسم',
  'Options': 'الخيارات',
  'Organisation': 'الجهة',
  'Required': 'مطلوب',
  'Risk': 'المخاطرة',
  'Runs': 'مرات التشغيل',
  'Stakeholder': 'صاحب المصلحة',
  'Task': 'المهمة',
  'Tasks': 'المهام',
  'Updated': 'آخر تحديث',
  'What CPI and earned value mean': 'ماذا يعني مؤشر أداء التكلفة والقيمة المكتسبة',
  'What has happened': 'ما الذي حدث',
  'What it allows': 'ما الذي تتيحه',
  'What the handling column means': 'ماذا يعني عمود أسلوب التعامل',
  'Why benefits are tracked separately from delivery': 'لماذا تُتابَع المنافع بمعزل عن التنفيذ',
  'Why modules are enforced in the API, not the menu': 'لماذا تُفرَض الوحدات في الواجهة البرمجية لا في القائمة',
  'Why these particular integrations': 'لماذا هذه التكاملات تحديدًا',
  'Workspace': 'مساحة العمل',
  'You': 'أنت',
  'Your role': 'دورك',
  'rows': 'صفوف',
  'Nothing matches that filter': 'لا شيء يطابق هذه التصفية',
  'Nothing here yet': 'لا يوجد شيء هنا بعد',
  'Try a shorter search, or clear the filter.': 'جرّب بحثًا أقصر، أو امسح التصفية.',
  'Clear filter': 'مسح التصفية',
  'Choose…': 'اختر…',
  '— none —': '— بلا —',
  'Create': 'إنشاء',
  'Created': 'تم الإنشاء',
  'Create project': 'إنشاء مشروع',
  'portfolio': 'محفظة',
  'program': 'برنامج',
  'project': 'مشروع',
  'raid': 'بند سجل',
  'task': 'مهمة',
  'update': 'تحديث',

  // ── module catalogue, prose and fragments ──────────────────────────────
  'Identity, tenants, roles and capabilities, audit trail, settings, configuration studio.':
    'الهوية ومساحات العمل والأدوار والصلاحيات وسجل التدقيق والإعدادات واستوديو الضبط.',
  'Portfolios, programmes, projects, tasks, schedule, stage gates, RAID, decisions and approvals.':
    'المحافظ والبرامج والمشاريع والمهام والجدول وبوابات المراحل وسجل المخاطر والقرارات والموافقات.',
  'Cross-module dashboards, portfolio analytics and the reporting framework.':
    'لوحات معلومات عبر الوحدات وتحليلات المحفظة وإطار التقارير.',
  'Benefit definition, baseline/target/actual tracking and realisation after closure.':
    'تعريف المنافع وتتبع خط الأساس والمستهدف والفعلي وتحقّقها بعد الإغلاق.',
  'Project cost control, commitments, forecasting and earned value across the portfolio.':
    'ضبط تكاليف المشاريع والالتزامات والتوقّعات والقيمة المكتسبة عبر المحفظة.',
  'Risk and issue register with 5×5 scoring, ownership and gate blocking.':
    'سجل المخاطر والمشكلات بتقييم ٥×٥ وملكية وحجب للبوابات.',
  'Document register with versions, approval status and gate evidence.':
    'سجل المستندات بالإصدارات وحالة الاعتماد وأدلة البوابات.',
  'People, allocation, capacity planning and logged effort.':
    'الأشخاص والتخصيص وتخطيط الطاقة والجهد المسجَّل.',
  'Clients, engagements and stakeholder mapping with influence analysis.':
    'العملاء والارتباطات وخرائط أصحاب المصلحة مع تحليل التأثير.',
  'forecast vs approved':
    'التوقّع مقابل المعتمد',
  'None.':
    'لا شيء.',
  'on since':
    'مفعّلة منذ',
  '% of the way from baseline to target':
    '٪ من الطريق بين خط الأساس والمستهدف',
  'A gate cannot be signed until someone is accountable for it.':
    'لا يمكن توقيع بوابة قبل أن يكون هناك مسؤول عنها.',
  'No open register item points at this gate.':
    'لا يوجد بند سجل مفتوح موجَّه إلى هذه البوابة.',
  'Create one above. Portfolios hold programmes, and programmes hold projects.':
    'أنشئ واحدة أعلاه. المحافظ تحتوي البرامج، والبرامج تحتوي المشاريع.',
  'Add risks, issues and dependencies above. Pointing one at a gate is what turns a register entry into a control.':
    'أضف المخاطر والمشكلات والاعتماديات أعلاه. توجيه أحدها إلى بوابة هو ما يحوّل بند السجل إلى أداة ضبط.',
  'A project can finish on time and on budget and still deliver nothing of value. Benefits have their own owner and their own review date — often a year or more after handover — so the question &ldquo;was this worth doing?&rdquo; still gets asked once the delivery team has moved on. Baseline is where you started, target is what you promised, actual is where you are.':
    'قد ينتهي المشروع في وقته وضمن ميزانيته ولا يقدّم أي قيمة. للمنافع مالك خاص وتاريخ مراجعة خاص — غالبًا بعد عام أو أكثر من التسليم — حتى يظل سؤال «هل كان هذا يستحق؟» مطروحًا بعد أن ينتقل فريق التنفيذ. خط الأساس هو نقطة البداية، والمستهدف ما وعدت به، والفعلي أين أنت الآن.',
  'Two of the documents above are attached to a specific gate criterion. That link is the difference between a checklist someone ticked and a checklist someone can prove — when an auditor asks &ldquo;what evidence did you have when you approved this?&rdquo;, the answer is a file with a version number, an owner and a date.':
    'مستندان من أعلاه مرتبطان بمعيار بوابة محدد. هذا الارتباط هو الفرق بين قائمة تحقق أشّر عليها أحدهم وقائمة يمكن إثباتها — فحين يسأل المدقق «ما الدليل الذي كان لديك عند الاعتماد؟»، يكون الجواب ملفًا له رقم إصدار ومالك وتاريخ.',
  'Capital programmes in the region already run on Primavera P6 for schedules and SharePoint for documents, and finance teams want the numbers in Power BI. An integration that pulls a P6 schedule in is worth more than any feature we could build to replace it — the goal is to govern the delivery data, not to make people re-enter it.':
    'البرامج الرأسمالية في المنطقة تعمل بالفعل على Primavera P6 للجداول وSharePoint للمستندات، وفرق المالية تريد الأرقام في Power BI. تكامل يسحب جدول P6 أثمن من أي ميزة نبنيها لتحل محله — الهدف حوكمة بيانات التنفيذ لا إعادة إدخالها.',

  // ── leftover chrome found by sweeping the JSX ──────────────────────────
  'Add a criterion':
    'إضافة معيار',
  'Anything else that must be proven before this gate opens.':
    'أي شيء آخر يجب إثباته قبل فتح هذه البوابة.',
  'Assign':
    'إسناد',
  'Blocking this gate':
    'يحجب هذه البوابة',
  'Capacity':
    'الطاقة',
  'Choose a person…':
    'اختر شخصًا…',
  'Complete':
    'مكتمل',
  'Could not do that.':
    'تعذّر تنفيذ ذلك.',
  'Data isolation':
    'عزل البيانات',
  'Direction':
    'الاتجاه',
  'Entry criteria':
    'معايير الدخول',
  'Every gate has been passed. This project is closed.':
    'تم تجاوز كل البوابات. هذا المشروع مغلق.',
  'Generated from live portfolio data. Every figure traces to a record in the platform.':
    'مُولَّد من بيانات المحفظة الحيّة. كل رقم يعود إلى سجل في المنصة.',
  'Hiding a link stops nobody: the URL is still there and the data behind it is still reachable. Every module-owned route carries the module that owns it, and a guard checks the workspace entitlement on each request — so a workspace on a PMO-only plan gets a clear refusal from':
    'إخفاء الرابط لا يوقف أحدًا: العنوان ما زال موجودًا والبيانات خلفه ما زالت قابلة للوصول. كل مسار تملكه وحدة يحمل اسم وحدته، ويتحقق حارس من استحقاق مساحة العمل في كل طلب — فمساحة عمل على باقة PMO فقط تتلقى رفضًا واضحًا من',
  'How far projects have got. A wall of “locked” at one gate is where the portfolio is jamming.':
    'إلى أين وصلت المشاريع. جدار من «المقفل» عند بوابة واحدة هو موضع اختناق المحفظة.',
  'Identifier':
    'المعرّف',
  'It only becomes meaningful once spend covers a comparable scope, so projects with less than 15% of budget drawn show':
    'لا يصبح ذا معنى إلا بعد أن يغطي الإنفاق نطاقًا مماثلًا، لذا تُظهر المشاريع التي صُرف منها أقل من ١٥٪ من الميزانية',
  'Live data':
    'بيانات حيّة',
  'No activity recorded yet. Create or change a project and it will appear here.':
    'لم يُسجَّل أي نشاط بعد. أنشئ مشروعًا أو غيّره وسيظهر هنا.',
  'No approvers assigned to this gate':
    'لا يوجد معتمدون مسندون إلى هذه البوابة',
  'No governance activity yet':
    'لا يوجد نشاط حوكمة بعد',
  'No open tasks.':
    'لا توجد مهام مفتوحة.',
  'No portfolios yet':
    'لا توجد محافظ بعد',
  'No query from this workspace can return another workspace’s rows.':
    'لا يمكن لأي استعلام من مساحة العمل هذه أن يُرجع صفوف مساحة عمل أخرى.',
  'Nothing is blocking':
    'لا شيء يحجب',
  'Nothing outstanding.':
    'لا شيء معلّق.',
  'Nothing to sign.':
    'لا شيء للتوقيع.',
  'One person owns this decision. Reassigning replaces the current owner.':
    'شخص واحد يملك هذا القرار. إعادة الإسناد تستبدل المالك الحالي.',
  'Open register items by impact (rows) against likelihood (columns). Top-right is where the danger is.':
    'بنود السجل المفتوحة حسب الأثر (الصفوف) مقابل الاحتمالية (الأعمدة). أعلى اليمين هو موضع الخطر.',
  'Open the board pack':
    'فتح حزمة المجلس',
  'Portfolio Board Pack':
    'حزمة مجلس المحفظة',
  'Provider':
    'المزوّد',
  'Records synced':
    'السجلات المتزامنة',
  'Set the accountable owner':
    'تعيين المالك المسؤول',
  'The portfolio holds':
    'تحتوي المحفظة على',
  'The register is empty':
    'السجل فارغ',
  'The standard influence/interest grid. High influence and high interest means':
    'شبكة التأثير/الاهتمام المعيارية. التأثير العالي والاهتمام العالي يعني',
  'You are signed in as':
    'أنت مسجَّل الدخول باسم',

  // ── top bar, palette, workspace switcher ───────────────────────────────
  'Search — command palette': 'بحث — لوحة الأوامر',
  'Command palette': 'لوحة الأوامر',
  'Jump to a module…': 'انتقل إلى وحدة…',
  'Nothing matches': 'لا شيء يطابق',
  'move': 'تنقّل',
  'close': 'إغلاق',
  'Switch workspace': 'تبديل مساحة العمل',
  'Sign out': 'تسجيل الخروج',
  'end this session': 'إنهاء هذه الجلسة',
  'Sign out all devices': 'تسجيل الخروج من جميع الأجهزة',
  'revoke every active session': 'إلغاء جميع الجلسات النشطة',
  'owner': 'مالك',
  'admin': 'مسؤول',
  'manager': 'مدير',
  'member': 'عضو',
  'viewer': 'مُشاهد',
  'staff consultant': 'استشاري الفريق',
  'Open navigation': 'فتح التنقل',
  'Close navigation': 'إغلاق قائمة التنقل',
  'capabilities': 'صلاحيات',
  'current': 'الحالية',

  // ── capabilities and last chrome ───────────────────────────────────────
  'Reporting & Exports': 'التقارير والتصدير',
  'See the workspace and anything not otherwise restricted': 'رؤية مساحة العمل وكل ما ليس مقيّدًا بخلاف ذلك',
  'View portfolios, programmes and analytics': 'عرض المحافظ والبرامج والتحليلات',
  'View budgets, spend and benefits': 'عرض الميزانيات والإنفاق والمنافع',
  'Create and change projects and programmes': 'إنشاء وتعديل المشاريع والبرامج',
  'Manage tasks and the schedule': 'إدارة المهام والجدول',
  'Manage the register and stage gates': 'إدارة السجل وبوابات المراحل',
  'Sign gate approvals': 'توقيع موافقات البوابات',
  'Configure the workspace': 'ضبط مساحة العمل',
  'Loading…': 'جارٍ التحميل…',
  'enforced by the database': 'مفروض من قاعدة البيانات',

  // ── excel in & out ─────────────────────────────────────────────────────
  'Excel In & Out':
    'إكسل: تصدير واستيراد',
  'One workbook is the template, the export and the upload. Download it, fill it in or edit it in Excel, and load it back — the shape does not change between the three.':
    'مصنّف واحد هو القالب والتصدير والاستيراد. نزّله واملأه أو عدّله في إكسل ثم أعد تحميله — الشكل لا يتغيّر بين الثلاثة.',
  'Start a new project':
    'ابدأ مشروعًا جديدًا',
  'The blank master workbook. Every section is there and the seven stage gates arrive with their standard checklist already written, so a project loaded from it can be governed the moment it lands.':
    'المصنّف الرئيسي الفارغ. كل الأقسام موجودة، وبوابات المراحل السبع تصل بقائمة التحقق المعيارية مكتوبة مسبقًا، فيصبح المشروع المحمَّل منه قابلًا للحوكمة فور وصوله.',
  'Download template':
    'تنزيل القالب',
  'Arabic template':
    'القالب العربي',
  'Export a project':
    'تصدير مشروع',
  'Everything the platform holds about one project, in the same workbook. Edit it in Excel and upload it back as a new project, or keep it as a point-in-time record.':
    'كل ما تحتفظ به المنصة عن مشروع واحد، في المصنّف نفسه. عدّله في إكسل وأعد تحميله كمشروع جديد، أو احتفظ به كسجل لحظي.',
  'Download':
    'تنزيل',
  'Upload a filled workbook':
    'رفع مصنّف مُعبّأ',
  'The whole file loads in one go, or not at all — a workbook that failed halfway would leave a project with a schedule and no gates. Columns are matched by name in either language, so reordering them is fine.':
    'يُحمَّل الملف كاملًا دفعة واحدة أو لا يُحمَّل — فمصنّف يفشل في منتصفه يترك مشروعًا بجدول دون بوابات. تُطابَق الأعمدة بالاسم بأي من اللغتين، فإعادة ترتيبها لا تضر.',
  'Load it':
    'تحميله',
  'What is in the workbook':
    'ما الذي يحويه المصنّف',
  'Sheet':
    'الورقة',
  'What it holds':
    'ما تحتويه',
  'Required columns':
    'الأعمدة المطلوبة',
  'Why one workbook instead of three':
    'لماذا مصنّف واحد بدل ثلاثة',
  'A separate template, export format and import format drift apart, and a customer discovers it by having a workbook they downloaded rejected when they upload it. Here all three are generated from one definition, so a column added to the platform appears in the blank template, in an export and in the importer at the same moment.':
    'القالب المنفصل وصيغة التصدير وصيغة الاستيراد تتباعد مع الوقت، ويكتشف العميل ذلك حين يُرفض مصنّف نزّله بنفسه عند رفعه. هنا تُولَّد الثلاثة من تعريف واحد، فالعمود المضاف إلى المنصة يظهر في القالب الفارغ وفي التصدير وفي المستورد في اللحظة نفسها.',
  'Imported':
    'تم استيراد',
  'Nothing was imported':
    'لم يتم استيراد أي شيء',
  'Worth knowing':
    'جدير بالملاحظة',
  'Govern it':
    'ابدأ حوكمته',
  'No projects to export yet.':
    'لا توجد مشاريع للتصدير بعد.',
  'projects':
    'مشاريع',
  'portfolios':
    'محافظ',
  'programs':
    'برامج',
  'gates':
    'بوابات',
  'criteria':
    'معايير',
  'schedule':
    'بنود جدول',
  'costs':
    'بنود تكلفة',
  'benefits':
    'منافع',
  'stakeholders':
    'أصحاب مصلحة',

  // ── board pack exports (Word, PowerPoint) ──────────────────────────────
  'Approved budget stands at': 'الميزانية المعتمدة تبلغ',
  'Average progress is': 'متوسط الإنجاز هو',
  'Decisions taken': 'القرارات المتخذة',
  'Gate status': 'حالة البوابات',
  'Cost performance': 'أداء التكلفة',

  /* Stage-gate names. Platform vocabulary held in the database, not customer
     wording — an Arabic gate ladder reading "Concept … Handover" was the most
     visible English left in the product. */
  'Concept': 'التصور', 'Feasibility': 'الجدوى',
  'Design Development': 'تطوير التصميم', 'Detailed Design': 'التصميم التفصيلي',
  'Procurement': 'المشتريات', 'Construction': 'التنفيذ', 'Handover': 'التسليم',
  'open since': 'مفتوحة منذ',
  'Delivery trend': 'اتجاه التنفيذ', 'Portfolio performance': 'أداء المحفظة',
  'Portfolio mix': 'تركيبة المحفظة',
  'Spent to date': 'المصروف حتى تاريخه',
  'Cumulative, by month': 'تراكمي، شهريًا',
  'Not enough history yet to draw a trend.': 'لا يوجد تاريخ كافٍ بعد لرسم اتجاه.',
  'baseline': 'خط الأساس',
  'actual, filled by progress': 'الفعلي، معبَّأ حسب الإنجاز',
  'finishing later than baseline': 'ينتهي متأخرًا عن خط الأساس',
  'on critical path': 'على المسار الحرج',
  '{n} days late': 'متأخر {n} يومًا',
  'Overdue task': 'مهمة متأخرة', 'Unsigned approval': 'موافقة غير موقَّعة',
  'Slipped milestone': 'معلم متأخر', 'Open risk': 'مخاطرة مفتوحة',

  /* Integration and workspace vocabulary that was rendering as raw enum values. */
  'connected': 'متصل', 'error': 'خطأ',
  'inbound': 'وارد', 'outbound': 'صادر', 'bidirectional': 'ثنائي الاتجاه',
  'Anchor tenant': 'المستأجر الأساسي',
  'Board sponsor': 'راعي المجلس', 'Executive committee': 'اللجنة التنفيذية',
   'Gate blocked': 'بوابة محجوبة',
  'on time': 'في الموعد',
  'Finance': 'المالية', 'Contingency': 'احتياطي', 'Design fees': 'أتعاب التصميم',

  /* Create forms — labels, choices, hints and the note above each form. */
  'New benefit': 'منفعة جديدة',            'Add benefit': 'إضافة منفعة',
  'New stakeholder': 'صاحب مصلحة جديد',    'Add stakeholder': 'إضافة صاحب مصلحة',
  'New schedule item': 'بند جدول جديد',    'Add to schedule': 'إضافة إلى الجدول',
  'New cost line': 'بند تكلفة جديد',       'Add cost line': 'إضافة بند تكلفة',
  'New allocation': 'إسناد جديد',          'Allocate': 'إسناد',
  'Register a document': 'تسجيل وثيقة',    'Register': 'تسجيل',
  'Post an update': 'نشر تحديث',           'Post': 'نشر',

  'Review date': 'تاريخ المراجعة',
  'Influence (1–5)': 'التأثير (1–5)', 'Interest (1–5)': 'الاهتمام (1–5)',
  'Phone': 'الهاتف', 'External to the organisation': 'من خارج المنظمة',
  'Kind': 'النوع', 'Start': 'البداية', 'Finish': 'النهاية',
  'Baseline start': 'بداية خط الأساس', 'Baseline finish': 'نهاية خط الأساس',
  'Progress %': 'نسبة الإنجاز %', 'On the critical path': 'على المسار الحرج',
  'Amount': 'المبلغ', 'Currency': 'العملة', 'Period': 'الفترة',
  'Note': 'ملاحظة', 'Allocation %': 'نسبة الإسناد %',
  'From': 'من', 'Version': 'الإصدار',
  'Link': 'الرابط', 'Update': 'التحديث', 'Description': 'الوصف',
  'Due date': 'تاريخ الاستحقاق', 'Start date': 'تاريخ البدء', 'Target finish': 'النهاية المستهدفة',
  'Programme': 'البرنامج', 'Unknown': 'غير معروف',

  'Realised': 'متحققة', 'Missed': 'غير متحققة',
  'Activity': 'نشاط', 'Phase': 'مرحلة', 'Milestone': 'معلم',
  'Commitment': 'التزام', 'Draft': 'مسودة', 'In review': 'قيد المراجعة',
  'Approved': 'معتمدة', 'Superseded': 'ملغاة بأحدث', 'Escalation': 'تصعيد',
  'Issue': 'مشكلة', 'Assumption': 'افتراض', 'Dependency': 'اعتمادية', 'Change': 'تغيير',
  'Active': 'نشط', 'Planning': 'تخطيط', 'On hold': 'متوقف مؤقتًا', 'Closed': 'مغلق',
  'On track': 'على المسار', 'At risk': 'معرَّض للخطر', 'Critical': 'حرج',

  'Where it stands today': 'ما هو عليه اليوم',
  'Leave blank until measured': 'اتركه فارغًا حتى يُقاس',
  '5 = can stop the project': '5 = قادر على إيقاف المشروع',
  '5 = follows it closely': '5 = يتابعه عن كثب',
  '5 = severe': '5 = شديد', '5 = almost certain': '5 = شبه مؤكد',
  'Defaults to the start date': 'يأخذ تاريخ البداية افتراضيًا',
  'Defaults to the finish date': 'يأخذ تاريخ النهاية افتراضيًا',
  'The month this belongs to': 'الشهر الذي يخصّه',
  'Three letters': 'ثلاثة أحرف', '1–100': '1–100',

  'A benefit is the value the project promised. Recording the measure and its baseline now is what makes it checkable after handover.':
    'المنفعة هي القيمة التي وعد بها المشروع. تسجيل المقياس وخط الأساس الآن هو ما يجعلها قابلة للتحقق بعد التسليم.',
  'Influence and interest place someone on the engagement grid, so both are worth setting even when they are a guess.':
    'التأثير والاهتمام يحددان موقع الشخص في مصفوفة الإشراك، لذا يستحق ضبطهما حتى لو كانا تقديريين.',
  'Leave the baseline blank and it is set from the planned dates. Slippage is measured against the baseline, so an item without one can never show as late.':
    'اترك خط الأساس فارغًا ليُؤخذ من التواريخ المخططة. يُقاس التأخر مقابل خط الأساس، فالبند بلا خط أساس لا يظهر متأخرًا أبدًا.',
  'Budget, commitment, actual and forecast are separate lines against the same project. Keeping them apart is what makes variance and CPI mean anything.':
    'الميزانية والالتزام والفعلي والتوقّع بنود منفصلة على المشروع نفسه. الفصل بينها هو ما يجعل الانحراف ومؤشر أداء التكلفة ذا معنى.',
  'Allocating the same person past 100% across projects is what over-commitment looks like before anyone feels it.':
    'إسناد الشخص نفسه بما يتجاوز 100% عبر المشاريع هو شكل الإفراط في الالتزام قبل أن يشعر به أحد.',
  'A link, not an upload. The file stays in the document system you already run, where your retention and access rules live; this records where it is and what state it is in.':
    'رابط لا رفع ملف. يبقى الملف في نظام الوثائق لديك، حيث قواعد الحفظ والوصول؛ وهنا يُسجَّل موضعه وحالته فقط.',
  'An escalation is the one that gets read first. Leave the project blank for something that applies to the whole portfolio.':
    'التصعيد هو ما يُقرأ أولًا. اترك المشروع فارغًا لما ينطبق على المحفظة كلها.',
  'This workspace has no projects yet, so there is nothing to report on.':
    'لا توجد مشاريع في مساحة العمل هذه بعد، فلا شيء يمكن التقرير عنه.',
  'No budget has been approved yet.': 'لم تُعتمد أي ميزانية بعد.',
  'No active stage gates.': 'لا توجد بوابات مرحلية نشطة.',
  'No costs recorded.': 'لا توجد تكاليف مسجَّلة.',
  'You were signed out after a period of inactivity. Please sign in again.':
    'تم تسجيل خروجك بعد فترة من عدم النشاط. يُرجى تسجيل الدخول مرة أخرى.',
  'Download PDF': 'تنزيل PDF',
  'How the PDF is made': 'كيف يُنشأ ملف PDF',
  'The pack exactly as it appears on screen, fixed to the page. Arabic is joined and bidirectional lines are ordered correctly, so the Arabic pack reads as an Arabic document rather than a translated one.':
    'الحزمة كما تظهر على الشاشة تمامًا، مثبَّتة على الصفحة. تُوصل الحروف العربية وتُرتَّب الأسطر ثنائية الاتجاه ترتيبًا صحيحًا، فتُقرأ الحزمة العربية كوثيقة عربية لا كوثيقة مترجمة.',

  /*
   * Whole sentences for the board pack. The slots are named, not positional,
   * so Arabic can put the count after the noun where English puts it before.
   */
  'The portfolio holds {total} projects: {onTrack} on track, {atRisk} at risk and {critical} critical. Average delivery progress is {progress}.':
    'تضم المحفظة {total} مشاريع: {onTrack} على المسار، و{atRisk} معرَّضة للخطر، و{critical} حرجة. متوسط تقدُّم التنفيذ {progress}.',
  'Of {active} active stage gates, {blocked} is blocked, which holds the associated funding.':
    'من بين {active} بوابات مرحلية نشطة، هناك {blocked} بوابة محجوبة، ممّا يوقف التمويل المرتبط بها.',
  'Of {active} active stage gates, {blocked} are blocked, which holds the associated funding.':
    'من بين {active} بوابات مرحلية نشطة، هناك {blocked} بوابات محجوبة، ممّا يوقف التمويل المرتبط بها.',
  'Approved budget stands at {budget} SAR with {actual} drawn ({drawn}).':
    'تبلغ الميزانية المعتمدة {budget} ريال سعودي، مع صرف {actual} ({drawn}).',
  '{code} — {name} is {health} at {gate}.':
    '{code} — {name} في حالة {health} عند {gate}.',
  'The blocker is: {reason}.': 'سبب الحجب: {reason}.',
  'generated {date}': 'أُنشئ في {date}',
  'Of': 'من أصل',
  'Position': 'الموقف',
  'Requires a board decision': 'يتطلب قرارًا من المجلس',
  'The blocker is': 'العائق هو',
  'Which projects are stuck, at which gate, and why': 'أي المشاريع متوقفة، وعند أي بوابة، ولماذا',
  'across all projects': 'عبر كل المشاريع',
  'active stage gates': 'بوابة مراحل نشطة',
  'are blocked, which holds the associated funding': 'محجوبة، ما يوقف التمويل المرتبط بها',
  'at': 'عند',
  'drawn': 'مصروفة',
  'generated': 'أُنشئت في',
  'is': 'هو',
  'with': 'منها',

  // ── reports and exports page ───────────────────────────────────────────
  'Take the board pack away':
    'خذ حزمة المجلس معك',
  'Word':
    'وورد',
  'PowerPoint':
    'باوربوينت',
  'PDF':
    'PDF',
  'The full pack — position, gate status, decisions required, decisions taken and benefits. Editable, so a board secretary can add their own commentary before circulating it.':
    'الحزمة الكاملة — الموقف وحالة البوابات والقرارات المطلوبة والقرارات المتخذة والمنافع. قابلة للتحرير، ليضيف أمين المجلس تعليقه قبل التعميم.',
  'Download Word':
    'تنزيل وورد',
  'Four slides for the meeting itself: cover, position, gate status and the decisions the board has to make. Few slides, large numbers.':
    'أربع شرائح للاجتماع نفسه: الغلاف والموقف وحالة البوابات والقرارات المطلوبة من المجلس. شرائح قليلة وأرقام كبيرة.',
  'Download PowerPoint':
    'تنزيل باوربوينت',
  'Open the live pack and print it. The browser shapes Arabic correctly, which server-side PDF libraries do not — so this route gives a better document than we could generate, in either language.':
    'افتح الحزمة الحيّة واطبعها. المتصفح يشكّل العربية بشكل صحيح، وهو ما لا تفعله مكتبات PDF على الخادم — فهذا المسار يعطي مستندًا أفضل مما يمكننا توليده، بأي من اللغتين.',
  'Why Word and PowerPoint are generated but PDF is printed':
    'لماذا يُولَّد وورد وباوربوينت بينما يُطبع PDF',
  'Word and PowerPoint carry the text and leave the shaping to the application that opens them, so Arabic comes out right without this server carrying a text-shaping engine. A PDF has no such luxury: the glyphs and their order are fixed at the moment it is written, and the PDF libraries available to a Node service do not join Arabic letters or reorder a bidirectional line. Your browser does both, correctly, every time you print. Generating PDFs here would mean shipping a headless browser — worth doing when packs need to arrive by email on a schedule, which is the next step rather than this one.':
    'وورد وباوربوينت يحملان النص ويتركان التشكيل للتطبيق الذي يفتحهما، فتخرج العربية صحيحة دون أن يحمل هذا الخادم محرك تشكيل نصوص. أما PDF فلا يملك هذه الرفاهية: تُثبَّت الحروف وترتيبها لحظة كتابته، ومكتبات PDF المتاحة لخدمة Node لا توصل الحروف العربية ولا تعيد ترتيب السطر ثنائي الاتجاه. متصفحك يفعل الأمرين بشكل صحيح في كل مرة تطبع فيها. توليد PDF هنا يعني شحن متصفح بلا واجهة — وهو أمر يستحق حين تحتاج الحزم أن تصل بالبريد وفق جدول، وتلك هي الخطوة التالية لا هذه.',
  'on demand':
    'عند الطلب',
  'never':
    'لم يحدث',
  'No report definitions yet.':
    'لا توجد تعريفات تقارير بعد.',

  // ── notification templates ─────────────────────────────────────────────
  'Hello':
    'مرحبًا',
  'gate blocked':
    'بوابة محجوبة',
  'The gate':
    'البوابة',
  'cannot be passed, so the funding it releases is on hold':
    'لا يمكن تجاوزها، لذا فالتمويل الذي تُفرج عنه معلّق',
  'What is holding it':
    'ما الذي يعيقها',
  'You are named as accountable for this gate':
    'أنت المسمّى مسؤولًا عن هذه البوابة',
  'Signature needed':
    'مطلوب توقيع',
  'You are the approver on':
    'أنت المعتمِد على',
  'for':
    'لـ',
  'The checklist is complete and nothing is blocking, so it is ready for your signature now.':
    'قائمة التحقق مكتملة ولا شيء يحجب، فهي جاهزة لتوقيعك الآن.',
  'It is not signable yet — the checklist or an open register item still has to be cleared first. You will not be asked again when that changes; check the gate when you are ready.':
    'لا يمكن توقيعها بعد — يجب أولًا استكمال قائمة التحقق أو إغلاق بند سجل مفتوح. لن نراسلك مجددًا عند تغيّر ذلك؛ راجع البوابة حين تكون جاهزًا.',
  'Overdue':
    'متأخر',
  'This task was due on':
    'كان موعد هذه المهمة في',
  'and is still open':
    'ولا تزال مفتوحة',
  'It is holding a stage gate, so it is not only late — it is stopping the project moving.':
    'إنها تحجب بوابة مرحلة، فهي ليست متأخرة فحسب — بل توقف تقدّم المشروع.',
  'gate passed':
    'تم تجاوز البوابة',
  'has been passed':
    'تم تجاوزها',
  'The next gate is now open':
    'البوابة التالية مفتوحة الآن',
  'Its checklist has been created and an accountable owner assigned.':
    'أُنشئت قائمة التحقق الخاصة بها وأُسند مالك مسؤول.',
  'That was the final gate — this project is complete.':
    'كانت تلك البوابة الأخيرة — هذا المشروع مكتمل.',
  'The board pack for':
    'حزمة المجلس عن',
  'is ready':
    'جاهزة',
  'of budget drawn':
    'من الميزانية مصروفة',
  'gates blocked':
    'بوابات محجوبة',
  'Open it, or download it as Word or PowerPoint, here':
    'افتحها، أو نزّلها بصيغة وورد أو باوربوينت، من هنا',
  'You are receiving this because a notification rule in this workspace names your role. An administrator can change the rules under Automations.':
    'تصلك هذه الرسالة لأن قاعدة تنبيه في مساحة العمل هذه تذكر دورك. يمكن للمسؤول تغيير القواعد من قسم الأتمتة.',

  // ── notifications page ─────────────────────────────────────────────────
  'Notifications':
    'التنبيهات',
  'What the platform has decided someone needs to be told, and whether it reached them. Every message is recorded before it is sent, so nothing is lost when mail is not configured.':
    'ما قرّرت المنصة أن أحدهم يجب أن يعرفه، وهل وصله. كل رسالة تُسجَّل قبل إرسالها، فلا يضيع شيء حين لا يكون البريد مُهيّأً.',
  'Mail is being delivered':
    'البريد يُسلَّم',
  'Nothing is being sent yet':
    'لا يُرسَل شيء بعد',
  'Run the rules now':
    'شغّل القواعد الآن',
  'Rules run.':
    'تم تشغيل القواعد.',
  'queued':
    'في الانتظار',
  'sent':
    'أُرسلت',
  'failed':
    'فشلت',
  'suppressed':
    'محجوبة',
  'written, waiting to go':
    'مكتوبة وتنتظر الإرسال',
  'accepted by the mail provider':
    'قبلها مزوّد البريد',
  'rejected — the reason is on the row':
    'مرفوضة — السبب في الصف',
  'held back deliberately':
    'محجوبة عمدًا',
  'The outbox':
    'صندوق الصادر',
  'Nothing to send':
    'لا شيء للإرسال',
  'No rule has matched yet. Rules live under Platform Studio — a gate that cannot pass, a signature outstanding or an overdue task will each put a message here.':
    'لم تتطابق أي قاعدة بعد. القواعد في استوديو المنصة — بوابة لا يمكن تجاوزها أو توقيع معلّق أو مهمة متأخرة، كل منها يضع رسالة هنا.',
  'To':
    'إلى',
  'Subject':
    'الموضوع',
  'Why the same blocked gate does not email you every hour':
    'لماذا لا تراسلك البوابة المحجوبة نفسها كل ساعة',
  'These rules describe conditions, not events: a gate blocked on Monday is still blocked on Tuesday, so a rule that simply fired whenever it found one would send the same message forever. Each message carries a key built from what is actually wrong, and the database refuses a second message under the same key — so you are told once, and told again only when the situation genuinely changes. Clear one of three blockers and you get a fresh message naming the two that remain.':
    'هذه القواعد تصف حالات لا أحداثًا: البوابة المحجوبة يوم الاثنين تظل محجوبة يوم الثلاثاء، فقاعدة تُطلق كلما وجدت واحدة سترسل الرسالة نفسها إلى الأبد. كل رسالة تحمل مفتاحًا مبنيًا على ما هو خاطئ فعلًا، وقاعدة البيانات ترفض رسالة ثانية بالمفتاح نفسه — فتُخبَر مرة واحدة، ولا تُخبَر ثانية إلا حين تتغير الحالة فعلًا. أغلق أحد ثلاثة عوائق وستصلك رسالة جديدة تسمّي الاثنين المتبقيين.',

  // ── charts and drill-down ──────────────────────────────────────────────
  'Spend against plan':
    'الإنفاق مقابل الخطة',
  'Cumulative, month by month. Two straight lines mean nothing is being learned; the gap between them is the story.':
    'تراكمي، شهرًا بشهر. خطّان مستقيمان يعنيان أن لا شيء يُتعلَّم؛ الفجوة بينهما هي القصة.',
  'Planned':
    'المخطط',
  'Spend per month':
    'الإنفاق الشهري',
  'Not cumulative — the rate, so a slowdown shows as a short bar rather than a flattening line.':
    'غير تراكمي — المعدّل، فيظهر التباطؤ كعمود قصير بدل خط يستوي.',
  'Gates passed per month':
    'البوابات المتجاوَزة شهريًا',
  'Delivery velocity. A portfolio that stops passing gates has stopped moving, whatever the progress bars say.':
    'سرعة التنفيذ. المحفظة التي تتوقف عن تجاوز البوابات توقفت عن التقدّم، مهما قالت أشرطة الإنجاز.',
  'No gate has been passed yet, so there is no velocity to plot.':
    'لم تُتجاوَز أي بوابة بعد، فلا توجد سرعة لرسمها.',
  'Portfolio over time':
    'المحفظة عبر الزمن',
  'Nothing has been recorded yet. The platform photographs each workspace once a night, so this chart fills in from tomorrow — history cannot be invented backwards, because nothing in the live data remembers what yesterday looked like.':
    'لم يُسجَّل شيء بعد. تلتقط المنصة صورة لكل مساحة عمل مرة كل ليلة، فيبدأ هذا الرسم بالامتلاء من الغد — ولا يمكن اختلاق تاريخ إلى الوراء، لأن لا شيء في البيانات الحيّة يتذكر شكل الأمس.',
  'Recording since':
    'التسجيل منذ',
  'day(s) so far. A trend needs about a week before it means anything.':
    'يومًا حتى الآن. يحتاج الاتجاه نحو أسبوع قبل أن يعني شيئًا.',
  'Each band is a link — click one to see exactly which projects it counts.':
    'كل شريط رابط — اضغط عليه لترى بالضبط أي المشاريع يعدّها.',
  'Showing only':
    'عرض فقط',
  'Show all':
    'عرض الكل',

  // ── ask x ──────────────────────────────────────────────────────────────
  'Ask X':
    'اسأل X',
  'A question answered from this workspace’s own records — and only from those. Every figure it gives you traces to a row you can open.':
    'سؤال يُجاب من سجلات مساحة العمل هذه وحدها. كل رقم تحصل عليه يعود إلى صف يمكنك فتحه.',
  'Ask about this portfolio':
    'اسأل عن هذه المحفظة',
  'It reads the same records the screens do — every project, gate, register item, approval, benefit and slipped schedule item in this workspace. It has no access to anything else, and it will tell you when a question cannot be answered from them rather than guessing.':
    'يقرأ السجلات نفسها التي تقرأها الشاشات — كل مشروع وبوابة وبند سجل وموافقة ومنفعة وبند جدول منزلق في مساحة العمل هذه. لا وصول له إلى أي شيء آخر، وسيخبرك حين لا يمكن الإجابة من هذه السجلات بدل أن يخمّن.',
  'Which projects are at risk of missing their next gate, and why?':
    'أي المشاريع معرّضة لتفويت بوابتها التالية، ولماذا؟',
  'Where are approvals stuck, and who is Accountable?':
    'أين تعلق الموافقات، ومن المسؤول؟',
  'Summarise portfolio health for the board.':
    'لخّص صحة المحفظة لمجلس الإدارة.',
  'Which register items are holding up the most money?':
    'أي بنود السجل تحجز أكبر قدر من المال؟',
  'What has slipped furthest against its baseline?':
    'ما الذي انزلق أكثر من غيره عن خط أساسه؟',
  'Ask anything about this portfolio…':
    'اسأل أي شيء عن هذه المحفظة…',
  'Ask':
    'اسأل',
  'Start a new conversation':
    'ابدأ محادثة جديدة',
  'Recent':
    'الأخيرة',
  'Nothing asked yet.':
    'لم يُسأل شيء بعد.',
  'How it is kept honest':
    'كيف يظل صادقًا',
  'The assistant is given this workspace’s records as facts and instructed to use nothing else — no general knowledge, no estimates, no filling in gaps. It is told to name the specific project, gate or register item behind every claim, and to say plainly when the records do not answer the question. That last rule matters most: a governance assistant that guesses produces a number somebody repeats to a board, and the whole point of this platform is that a figure can be traced to a record.':
    'يُعطى المساعد سجلات مساحة العمل هذه كحقائق ويُؤمر بألا يستخدم سواها — لا معرفة عامة ولا تقديرات ولا سدّ للفجوات. ويُطلب منه تسمية المشروع أو البوابة أو بند السجل وراء كل ادعاء، وأن يقول بوضوح حين لا تجيب السجلات عن السؤال. هذه القاعدة الأخيرة هي الأهم: مساعد حوكمة يخمّن ينتج رقمًا يكرّره أحدهم أمام مجلس إدارة، وجوهر هذه المنصة أن كل رقم يمكن تتبّعه إلى سجل.',
  'Questions and answers are stored, along with a summary of the facts the answer was based on, so an answer someone acted on can be checked afterwards rather than remembered.':
    'تُحفظ الأسئلة والأجوبة مع ملخّص للحقائق التي بُني عليها الجواب، ليتسنى التحقق لاحقًا من جواب تصرّف أحدهم بناءً عليه بدل الاعتماد على الذاكرة.',

  // ── ask widget ─────────────────────────────────────────────────────────
  'Ask about anything in this workspace. Answers come from its records only — and it will say so when a question cannot be answered from them.':
    'اسأل عن أي شيء في مساحة العمل هذه. تأتي الإجابات من سجلاتها وحدها — وسيقول لك حين لا يمكن الإجابة منها.',
  'Which projects are at risk of missing their next gate?':
    'أي المشاريع معرّضة لتفويت بوابتها التالية؟',
  'Reading this workspace…':
    'يقرأ مساحة العمل…',
  'Grounded in this workspace only':
    'مستند إلى مساحة العمل هذه فقط',
  'Open full transcript':
    'افتح النص الكامل',
  'New':
    'جديد',

  // ── import & export ────────────────────────────────────────────────────
  'Import & Export':
    'الاستيراد والتصدير',
  'Move a whole project in or out as a single spreadsheet. The blank template, an export and an upload are all the same workbook, so anything you download can be edited and sent straight back.':
    'انقل مشروعًا كاملًا داخلًا أو خارجًا كجدول بيانات واحد. القالب الفارغ والتصدير والرفع كلها المصنّف نفسه، فأي ملف تنزّله يمكن تعديله وإعادته مباشرة.',
  'Blank template':
    'قالب فارغ',
  'Every section of a project in one file, with the seven stage gates and their standard checklist already written — so a project loaded from it can be governed the moment it lands.':
    'كل أقسام المشروع في ملف واحد، مع بوابات المراحل السبع وقائمة التحقق المعيارية مكتوبة مسبقًا — فيصبح المشروع المحمَّل منه قابلًا للحوكمة فور وصوله.',
  'Arabic':
    'العربية',
  'Everything held about one project, in that same workbook. Edit it and send it back as a new project, or keep it as a record of how things stood today.':
    'كل ما هو محفوظ عن مشروع واحد، في المصنّف نفسه. عدّله وأعده كمشروع جديد، أو احتفظ به كسجل لحال الأمور اليوم.',
  'Upload a workbook':
    'رفع مصنّف',
  'The whole file loads at once or not at all, so a failure part-way cannot leave a project with a schedule and no gates. Columns are matched by name in either language.':
    'يُحمَّل الملف كاملًا دفعة واحدة أو لا يُحمَّل، فالفشل في المنتصف لا يمكن أن يترك مشروعًا بجدول دون بوابات. تُطابَق الأعمدة بالاسم بأي من اللغتين.',
  'Import':
    'استيراد',
  'Add':
    'إضافة',
};

export type T = (s: string) => string;

/** A translate function for this request. Unknown strings come back as English. */
export function translator(lang: Lang): T {
  if (lang === 'en') return (s) => s;
  return (s) => AR[s] ?? s;
}

/**
 * Enum values arrive from the API as `at_risk`, `in_progress` and so on.
 * Render them as words, then translate — so one entry covers both languages.
 */
export function term(t: T, value: string | null | undefined): string {
  if (!value) return '';
  return t(value.replace(/_/g, ' '));
}

/**
 * Translate a whole sentence, then put the numbers back in.
 *
 * The board pack used to be built by translating fragments — "The portfolio
 * holds" + a count + "on track, " + a count — and concatenating them around
 * live values. That cannot work in Arabic, where the verb, the subject and
 * the count do not fall in the English order, and it is what produced a pack
 * that was half Arabic and half English in the middle of one sentence.
 *
 * So a sentence is one entry with named slots, and a translator is free to
 * move the slots wherever the language needs them.
 */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, k) =>
    k in vars ? String(vars[k]) : whole);
}

/**
 * The same, but keeping the slots as separate pieces so a caller can render
 * each one differently — the web pack puts every figure in bold. Returns the
 * literal text and the slot values interleaved, in the order the *translated*
 * sentence puts them, which is the whole point.
 */
export function parts(template: string, vars: Record<string, string | number>):
    { text: string; slot: boolean }[] {
  const out: { text: string; slot: boolean }[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    if (m.index! > last) out.push({ text: template.slice(last, m.index), slot: false });
    const k = m[1];
    out.push({ text: k in vars ? String(vars[k]) : m[0], slot: k in vars });
    last = m.index! + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last), slot: false });
  return out;
}
