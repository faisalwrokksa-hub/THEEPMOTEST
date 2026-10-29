-- Let the application add people to a workspace.
--
-- `users` was read-and-update only, on the reasoning that an application bug
-- must never be able to invent or destroy a person. The first half of that has
-- to give: a platform nobody can be onboarded into is not a platform, and
-- every customer so far has been created by hand in this database.
--
-- The second half stays. DELETE is still revoked, so the worst an application
-- bug can do is create a row somebody has to tidy up, rather than remove a
-- person and orphan every approval they ever signed. Deactivation is an
-- UPDATE, which is how an account is really retired anyway.
GRANT INSERT ON users TO pmo_app;

-- Membership already carried INSERT; UPDATE is what a role change needs, and
-- DELETE is what removing somebody from one workspace needs. Memberships are
-- tenant-scoped and row-level security applies, so this cannot reach across
-- into another customer's workspace.
GRANT INSERT, UPDATE, DELETE ON memberships TO pmo_app;
