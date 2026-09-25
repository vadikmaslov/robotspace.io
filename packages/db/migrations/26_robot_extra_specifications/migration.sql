-- Extensible factual specifications from authorised catalog detail pages.
-- Prisma is intentionally not regenerated on this project, so runtime access
-- to this column uses parameterised raw SQL until the next client refresh.
ALTER TABLE robot_public_projections
  ADD COLUMN IF NOT EXISTS extra_specs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_robot_public_extra_specs ON robot_public_projections USING gin (extra_specs);

UPDATE scheduled_agents
SET description = 'Collects source URLs and transiently parses factual robot detail pages. Aparobot is applied first, Humanoid Guide second, RobotLAB third; later sources only fill missing parameters, short source-based descriptions, and named technical specifications. Exact Unibot matches provide only brand and image. Every applied page is kept as an admin-only source link.',
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';

UPDATE source_contracts
SET allowed_fields = '["name","canonical_url","manufacturer_name","payload_kg","reach_mm","weight_kg","summary","extra_specs"]'::jsonb,
    parser_version = 'catalog-detail-v3',
    schema_version = '3',
    updated_at = now()
WHERE source_key IN ('aparobot-robots', 'humanoid-guide-database', 'robotlab-store');
