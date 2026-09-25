-- Admin-only provenance links.  A link records that an entity was found at a
-- source; it is not a claim that every field on that source is reusable or
-- verified.  Field assertions remain the canonical evidence mechanism.
CREATE TABLE entity_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  source_id varchar(100) NOT NULL REFERENCES sources(key) ON DELETE RESTRICT,
  source_record_id uuid REFERENCES source_records(id) ON DELETE SET NULL,
  canonical_url varchar(2000) NOT NULL,
  external_id varchar(255),
  match_type varchar(50) NOT NULL DEFAULT 'CANDIDATE',
  match_confidence decimal(4,2) NOT NULL DEFAULT 0.50 CHECK (match_confidence >= 0 AND match_confidence <= 1),
  link_status varchar(20) NOT NULL DEFAULT 'DISCOVERED' CHECK (link_status IN ('DISCOVERED','CONFIRMED','REJECTED')),
  observed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz(6) NOT NULL DEFAULT now(),
  last_seen_at timestamptz(6) NOT NULL DEFAULT now(),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_source_link UNIQUE (entity_id, source_id, canonical_url)
);

CREATE INDEX idx_entity_source_links_entity_seen ON entity_source_links(entity_id, last_seen_at DESC);
CREATE INDEX idx_entity_source_links_source_status ON entity_source_links(source_id, link_status);
