-- Phase 11 keeps a reproducible, deliberately small pilot cohort.  It contains
-- no visitor or account data: product contributions remain in the existing
-- Registry audit ledger.
CREATE TABLE pilot_robot_cohort (
  robot_entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by varchar(255) NOT NULL DEFAULT 'pilot-selection-v1',
  selection_reason jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION enforce_pilot_robot_cohort_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM pilot_robot_cohort) >= 200 THEN
    RAISE EXCEPTION 'The pilot cohort cannot exceed 200 robots';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pilot_robot_cohort_limit
  BEFORE INSERT ON pilot_robot_cohort
  FOR EACH ROW EXECUTE FUNCTION enforce_pilot_robot_cohort_limit();

-- A robot is strong enough for the pilot when at least three independently
-- useful public signals are present.  The cohort is seeded once and remains
-- stable, so the 30/60/90-day comparisons retain the same denominator.
WITH candidates AS (
  SELECT r.robot_entity_id,
    jsonb_build_object(
      'version', 'pilot-selection-v1',
      'signals', jsonb_build_object(
        'officialUrl', r.official_url IS NOT NULL,
        'summary', r.summary IS NOT NULL AND length(trim(r.summary)) >= 80,
        'manufacturer', r.manufacturer_entity_id IS NOT NULL,
        'verifiedAt', r.last_verified_at IS NOT NULL,
        'image', r.image_url IS NOT NULL
      )
    ) AS selection_reason
  FROM robot_public_projections r
  JOIN entities e ON e.id = r.robot_entity_id
  WHERE e.entity_type = 'ROBOT'
    AND e.publication_status = 'PUBLISHED'
    AND e.archived_at IS NULL
    AND ((r.official_url IS NOT NULL)::int
       + (r.summary IS NOT NULL AND length(trim(r.summary)) >= 80)::int
       + (r.manufacturer_entity_id IS NOT NULL)::int
       + (r.last_verified_at IS NOT NULL)::int
       + (r.image_url IS NOT NULL)::int) >= 3
  ORDER BY r.last_verified_at DESC NULLS LAST, r.updated_at DESC, r.canonical_name ASC
  LIMIT 150
)
INSERT INTO pilot_robot_cohort(robot_entity_id, selection_reason)
SELECT robot_entity_id, selection_reason FROM candidates;
