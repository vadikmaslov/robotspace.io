-- Additive Registry foundation. Existing IDs, URLs, releases and assertions stay intact.
ALTER TABLE entities DROP CONSTRAINT entities_entity_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_entity_type_check
  CHECK (entity_type IN ('ROBOT','ROBOT_VARIANT','COMPANY','PROJECT','DEVELOPER'));

CREATE TABLE registry_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE TABLE registry_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'github'),
  provider_account_id text NOT NULL CHECK (length(provider_account_id) > 0),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account_id),
  UNIQUE(user_id, provider)
);
-- No OAuth tokens in this foundation; credentials require a separate encrypted store.
CREATE TABLE registry_roles (
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('USER','VERIFIED_DEVELOPER','VERIFIED_MANUFACTURER','MODERATOR')),
  PRIMARY KEY(user_id, role)
);
CREATE TABLE developer_profiles (
  user_id uuid PRIMARY KEY REFERENCES registry_users(id) ON DELETE RESTRICT,
  entity_id uuid NOT NULL UNIQUE REFERENCES entities(id) ON DELETE RESTRICT,
  handle varchar(100) NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  display_name varchar(255),
  bio text,
  reputation integer NOT NULL DEFAULT 0 CHECK (reputation >= 0)
);

ALTER TABLE software_packages
  ADD COLUMN entity_id uuid UNIQUE REFERENCES entities(id) ON DELETE RESTRICT,
  ADD COLUMN description text,
  ADD COLUMN project_type text NOT NULL DEFAULT 'tool'
    CHECK (project_type IN ('skill','SDK','driver','navigation','manipulation','perception','voice','dataset','model','simulator','tool','integration')),
  ADD COLUMN origin_status text NOT NULL DEFAULT 'COMMUNITY' CHECK (origin_status IN ('OFFICIAL','COMMUNITY','EXPERIMENTAL')),
  ADD COLUMN verification_status text NOT NULL DEFAULT 'DISCOVERED' CHECK (verification_status IN ('DISCOVERED','SUGGESTED','VERIFIED','REJECTED')),
  ADD COLUMN github_repository_id bigint UNIQUE,
  ADD COLUMN updated_at timestamptz(6) NOT NULL DEFAULT now(),
  ADD CONSTRAINT registry_project_same_id CHECK (entity_id = id);
-- Fail on ID/slug collisions instead of silently associating another entity.
INSERT INTO entities(id, entity_type, slug, publication_status)
  SELECT id, 'PROJECT', 'project-' || id::text, 'DRAFT' FROM software_packages;
UPDATE software_packages SET entity_id = id;
-- Nullable for legacy writers until Registry launches. Repository writes always populate it.
CREATE INDEX registry_project_type ON software_packages(project_type, verification_status);

CREATE TABLE entity_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  claimant_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED','REVOKED')),
  proof_url varchar(2000) NOT NULL CHECK (proof_url ~ '^https://'),
  verification_method varchar(100),
  reviewed_by uuid REFERENCES registry_users(id) ON DELETE RESTRICT,
  checked_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (status <> 'VERIFIED' OR (verification_method IS NOT NULL AND checked_at IS NOT NULL))
);
-- Multiple maintainers are allowed; duplicated active claims from one user are not.
CREATE UNIQUE INDEX registry_claim_active ON entity_claims(entity_id, claimant_id) WHERE status IN ('PENDING','VERIFIED');
CREATE INDEX registry_claim_user ON entity_claims(claimant_id, status);

ALTER TABLE compatibility_claims DROP CONSTRAINT compatibility_claims_claim_status_check;
ALTER TABLE compatibility_claims ADD CONSTRAINT compatibility_claims_claim_status_check
  CHECK (claim_status IN ('CLAIMED','VERIFIED','DEPRECATED','UNKNOWN','DISCOVERED','SUGGESTED','REJECTED'));
ALTER TABLE compatibility_claims
  ADD COLUMN project_id uuid REFERENCES software_packages(id) ON DELETE RESTRICT,
  ADD COLUMN robot_id uuid REFERENCES robots(entity_id) ON DELETE RESTRICT,
  ADD COLUMN requirements jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN supersedes_id uuid REFERENCES compatibility_claims(id) ON DELETE RESTRICT,
  ADD COLUMN created_by uuid REFERENCES registry_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT registry_compat_endpoints CHECK (
    (project_id IS NULL AND robot_id IS NULL) OR
    (project_id IS NOT NULL AND robot_id IS NOT NULL AND
     type = 'SOFTWARE' AND subject_type = 'PROJECT' AND object_type = 'ROBOT' AND
     subject_entity_id = project_id AND object_entity_id = robot_id)),
  ADD CONSTRAINT registry_compat_requirements CHECK (jsonb_typeof(requirements) = 'object'),
  ADD CONSTRAINT registry_compat_no_self CHECK (supersedes_id IS DISTINCT FROM id);
-- Keep unrecognised legacy relations unchanged; no guessed robot matching or status upgrade.
CREATE INDEX registry_compat_pair ON compatibility_claims(project_id, robot_id);
CREATE UNIQUE INDEX registry_compat_version ON compatibility_claims
  (project_id, robot_id, COALESCE(subject_version_range,''), COALESCE(object_version_range,''), revision)
  WHERE project_id IS NOT NULL;

CREATE TABLE registry_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES entities(id) ON DELETE RESTRICT,
  compatibility_id uuid REFERENCES compatibility_claims(id) ON DELETE RESTRICT,
  claim_id uuid REFERENCES entity_claims(id) ON DELETE RESTRICT,
  assertion_id uuid REFERENCES field_assertions(id) ON DELETE RESTRICT,
  source_key varchar(100) REFERENCES sources(key) ON DELETE RESTRICT,
  origin_id uuid REFERENCES evidence_origins(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES registry_users(id) ON DELETE RESTRICT,
  url varchar(2000) NOT NULL CHECK (url ~ '^https://'),
  kind text NOT NULL CHECK (kind IN ('OFFICIAL','REPOSITORY','MANIFEST','TEST_RESULT','COMMUNITY','LEGACY')),
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  observed_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(entity_id, compatibility_id, claim_id, assertion_id) = 1)
);
CREATE INDEX registry_evidence_entity ON registry_evidence(entity_id);
CREATE INDEX registry_evidence_compat ON registry_evidence(compatibility_id);
CREATE INDEX registry_evidence_claim ON registry_evidence(claim_id);
CREATE INDEX registry_evidence_assertion ON registry_evidence(assertion_id);
-- Preserve original evidence_url including non-HTTPS values; don't invent provenance.
INSERT INTO registry_evidence(compatibility_id,url,kind,observed_at)
  SELECT id,evidence_url,'LEGACY',COALESCE(checked_at,created_at)
  FROM compatibility_claims WHERE evidence_url ~ '^https://';

CREATE TABLE compatibility_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compatibility_id uuid NOT NULL REFERENCES compatibility_claims(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL REFERENCES registry_evidence(id) ON DELETE RESTRICT,
  verdict text NOT NULL CHECK (verdict IN ('CONFIRMED','DISPUTED')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(compatibility_id, user_id)
);

CREATE TABLE registry_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES entities(id) ON DELETE RESTRICT,
  compatibility_id uuid REFERENCES compatibility_claims(id) ON DELETE RESTRICT,
  claim_id uuid REFERENCES entity_claims(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES registry_users(id) ON DELETE RESTRICT,
  source_key varchar(100) REFERENCES sources(key) ON DELETE RESTRICT,
  evidence_id uuid REFERENCES registry_evidence(id) ON DELETE RESTRICT,
  action text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(entity_id, compatibility_id, claim_id) = 1)
);
CREATE INDEX registry_changes_entity ON registry_changes(entity_id,created_at);
CREATE INDEX registry_changes_compat ON registry_changes(compatibility_id,created_at);
CREATE INDEX registry_changes_claim ON registry_changes(claim_id,created_at);
CREATE TABLE registry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL REFERENCES registry_evidence(id) ON DELETE RESTRICT,
  proposed_value jsonb NOT NULL CHECK (jsonb_typeof(proposed_value) = 'object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX registry_corrections_queue ON registry_corrections(status,created_at);

CREATE TABLE repository_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES software_packages(id) ON DELETE RESTRICT,
  observed_at timestamptz(6) NOT NULL DEFAULT now(),
  stars integer CHECK (stars >= 0),
  forks integer CHECK (forks >= 0),
  open_issues integer CHECK (open_issues >= 0),
  latest_release varchar(255),
  last_commit_at timestamptz(6),
  sync_status text NOT NULL CHECK (sync_status IN ('OK','RATE_LIMITED','UNAVAILABLE','NOT_FOUND')),
  UNIQUE(project_id, observed_at)
);

CREATE FUNCTION registry_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registry history is append-only'; END $$;
CREATE TRIGGER registry_changes_immutable BEFORE UPDATE OR DELETE ON registry_changes
  FOR EACH ROW EXECUTE FUNCTION registry_history_immutable();

CREATE FUNCTION registry_validate_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM registry_evidence WHERE id=NEW.evidence_id AND compatibility_id=NEW.compatibility_id) THEN
    RAISE EXCEPTION 'Confirmation evidence must refer to the same compatibility';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_confirmation_evidence BEFORE INSERT OR UPDATE ON compatibility_confirmations
  FOR EACH ROW EXECUTE FUNCTION registry_validate_confirmation();

CREATE FUNCTION registry_validate_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_status text; new_status text; allowed boolean := false;
BEGIN
  IF TG_TABLE_NAME='software_packages' THEN
    new_status := NEW.verification_status;
    IF TG_OP='INSERT' THEN
      IF new_status <> 'DISCOVERED' THEN RAISE EXCEPTION 'Projects start DISCOVERED'; END IF;
      RETURN NEW;
    END IF;
    old_status := OLD.verification_status;
    allowed := (old_status='DISCOVERED' AND new_status IN ('SUGGESTED','REJECTED'))
      OR (old_status='SUGGESTED' AND new_status IN ('VERIFIED','REJECTED'))
      OR (old_status='VERIFIED' AND new_status IN ('SUGGESTED','REJECTED'))
      OR (old_status='REJECTED' AND new_status='SUGGESTED');
    IF old_status IS DISTINCT FROM new_status AND new_status='VERIFIED'
      AND NOT EXISTS (SELECT 1 FROM registry_evidence WHERE entity_id=NEW.entity_id) THEN
      RAISE EXCEPTION 'Verified project requires evidence';
    END IF;
  ELSIF TG_TABLE_NAME='entity_claims' THEN
    new_status := NEW.status;
    IF TG_OP='INSERT' THEN
      IF new_status <> 'PENDING' THEN RAISE EXCEPTION 'Claims start PENDING'; END IF;
      RETURN NEW;
    END IF;
    old_status := OLD.status;
    allowed := (old_status='PENDING' AND new_status IN ('VERIFIED','REJECTED'))
      OR (old_status='VERIFIED' AND new_status='REVOKED');
  ELSE
    -- Untyped legacy records retain their original lifecycle.
    IF TG_OP='UPDATE' AND OLD.project_id IS NOT NULL AND
      (NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.robot_id IS DISTINCT FROM OLD.robot_id
       OR NEW.subject_version_range IS DISTINCT FROM OLD.subject_version_range
       OR NEW.object_version_range IS DISTINCT FROM OLD.object_version_range
       OR NEW.requirements IS DISTINCT FROM OLD.requirements OR NEW.revision <> OLD.revision
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id) THEN
      RAISE EXCEPTION 'Create a new compatibility revision instead of changing its scope';
    END IF;
    IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
    new_status := NEW.claim_status;
    IF TG_OP='INSERT' THEN
      IF new_status <> 'DISCOVERED' THEN RAISE EXCEPTION 'Compatibility starts DISCOVERED'; END IF;
      RETURN NEW;
    END IF;
    old_status := OLD.claim_status;
    allowed := (old_status IN ('DISCOVERED','UNKNOWN','CLAIMED') AND new_status IN ('SUGGESTED','REJECTED'))
      OR (old_status='SUGGESTED' AND new_status IN ('VERIFIED','REJECTED'))
      OR (old_status='VERIFIED' AND new_status IN ('DEPRECATED','REJECTED'))
      OR (old_status='REJECTED' AND new_status='SUGGESTED');
    IF old_status IS DISTINCT FROM new_status AND new_status='VERIFIED'
      AND NOT EXISTS (SELECT 1 FROM registry_evidence WHERE compatibility_id=NEW.id) THEN
      RAISE EXCEPTION 'Verified compatibility requires evidence';
    END IF;
    IF OLD.project_id IS NOT NULL AND
      (NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.robot_id IS DISTINCT FROM OLD.robot_id
       OR NEW.subject_version_range IS DISTINCT FROM OLD.subject_version_range
       OR NEW.object_version_range IS DISTINCT FROM OLD.object_version_range
       OR NEW.requirements IS DISTINCT FROM OLD.requirements OR NEW.revision <> OLD.revision) THEN
      RAISE EXCEPTION 'Create a new compatibility revision instead of changing its scope';
    END IF;
  END IF;
  IF old_status IS DISTINCT FROM new_status AND NOT allowed THEN
    RAISE EXCEPTION 'Invalid Registry transition: % -> %',old_status,new_status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_project_status BEFORE INSERT OR UPDATE ON software_packages
  FOR EACH ROW EXECUTE FUNCTION registry_validate_status();
CREATE TRIGGER registry_claim_status BEFORE INSERT OR UPDATE ON entity_claims
  FOR EACH ROW EXECUTE FUNCTION registry_validate_status();
CREATE TRIGGER registry_compat_status BEFORE INSERT OR UPDATE ON compatibility_claims
  FOR EACH ROW EXECUTE FUNCTION registry_validate_status();

INSERT INTO feature_flags(key,environment,enabled,config_json)
VALUES ('registry.read','all',false,'{}'),('registry.write','all',false,'{}'),
       ('registry.claims','all',false,'{}'),('registry.sync','all',false,'{}')
ON CONFLICT(key,environment) DO NOTHING;

-- Identity and evidence cannot be reassigned after verification.
CREATE FUNCTION registry_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text; actual text;
BEGIN
  IF TG_TABLE_NAME='software_packages' THEN
    expected := 'PROJECT';
    IF NEW.entity_id IS NULL THEN
      IF TG_OP='UPDATE' AND OLD.entity_id IS NOT NULL THEN RAISE EXCEPTION 'Project identity is immutable'; END IF;
      RETURN NEW; -- legacy writer
    END IF;
  ELSIF TG_TABLE_NAME='developer_profiles' THEN expected := 'DEVELOPER';
  ELSE expected := NULL;
  END IF;
  SELECT entity_type INTO actual FROM entities WHERE id=NEW.entity_id;
  IF expected IS NOT NULL AND actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Wrong Registry entity type'; END IF;
  IF TG_TABLE_NAME='entity_claims' THEN
    IF actual NOT IN ('PROJECT','COMPANY','ROBOT') THEN RAISE EXCEPTION 'Entity is not claimable'; END IF;
    IF TG_OP='UPDATE' AND (NEW.entity_id<>OLD.entity_id OR NEW.claimant_id<>OLD.claimant_id OR NEW.proof_url<>OLD.proof_url) THEN
      RAISE EXCEPTION 'Claim identity and proof are immutable; submit a new claim';
    END IF;
  ELSIF TG_OP='UPDATE' AND NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
    RAISE EXCEPTION 'Registry identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_project_identity BEFORE INSERT OR UPDATE ON software_packages
  FOR EACH ROW EXECUTE FUNCTION registry_identity_guard();
CREATE TRIGGER registry_developer_identity BEFORE INSERT OR UPDATE ON developer_profiles
  FOR EACH ROW EXECUTE FUNCTION registry_identity_guard();
CREATE TRIGGER registry_claim_identity BEFORE INSERT OR UPDATE ON entity_claims
  FOR EACH ROW EXECUTE FUNCTION registry_identity_guard();
CREATE TRIGGER registry_evidence_immutable BEFORE UPDATE OR DELETE ON registry_evidence
  FOR EACH ROW EXECUTE FUNCTION registry_history_immutable();

CREATE FUNCTION registry_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM compatibility_claims p WHERE p.id=NEW.supersedes_id
      AND p.project_id=NEW.project_id AND p.robot_id=NEW.robot_id AND p.revision+1=NEW.revision
  ) THEN RAISE EXCEPTION 'Revision must follow the same project/robot pair'; END IF;
  IF NEW.project_id IS NOT NULL AND NEW.supersedes_id IS NULL AND NEW.revision<>1 THEN
    RAISE EXCEPTION 'First compatibility revision must be 1';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_compat_revision BEFORE INSERT OR UPDATE ON compatibility_claims
  FOR EACH ROW EXECUTE FUNCTION registry_revision_guard();

CREATE FUNCTION registry_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='registry_corrections' AND NOT EXISTS (
    SELECT 1 FROM registry_evidence WHERE id=NEW.evidence_id AND entity_id=NEW.entity_id
  ) THEN RAISE EXCEPTION 'Correction evidence must refer to the same entity'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'Review starts PENDING'; END IF;
  ELSE
    IF TG_TABLE_NAME='compatibility_confirmations' THEN
      IF NEW.compatibility_id<>OLD.compatibility_id OR NEW.user_id<>OLD.user_id OR NEW.evidence_id<>OLD.evidence_id
        OR NEW.verdict<>OLD.verdict THEN RAISE EXCEPTION 'Confirmation content is immutable'; END IF;
    ELSE
      IF NEW.entity_id<>OLD.entity_id OR NEW.user_id<>OLD.user_id OR NEW.evidence_id<>OLD.evidence_id
        OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value THEN RAISE EXCEPTION 'Correction content is immutable'; END IF;
    END IF;
    IF NEW.status<>OLD.status AND NOT (
      (OLD.status='PENDING' AND NEW.status IN ('ACCEPTED','REJECTED','WITHDRAWN')) OR
      (OLD.status='ACCEPTED' AND NEW.status='WITHDRAWN')
    ) THEN RAISE EXCEPTION 'Invalid review transition'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_confirmation_review BEFORE INSERT OR UPDATE ON compatibility_confirmations
  FOR EACH ROW EXECUTE FUNCTION registry_review_guard();
CREATE TRIGGER registry_correction_review BEFORE INSERT OR UPDATE ON registry_corrections
  FOR EACH ROW EXECUTE FUNCTION registry_review_guard();

-- Capture mutations even when executed outside the application repository.
-- Actor-less rows represent DB/system operations; application contributions add attributed events.
CREATE FUNCTION registry_capture_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb := NULL; current_value jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP='UPDATE' THEN
    previous := to_jsonb(OLD);
    IF previous=current_value THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='software_packages' THEN
    IF NEW.entity_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO registry_changes(entity_id,action,before_value,after_value)
      VALUES(NEW.entity_id,TG_TABLE_NAME||'.'||TG_OP,previous,current_value);
  ELSIF TG_TABLE_NAME='entity_claims' THEN
    INSERT INTO registry_changes(claim_id,action,before_value,after_value)
      VALUES(NEW.id,TG_TABLE_NAME||'.'||TG_OP,previous,current_value);
  ELSIF TG_TABLE_NAME='compatibility_claims' THEN
    IF NEW.project_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO registry_changes(compatibility_id,action,before_value,after_value)
      VALUES(NEW.id,TG_TABLE_NAME||'.'||TG_OP,previous,current_value);
  ELSIF TG_TABLE_NAME='compatibility_confirmations' THEN
    INSERT INTO registry_changes(compatibility_id,actor_id,evidence_id,action,before_value,after_value)
      VALUES(NEW.compatibility_id,NEW.user_id,NEW.evidence_id,TG_TABLE_NAME||'.'||TG_OP,previous,current_value);
  ELSE
    INSERT INTO registry_changes(entity_id,actor_id,evidence_id,action,before_value,after_value)
      VALUES(NEW.entity_id,NEW.user_id,NEW.evidence_id,TG_TABLE_NAME||'.'||TG_OP,previous,current_value);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_project_history AFTER INSERT OR UPDATE ON software_packages
  FOR EACH ROW EXECUTE FUNCTION registry_capture_change();
CREATE TRIGGER registry_claim_history AFTER INSERT OR UPDATE ON entity_claims
  FOR EACH ROW EXECUTE FUNCTION registry_capture_change();
CREATE TRIGGER registry_compat_history AFTER INSERT OR UPDATE ON compatibility_claims
  FOR EACH ROW EXECUTE FUNCTION registry_capture_change();
CREATE TRIGGER registry_confirmation_history AFTER INSERT OR UPDATE ON compatibility_confirmations
  FOR EACH ROW EXECUTE FUNCTION registry_capture_change();
CREATE TRIGGER registry_correction_history AFTER INSERT OR UPDATE ON registry_corrections
  FOR EACH ROW EXECUTE FUNCTION registry_capture_change();
