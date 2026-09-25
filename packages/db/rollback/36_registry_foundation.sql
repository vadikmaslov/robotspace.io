-- Run only inside an explicit transaction, after reviewing the guard.
-- Reverses migration 36 BEFORE Registry is used. Once contributions exist,
-- roll back application code with flags disabled; keep the additive schema/data.
LOCK TABLE registry_users, registry_accounts, registry_roles, developer_profiles,
  entity_claims, registry_evidence, compatibility_confirmations, registry_changes,
  registry_corrections, repository_snapshots, software_packages, compatibility_claims,
  entities, feature_flags IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM registry_users) OR EXISTS(SELECT 1 FROM registry_changes)
    OR EXISTS(SELECT 1 FROM repository_snapshots)
    OR EXISTS(SELECT 1 FROM compatibility_claims WHERE project_id IS NOT NULL OR robot_id IS NOT NULL
      OR revision<>1 OR supersedes_id IS NOT NULL OR created_by IS NOT NULL OR requirements<>'{}'::jsonb
      OR claim_status NOT IN ('CLAIMED','VERIFIED','DEPRECATED','UNKNOWN'))
    OR EXISTS(SELECT 1 FROM registry_evidence WHERE kind<>'LEGACY' OR submitted_by IS NOT NULL
      OR source_key IS NOT NULL OR origin_id IS NOT NULL OR confidence IS NOT NULL)
    OR EXISTS(SELECT 1 FROM entities WHERE entity_type='DEVELOPER')
    OR EXISTS(SELECT 1 FROM entities e WHERE e.entity_type='PROJECT' AND
      (e.slug <> 'project-'||e.id::text OR e.publication_status<>'DRAFT' OR e.archived_at IS NOT NULL
       OR e.superseded_by_entity_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM software_packages s WHERE s.id=e.id AND s.entity_id=e.id)))
    OR EXISTS(SELECT 1 FROM software_packages WHERE description IS NOT NULL OR project_type<>'tool'
      OR origin_status<>'COMMUNITY' OR verification_status<>'DISCOVERED' OR github_repository_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM feature_flags WHERE key IN ('registry.read','registry.write','registry.claims','registry.sync') AND enabled)
  THEN RAISE EXCEPTION 'Registry has new data: refuse destructive rollback; disable flags and roll back application only'; END IF;
END $$;

DROP TRIGGER registry_project_history ON software_packages;
DROP TRIGGER registry_compat_history ON compatibility_claims;
DROP TRIGGER registry_project_identity ON software_packages;
DROP TRIGGER registry_project_status ON software_packages;
DROP TRIGGER registry_compat_status ON compatibility_claims;
DROP TRIGGER registry_compat_revision ON compatibility_claims;
DROP TABLE registry_corrections, compatibility_confirmations, repository_snapshots, registry_changes;
DROP TABLE registry_evidence;

ALTER TABLE compatibility_claims DROP CONSTRAINT registry_compat_endpoints,
  DROP CONSTRAINT registry_compat_requirements, DROP CONSTRAINT registry_compat_no_self;
ALTER TABLE compatibility_claims DROP COLUMN project_id, DROP COLUMN robot_id,
  DROP COLUMN requirements, DROP COLUMN revision, DROP COLUMN supersedes_id, DROP COLUMN created_by;
DROP TABLE entity_claims, developer_profiles, registry_roles, registry_accounts, registry_users;
ALTER TABLE compatibility_claims DROP CONSTRAINT compatibility_claims_claim_status_check;
ALTER TABLE compatibility_claims ADD CONSTRAINT compatibility_claims_claim_status_check
  CHECK (claim_status IN ('CLAIMED','VERIFIED','DEPRECATED','UNKNOWN'));
ALTER TABLE software_packages DROP COLUMN entity_id, DROP COLUMN description, DROP COLUMN project_type,
  DROP COLUMN origin_status, DROP COLUMN verification_status, DROP COLUMN github_repository_id, DROP COLUMN updated_at;
DELETE FROM entities WHERE entity_type='PROJECT';
ALTER TABLE entities DROP CONSTRAINT entities_entity_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_entity_type_check CHECK (entity_type IN ('ROBOT','ROBOT_VARIANT','COMPANY'));
DELETE FROM feature_flags WHERE key IN ('registry.read','registry.write','registry.claims','registry.sync');
DROP FUNCTION registry_capture_change(), registry_review_guard(), registry_revision_guard(),
  registry_identity_guard(), registry_validate_status(), registry_validate_confirmation(), registry_history_immutable();
DELETE FROM robotspace_schema_migrations WHERE name='36_registry_foundation';
