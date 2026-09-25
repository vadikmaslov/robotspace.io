-- Commercial robot directories are useful discovery leads, but none of these
-- registrations grants an automated collection or publication right.  They
-- deliberately stay PROPOSED and locked until a source-specific contract
-- (API/feed or written permission) is reviewed.
INSERT INTO sources (
  key, display_name, owner_name, homepage_url, content_area, admin_description, public_description,
  is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch
) VALUES
  ('aparobot-robots', 'Aparobot Robot Catalog', 'Aparobot', 'https://www.aparobot.com/robots', 'CATALOG',
   'Commercial robot directory. Its Terms restrict automated access beyond normal human browsing. Use only as a manual discovery lead unless Aparobot provides a written API/feed permission. Do not copy product text, pricing, photographs or logos.',
   'Commercial robot-directory reference pending permission review.', false, 'C', 'HTML', 'PROPOSED', 'RESTRICTED_RISK', 1, 0.55, true),
  ('humanoid-guide-database', 'Humanoid Guide Robot Database', 'Humanoid.guide', 'https://humanoid.guide/humanoid-robots-database/', 'CATALOG',
   'Humanoid-focused database for candidate discovery. Its public privacy page does not grant database or content-reuse rights, and no usable public API/feed has been verified. Keep locked pending explicit permission; do not copy editorial text, images or database entries.',
   'Humanoid-robot discovery reference pending permission review.', false, 'C', 'HTML', 'PROPOSED', 'UNKNOWN', 1, 0.55, true),
  ('robotlab-store', 'RobotLAB Store', 'RobotLAB', 'https://www.robotlab.com/store/', 'CATALOG',
   'Commercial reseller catalog. Site terms reserve content rights and prohibit downloading or modifying the site without written permission. Discovery only after a reviewed permission path; never import prices, product copy, images or logos.',
   'Commercial robot reseller reference pending permission review.', false, 'C', 'HTML', 'PROPOSED', 'RESTRICTED_RISK', 1, 0.55, true),
  ('unchained-robotics-catalog', 'Unchained Robotics Robot Catalog', 'Unchained Robotics GmbH', 'https://unchainedrobotics.de/en/category/robot', 'CATALOG',
   'Commercial B2B robot marketplace. Terms found cover customer inquiries and sales, not a data-reuse or bulk-access grant. Keep locked pending written API/feed permission; do not ingest prices, product text, images, logos or technical claims from listings.',
   'Commercial robot marketplace reference pending permission review.', false, 'C', 'HTML', 'PROPOSED', 'UNKNOWN', 1, 0.55, true)
ON CONFLICT (key) DO NOTHING;

-- This is visible in the Catalog orchestration tree so an administrator can
-- see which directories await permission.  It has no worker executor and
-- cannot be enabled/run while it remains PLANNED.
INSERT INTO scheduled_agents (
  agent_key, display_name, description, cron_expression, is_enabled, run_mode,
  site_area, agent_role, parent_agent_key, source_keys, task_complexity, implementation_status
) VALUES (
  'catalog-commercial-directory-review', 'Commercial directory review collector',
  'Maintains the approval queue for Aparobot, Humanoid Guide, RobotLAB and Unchained Robotics. It may only collect after a source-specific API/feed or written permission is contracted; it never copies listings, prices, images or editorial text.',
  '30 3 * * *', false, 'SCHEDULED', 'CATALOG', 'COLLECTOR', 'catalog-orchestrator',
  '["aparobot-robots","humanoid-guide-database","robotlab-store","unchained-robotics-catalog"]'::jsonb,
  'SIMPLE', 'PLANNED'
)
ON CONFLICT (agent_key) DO NOTHING;

UPDATE scheduled_agents
SET source_keys = '["wikidata","unibot-catalog","aparobot-robots","humanoid-guide-database","robotlab-store","unchained-robotics-catalog"]'::jsonb,
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';
