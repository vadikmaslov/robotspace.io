-- An official company URL must be distinguishable from an unreviewed URL.
-- The method is deliberately small and auditable: an administrator can confirm
-- a site, or the authorised Aparobot workflow can write a conservatively
-- verified outbound site.
ALTER TABLE company_public_projections
  ADD COLUMN IF NOT EXISTS official_url_verified_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS official_url_verification_method varchar(40);

ALTER TABLE company_public_projections
  DROP CONSTRAINT IF EXISTS chk_company_official_url_verification_method;

ALTER TABLE company_public_projections
  ADD CONSTRAINT chk_company_official_url_verification_method
  CHECK (official_url_verification_method IS NULL OR official_url_verification_method IN ('ADMIN_CONFIRMED', 'APAROBOT_VERIFIED'));

-- Preserve the audit trail for URLs that the existing Aparobot pipeline has
-- already independently verified.  Other historic URLs deliberately remain
-- unverified and are not inherited by robot records.
UPDATE company_public_projections company
SET official_url_verified_at = COALESCE(company.official_url_verified_at, company.last_verified_at, company.updated_at),
    official_url_verification_method = 'APAROBOT_VERIFIED'
FROM entity_source_links link
JOIN source_records record ON record.id = link.source_record_id
WHERE link.entity_id = company.company_entity_id
  AND link.source_id = 'aparobot-companies'
  AND record.metadata_json->>'official_website_status' = 'VERIFIED'
  AND company.official_url = record.metadata_json->>'official_url'
  AND company.official_url IS NOT NULL;
