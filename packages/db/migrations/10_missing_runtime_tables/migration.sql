-- Tables that are referenced by the Prisma schema and application runtime,
-- but were absent from the original numbered migration history.

CREATE TABLE IF NOT EXISTS ai_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope varchar(30) DEFAULT 'SIMPLE_DEFAULT',
  model_id uuid NOT NULL,
  rank integer DEFAULT 0,
  enabled boolean DEFAULT true,
  max_attempts integer DEFAULT 3,
  timeout_ms integer DEFAULT 60000,
  cooldown_ms integer DEFAULT 60000,
  created_at timestamptz(6) DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(30),
  entity_id uuid,
  normalized_alias varchar(255),
  alias varchar(255),
  created_at timestamptz(6) DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_normalized_alias
  ON entity_aliases (normalized_alias);

CREATE TABLE IF NOT EXISTS field_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(30),
  entity_id uuid,
  field_key varchar(100),
  normalized_value_json jsonb,
  raw_value_json jsonb,
  source_id uuid,
  observed_at timestamptz(6),
  evidence_confidence numeric(4, 2) DEFAULT 0.65,
  assertion_status varchar(20) DEFAULT 'ACCEPTED'
);

CREATE TABLE IF NOT EXISTS robot_company_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_entity_id uuid,
  company_entity_id uuid,
  relation varchar(30),
  evidence_url varchar(1000),
  created_at timestamptz(6) DEFAULT now(),
  CONSTRAINT uq_robot_company_relation UNIQUE (robot_entity_id, company_entity_id, relation)
);
