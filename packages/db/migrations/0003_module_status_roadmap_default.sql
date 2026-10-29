-- Second file, because the value added in 0002 is only usable once that
-- statement has committed.
ALTER TABLE "modules" ALTER COLUMN "status" SET DEFAULT 'roadmap';
UPDATE "modules" SET "status" = 'roadmap' WHERE "status" = 'planned';
