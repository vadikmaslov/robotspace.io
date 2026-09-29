CREATE TABLE registry_reputation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'CLAIM_VERIFIED','CORRECTION_ACCEPTED','COMPATIBILITY_SUGGESTION_ACCEPTED',
    'COMPATIBILITY_CONFIRMATION_ACCEPTED','COMPATIBILITY_DISPUTE_ACCEPTED'
  )),
  reference_id uuid NOT NULL,
  points integer NOT NULL CHECK (
    (event_type='CLAIM_VERIFIED' AND points=2) OR
    (event_type<>'CLAIM_VERIFIED' AND points=1)
  ),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_type,reference_id)
);
CREATE INDEX registry_reputation_events_user_created
  ON registry_reputation_events(user_id,created_at DESC);

CREATE TRIGGER registry_reputation_events_immutable
  BEFORE UPDATE OR DELETE ON registry_reputation_events
  FOR EACH ROW EXECUTE FUNCTION registry_history_immutable();

CREATE TRIGGER registry_confirmation_no_delete
  BEFORE DELETE ON compatibility_confirmations
  FOR EACH ROW EXECUTE FUNCTION registry_history_immutable();

CREATE FUNCTION registry_reputation_apply() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE developer_profiles SET reputation=reputation+NEW.points WHERE user_id=NEW.user_id;
  RETURN NEW;
END $$;
CREATE TRIGGER registry_reputation_event_apply AFTER INSERT ON registry_reputation_events
  FOR EACH ROW EXECUTE FUNCTION registry_reputation_apply();

INSERT INTO registry_reputation_events(user_id,event_type,reference_id,points,created_at)
SELECT claimant_id,'CLAIM_VERIFIED',entity_id,2,COALESCE(checked_at,updated_at)
FROM entity_claims WHERE status='VERIFIED'
ON CONFLICT DO NOTHING;

INSERT INTO registry_reputation_events(user_id,event_type,reference_id,points,created_at)
SELECT user_id,'CORRECTION_ACCEPTED',id,1,created_at
FROM registry_corrections WHERE status='ACCEPTED'
ON CONFLICT DO NOTHING;

INSERT INTO registry_reputation_events(user_id,event_type,reference_id,points,created_at)
SELECT user_id,
  CASE verdict WHEN 'CONFIRMED' THEN 'COMPATIBILITY_CONFIRMATION_ACCEPTED' ELSE 'COMPATIBILITY_DISPUTE_ACCEPTED' END,
  id,1,created_at
FROM compatibility_confirmations WHERE status='ACCEPTED'
ON CONFLICT DO NOTHING;

INSERT INTO registry_reputation_events(user_id,event_type,reference_id,points,created_at)
SELECT created_by,'COMPATIBILITY_SUGGESTION_ACCEPTED',id,1,COALESCE(checked_at,created_at)
FROM compatibility_claims
WHERE project_id IS NOT NULL AND created_by IS NOT NULL AND claim_status='VERIFIED'
ON CONFLICT DO NOTHING;
