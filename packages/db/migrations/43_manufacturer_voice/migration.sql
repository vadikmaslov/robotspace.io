CREATE TABLE manufacturer_claim_proofs (
  claim_id uuid PRIMARY KEY REFERENCES entity_claims(id) ON DELETE RESTRICT,
  domain varchar(253) NOT NULL,
  token varchar(100) NOT NULL,
  expires_at timestamptz(6) NOT NULL,
  verified_at timestamptz(6),
  CHECK (domain ~ '^[a-z0-9.-]+$'),
  CHECK (token ~ '^robotspace-claim=[a-f0-9]{48}$')
);

ALTER TABLE registry_notifications DROP CONSTRAINT registry_notifications_kind_check;
ALTER TABLE registry_notifications ADD CONSTRAINT registry_notifications_kind_check
  CHECK (kind IN ('CLAIM_REJECTED','CORRECTION_ACCEPTED','CORRECTION_REJECTED','COMPATIBILITY_ACCEPTED','COMPATIBILITY_REJECTED','MANUFACTURER_CLAIM_VERIFIED','MANUFACTURER_CLAIM_REVOKED'));

CREATE TABLE manufacturer_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_entity_id uuid NOT NULL REFERENCES companies(entity_id) ON DELETE RESTRICT,
  robot_entity_id uuid REFERENCES robots(entity_id) ON DELETE RESTRICT,
  claim_id uuid NOT NULL REFERENCES entity_claims(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  statement_type text NOT NULL CHECK (statement_type IN ('DOCS','SDK','REPOSITORY','RELEASE','SPEC')),
  title varchar(255) NOT NULL CHECK (length(trim(title)) > 0),
  statement_value varchar(1000),
  url varchar(2000) CHECK (url IS NULL OR url ~ '^https://'),
  evidence_url varchar(2000) NOT NULL CHECK (evidence_url ~ '^https://'),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (statement_type <> 'SPEC' OR statement_value IS NOT NULL),
  CHECK (statement_type = 'SPEC' OR url IS NOT NULL)
);
CREATE INDEX manufacturer_statements_company_created ON manufacturer_statements(company_entity_id, created_at DESC);
CREATE INDEX manufacturer_statements_robot_created ON manufacturer_statements(robot_entity_id, created_at DESC);

CREATE FUNCTION manufacturer_statement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Manufacturer statements are append-only'; END IF;
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Manufacturer statements are append-only'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM entity_claims c JOIN entities e ON e.id=c.entity_id
    WHERE c.id=NEW.claim_id AND c.entity_id=NEW.company_entity_id
      AND c.claimant_id=NEW.actor_id AND c.status='VERIFIED' AND e.entity_type='COMPANY'
  ) THEN RAISE EXCEPTION 'A verified company claim is required'; END IF;
  IF NEW.robot_entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM robot_company_relations r
    WHERE r.robot_entity_id=NEW.robot_entity_id
      AND r.company_entity_id=NEW.company_entity_id AND r.relation='MANUFACTURES'
  ) THEN RAISE EXCEPTION 'Robot is not linked to the manufacturer'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manufacturer_statement_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON manufacturer_statements
  FOR EACH ROW EXECUTE FUNCTION manufacturer_statement_guard();

CREATE FUNCTION manufacturer_claim_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_method = 'DNS_TXT_MANUFACTURER' AND NEW.status = 'VERIFIED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM manufacturer_claim_proofs p
      WHERE p.claim_id=NEW.id AND p.verified_at IS NOT NULL AND p.expires_at >= p.verified_at
    ) THEN RAISE EXCEPTION 'Manufacturer claim requires a verified DNS proof'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manufacturer_claim_proof_required
  BEFORE INSERT OR UPDATE ON entity_claims
  FOR EACH ROW EXECUTE FUNCTION manufacturer_claim_guard();
