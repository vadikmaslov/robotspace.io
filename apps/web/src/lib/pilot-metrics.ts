export function pilotTeamIds(value: string | undefined) {
  const ids = [...new Set((value ?? '').split(',').map(id => id.trim()).filter(Boolean))]
  if (ids.some(id => !/^[1-9][0-9]{0,19}$/.test(id))) throw new Error('Invalid private pilot team configuration')
  return ids
}

export type PilotMetrics = {
  projects: number; developers: number; reports: number; manufacturers: number;
  covered: number; external_actions: number; team_actions: number; unknown_actions: number;
  team_accounts: number;
}

// Static parameterized SQL: $1 private GitHub IDs, $2 window days, $3 observation time.
// Statuses are current, not reconstructed historical snapshots. Audit records are never rewritten.
export const pilotMetricsSql = `WITH
  bounds AS (SELECT min(added_at) AS since,
    least(min(added_at) + $2::int * interval '1 day', $3::timestamptz) AS until FROM pilot_robot_cohort),
  team AS (SELECT u.id FROM registry_users u WHERE
    EXISTS (SELECT 1 FROM registry_accounts a WHERE a.user_id=u.id AND a.provider='github' AND a.provider_account_id=ANY($1::text[]))
    OR EXISTS (SELECT 1 FROM registry_roles r WHERE r.user_id=u.id AND r.role='MODERATOR')),
  outsiders AS (SELECT u.id FROM registry_users u WHERE u.status='ACTIVE'
    AND NOT EXISTS (SELECT 1 FROM team t WHERE t.id=u.id)
    AND EXISTS (SELECT 1 FROM registry_accounts a WHERE a.user_id=u.id AND a.provider='github')),
  robots AS (SELECT c.robot_entity_id AS id, r.manufacturer_entity_id AS company_id FROM pilot_robot_cohort c
    JOIN entities e ON e.id=c.robot_entity_id AND e.entity_type='ROBOT' AND e.publication_status='PUBLISHED' AND e.archived_at IS NULL
    JOIN robot_public_projections r ON r.robot_entity_id=e.id AND r.lifecycle_status='ACTIVE'),
  links AS (SELECT c.id, c.robot_id, p.entity_id AS project_id, c.created_by FROM compatibility_claims c
    JOIN robots r ON r.id=c.robot_id JOIN software_packages p ON p.id=c.project_id
    JOIN entities e ON e.id=p.entity_id AND e.entity_type='PROJECT' AND e.publication_status='PUBLISHED' AND e.archived_at IS NULL
    CROSS JOIN bounds b WHERE c.claim_status='VERIFIED' AND c.created_at < b.until
    AND NOT EXISTS (SELECT 1 FROM compatibility_claims newer WHERE newer.supersedes_id=c.id AND newer.created_at < b.until)),
  scope AS (SELECT id FROM robots UNION SELECT project_id FROM links UNION SELECT company_id FROM robots WHERE company_id IS NOT NULL),
  claims AS (SELECT DISTINCT c.entity_id FROM entity_claims c JOIN outsiders u ON u.id=c.claimant_id
    CROSS JOIN bounds b WHERE c.status='VERIFIED' AND c.created_at >= b.since AND c.created_at < b.until
    AND EXISTS (SELECT 1 FROM links l WHERE l.project_id=c.entity_id)),
  activity AS (SELECT c.actor_id, c.entity_id FROM registry_changes c CROSS JOIN bounds b
    LEFT JOIN entity_claims ec ON ec.id=c.claim_id
    WHERE c.created_at >= b.since AND c.created_at < b.until AND
      (c.entity_id IN (SELECT id FROM scope) OR ec.entity_id IN (SELECT id FROM scope)
       OR c.compatibility_id IN (SELECT id FROM links)))
SELECT
  (SELECT count(*)::int FROM claims) AS projects,
  (SELECT count(DISTINCT d.user_id)::int FROM developer_profiles d JOIN outsiders u ON u.id=d.user_id
    JOIN entities e ON e.id=d.entity_id AND e.publication_status='PUBLISHED' AND e.archived_at IS NULL
    WHERE EXISTS (SELECT 1 FROM activity a WHERE a.actor_id=d.user_id)) AS developers,
  (SELECT count(DISTINCT (l.robot_id,l.project_id,c.user_id))::int FROM compatibility_confirmations c
    JOIN links l ON l.id=c.compatibility_id JOIN outsiders u ON u.id=c.user_id CROSS JOIN bounds b
    WHERE c.created_at >= b.since AND c.created_at < b.until AND c.status IN ('PENDING','ACCEPTED')
    AND c.user_id IS DISTINCT FROM l.created_by
    AND NOT EXISTS (SELECT 1 FROM entity_claims owner WHERE owner.entity_id=l.project_id AND owner.claimant_id=c.user_id AND owner.status='VERIFIED')) AS reports,
  (SELECT count(DISTINCT c.entity_id)::int FROM entity_claims c JOIN outsiders u ON u.id=c.claimant_id
    JOIN entities e ON e.id=c.entity_id AND e.entity_type='COMPANY' AND e.publication_status='PUBLISHED' AND e.archived_at IS NULL
    CROSS JOIN bounds b WHERE c.status='VERIFIED' AND c.verification_method='DNS_TXT_MANUFACTURER'
    AND c.created_at >= b.since AND c.created_at < b.until AND c.entity_id IN (SELECT company_id FROM robots)) AS manufacturers,
  (SELECT count(*)::int FROM (SELECT l.robot_id FROM links l JOIN claims c ON c.entity_id=l.project_id
    GROUP BY l.robot_id HAVING count(DISTINCT l.project_id)>=3) covered_robots) AS covered,
  (SELECT count(*)::int FROM activity a JOIN outsiders u ON u.id=a.actor_id) AS external_actions,
  (SELECT count(*)::int FROM activity a WHERE a.actor_id IS NULL OR a.actor_id IN (SELECT id FROM team)) AS team_actions,
  (SELECT count(*)::int FROM activity a WHERE a.actor_id IS NOT NULL AND a.actor_id NOT IN (SELECT id FROM team)
    AND a.actor_id NOT IN (SELECT id FROM outsiders)) AS unknown_actions,
  (SELECT count(*)::int FROM team) AS team_accounts`
