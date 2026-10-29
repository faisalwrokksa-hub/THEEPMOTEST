-- The twelve roles PMOAlign already uses, so a customer moving from the
-- WordPress product keeps the vocabulary they were trained on.
--
-- Existing values stay: `admin` is the vendor-side administrator, `pmo_lead`
-- is PMO Manager, `project_manager` and `viewer` keep their names. The rest
-- are added rather than renamed, because a role name is written on every
-- membership row and renaming one rewrites history.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, which is why
-- each is its own statement and why this file must not be wrapped in BEGIN.
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'client_admin';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'portfolio_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'program_manager';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'team_member';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'executive_viewer';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'governance_risk';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'finance_benefits';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'external_professional';
ALTER TYPE member_role ADD VALUE IF NOT EXISTS 'restricted_viewer';
