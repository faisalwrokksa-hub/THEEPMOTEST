-- Platform administration is not a tenant role.
--
-- Module entitlements are the commercial control: which modules a customer has
-- paid for. They were guarded by `pmoa_admin`, which every workspace owner
-- holds — so a customer's own owner could switch on any module, including ones
-- they had not bought. The guard was real and simply pointed at the wrong
-- person.
--
-- Platform administration therefore belongs to the person, not to their
-- membership in a workspace: it is the vendor operating the platform, and it
-- does not vary by which customer they happen to be looking at.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_platform_admin IS
  'Vendor staff who may change module entitlements. Never granted to a customer.';
