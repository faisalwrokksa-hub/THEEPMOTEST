-- `planned` became `roadmap`: a module not yet offered for licensing is hidden
-- from the product entirely rather than advertised as unavailable.
--
-- ADD VALUE cannot run inside a transaction that then uses the new value, so
-- this file must be applied on its own (the bootstrap script runs each
-- migration as a separate psql invocation, which satisfies that).
ALTER TYPE "public"."module_status" ADD VALUE IF NOT EXISTS 'roadmap';
