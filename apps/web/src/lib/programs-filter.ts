/** Server-side filter. Always scope the selection to authorized portfolio IDs. */
export function selectedPortfolioId(input: unknown, portfolios: readonly { id: string }[]): string | null | undefined {
  if (input === undefined || input === '') return undefined;
  if (typeof input !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input))
    return null;
  return portfolios.some(p => p.id === input) ? input : null;
}

export function programsForPortfolio<T extends { portfolioId: string }>(
  programs: readonly T[], selectedId: string | null | undefined,
): T[] {
  if (selectedId === undefined) return [...programs];
  if (selectedId === null) return [];
  return programs.filter(program => program.portfolioId === selectedId);
}
