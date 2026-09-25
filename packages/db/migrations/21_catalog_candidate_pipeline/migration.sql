CREATE TABLE catalog_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_record_id uuid NOT NULL UNIQUE REFERENCES source_records(id) ON DELETE RESTRICT,
  source_id varchar(100) NOT NULL REFERENCES sources(key) ON DELETE RESTRICT,
  candidate_name varchar(255) NOT NULL,
  normalized_name varchar(255) NOT NULL,
  manufacturer_name varchar(255),
  candidate_url varchar(2000) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','MERGED','REJECTED','NEEDS_REVIEW')),
  decision_reason text,
  robot_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  company_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  confidence decimal(4,2) NOT NULL DEFAULT .50,
  first_seen_at timestamptz(6) NOT NULL DEFAULT now(), last_seen_at timestamptz(6) NOT NULL DEFAULT now(), decided_at timestamptz(6), decided_by varchar(255), created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_candidates_status ON catalog_candidates(status,last_seen_at DESC);
CREATE UNIQUE INDEX uq_catalog_candidate_identity ON catalog_candidates(source_id,normalized_name,candidate_url);
