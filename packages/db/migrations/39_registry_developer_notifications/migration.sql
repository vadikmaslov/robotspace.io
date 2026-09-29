CREATE TABLE registry_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CLAIM_REJECTED','CORRECTION_ACCEPTED','CORRECTION_REJECTED','COMPATIBILITY_ACCEPTED','COMPATIBILITY_REJECTED')),
  entity_id uuid REFERENCES entities(id) ON DELETE RESTRICT,
  compatibility_id uuid REFERENCES compatibility_claims(id) ON DELETE RESTRICT,
  message varchar(500) NOT NULL,
  read_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(entity_id, compatibility_id) = 1)
);
CREATE INDEX registry_notifications_user_created ON registry_notifications(user_id, created_at DESC);

CREATE TABLE registry_submission_attempts (
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  window_start timestamptz(6) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 20),
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX registry_submission_attempts_window ON registry_submission_attempts(window_start);

-- Migration 36 evaluated NEW.entity_id for compatibility confirmations, where
-- that field does not exist. Branch before touching table-specific columns.
CREATE OR REPLACE FUNCTION registry_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='registry_corrections' THEN
    IF NOT EXISTS (SELECT 1 FROM registry_evidence WHERE id=NEW.evidence_id AND entity_id=NEW.entity_id) THEN
      RAISE EXCEPTION 'Correction evidence must refer to the same entity';
    END IF;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'Review starts PENDING'; END IF;
  ELSIF TG_TABLE_NAME='compatibility_confirmations' THEN
    IF NEW.compatibility_id<>OLD.compatibility_id OR NEW.user_id<>OLD.user_id OR NEW.evidence_id<>OLD.evidence_id
      OR NEW.verdict<>OLD.verdict THEN RAISE EXCEPTION 'Confirmation content is immutable'; END IF;
  ELSE
    IF NEW.entity_id<>OLD.entity_id OR NEW.user_id<>OLD.user_id OR NEW.evidence_id<>OLD.evidence_id
      OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value THEN RAISE EXCEPTION 'Correction content is immutable'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status<>OLD.status AND NOT (
    (OLD.status='PENDING' AND NEW.status IN ('ACCEPTED','REJECTED','WITHDRAWN')) OR
    (OLD.status='ACCEPTED' AND NEW.status='WITHDRAWN')
  ) THEN RAISE EXCEPTION 'Invalid review transition'; END IF;
  RETURN NEW;
END $$;
