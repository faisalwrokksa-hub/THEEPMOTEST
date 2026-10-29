/** Only allow known internal destinations for first-run create actions. */
export type GuidedTask = 'workspace' | 'team' | 'portfolio' | 'program' | 'project';

export function onboardingActionHref(key: GuidedTask): string {
  switch (key) {
    case 'workspace':
    case 'team': return '/settings';
    case 'portfolio': return '/portfolios?new=portfolio';
    case 'program': return '/portfolios?new=program';
    case 'project': return '/projects?new=project';
  }
}

export function onboardingActionLicensed(key: GuidedTask, enabledModules: readonly string[]): boolean {
  return key === 'workspace' || key === 'team' || enabledModules.includes('pmo360');
}
