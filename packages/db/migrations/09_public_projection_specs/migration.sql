-- Keep the rebuildable robot projection in sync with Prisma's public model.
-- Existing deployments may predate these three denormalized catalog fields.
ALTER TABLE robot_public_projections
  ADD COLUMN IF NOT EXISTS payload_kg numeric(10, 2),
  ADD COLUMN IF NOT EXISTS reach_mm numeric(10, 2),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10, 2);
