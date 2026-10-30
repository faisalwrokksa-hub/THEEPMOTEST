/**
 * A07 planning-only export. The deployment contract is server authoritative;
 * this draft cannot activate an environment or assert compliance.
 */
export const DEPLOYMENT_PROFILES = Object.freeze(['shared', 'dedicated']);
export const DATA_CLASSES = Object.freeze(['undetermined', 'public', 'internal', 'confidential', 'restricted']);
export const ORGANIZATION_TYPES = Object.freeze(['private', 'government', 'nonprofit']);

export function makeDeploymentDraft(input) {
  if (!input || typeof input !== 'object') throw new Error('Missing deployment details');
  if (typeof input.workspace !== 'string' || !/^[a-z0-9-]{1,64}$/.test(input.workspace)) {
    throw new Error('Invalid workspace identifier');
  }
  if (!DEPLOYMENT_PROFILES.includes(input.profile)) throw new Error('Invalid deployment profile');
  if (!DATA_CLASSES.includes(input.classification)) throw new Error('Invalid data classification');
  if (!ORGANIZATION_TYPES.includes(input.organizationType)) throw new Error('Invalid organization type');
  if (typeof input.privateIngress !== 'boolean') throw new Error('Invalid network preference');
  if (input.profile === 'shared' && input.privateIngress) throw new Error('Private ingress requires dedicated deployment');
  return Object.freeze({
    schemaVersion: 1,
    documentType: 'theepmo-deployment-planning-draft',
    state: 'local_draft_not_submitted',
    workspace: input.workspace,
    requestedProfile: input.profile,
    organizationType: input.organizationType,
    requestedResidency: 'SA',
    classificationForReview: input.classification,
    requestedIngress: input.profile === 'dedicated' && input.privateIngress ? 'private' : 'standard_review_required',
    requiresProviderEligibilityReview: true,
    requiresSecurityAndClassificationReview: true,
    requiresContractAndOperationsApproval: true,
    provisioned: false,
    complianceApproved: false,
    note: 'Local planning export only. Not submitted, approved, provisioned or evidence of Saudi data residency.',
  });
}
