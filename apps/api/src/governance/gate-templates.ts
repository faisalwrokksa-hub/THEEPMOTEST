/**
 * Default entry criteria per gate.
 *
 * A gate with no criteria can never pass — correctly, since nothing has been
 * proven — so a gate must arrive with a checklist. These are instantiated when
 * a gate opens, and a tenant can override them per project type in Platform
 * Studio (gate_templates.definition.criteriaByGate).
 */
export const DEFAULT_CRITERIA: Record<string, string[]> = {
  Concept: [
    'Business case drafted',
    'Outline budget approved',
    'Sponsor identified',
  ],
  Feasibility: [
    'Feasibility study completed',
    'Site and planning constraints assessed',
    'Funding route confirmed',
  ],
  'Design Development': [
    'Concept design signed off',
    'Cost plan updated',
    'Key consultants appointed',
  ],
  'Detailed Design': [
    'Detailed drawings issued',
    'Statutory approvals obtained',
    'Construction cost re-baselined',
  ],
  Procurement: [
    'Tender documents package issued',
    'Bid evaluation report signed',
    'Main contractor selected',
    'Contract award approved by board',
    'Insurance and bonds in place',
  ],
  Construction: [
    'Site mobilisation complete',
    'Health and safety plan in force',
    'Monthly progress and cost reporting established',
    'Snagging process agreed',
  ],
  Handover: [
    'Practical completion certificate issued',
    'As-built documentation delivered',
    'Operations and maintenance handover accepted',
    'Final account settled',
  ],
};

export function criteriaFor(gateName: string, template?: unknown): string[] {
  const fromTemplate = (template as any)?.criteriaByGate?.[gateName];
  if (Array.isArray(fromTemplate) && fromTemplate.length) return fromTemplate;
  return DEFAULT_CRITERIA[gateName] ?? [
    'Deliverables for this phase accepted',
    'Costs and schedule re-forecast',
    'Risks reviewed and mitigated',
  ];
}
