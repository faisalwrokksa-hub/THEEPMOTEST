/**
 * The first-run checklist is derived from actual tenant records, never from
 * browser-local completion toggles. Keep this pure so it can be regression-tested.
 */
export type OnboardingCounts = {
  members: number;
  portfolios: number;
  programs: number;
  projects: number;
};

export type OnboardingTaskKey = 'workspace' | 'team' | 'portfolio' | 'program' | 'project';
export type OnboardingNextStep = Exclude<OnboardingTaskKey, 'workspace'> | null;

export type OnboardingTask = {
  key: OnboardingTaskKey;
  completed: boolean;
  href: '/settings' | '/portfolios' | '/projects';
  capability: 'read' | 'pmoa_manage_people' | 'pmoa_manage_projects';
};

function safeCount(value: unknown): number {
  // Database count(*) can be returned as a string by some PostgreSQL drivers.
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export function computeOnboardingProgress(input: Partial<Record<keyof OnboardingCounts, unknown>>) {
  const counts: OnboardingCounts = {
    members: safeCount(input.members),
    portfolios: safeCount(input.portfolios),
    programs: safeCount(input.programs),
    projects: safeCount(input.projects),
  };
  const tasks: OnboardingTask[] = [
    { key: 'workspace', completed: true, href: '/settings', capability: 'read' },
    { key: 'team', completed: counts.members >= 2, href: '/settings', capability: 'pmoa_manage_people' },
    { key: 'portfolio', completed: counts.portfolios >= 1, href: '/portfolios', capability: 'pmoa_manage_projects' },
    { key: 'program', completed: counts.programs >= 1, href: '/portfolios', capability: 'pmoa_manage_projects' },
    { key: 'project', completed: counts.projects >= 1, href: '/projects', capability: 'pmoa_manage_projects' },
  ];
  const completed = tasks.filter(task => task.completed).length;
  // First-run sequence prioritises a governed project structure before the
  // optional second team member. Never infer completion from browser state.
  const nextStep: OnboardingNextStep =
    (['portfolio', 'program', 'project', 'team'] as const)
      .find(key => tasks.some(task => task.key === key && !task.completed)) ?? null;
  return { counts, tasks, completed, total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100), nextStep };

}
