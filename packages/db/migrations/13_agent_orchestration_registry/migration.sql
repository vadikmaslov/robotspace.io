-- A readable orchestration tree for the source-driven pipeline. PLANNED
-- agents are registry entries only: they cannot run until a worker executor
-- and an approved source contract are added.
ALTER TABLE scheduled_agents
  ADD COLUMN site_area VARCHAR(30) NOT NULL DEFAULT 'GENERAL'
    CHECK (site_area IN ('CATALOG','RESEARCH','INSIGHTS','SAFETY','SOFTWARE','IMAGES','INTEGRATORS','MARKET','GENERAL')),
  ADD COLUMN agent_role VARCHAR(20) NOT NULL DEFAULT 'COLLECTOR'
    CHECK (agent_role IN ('ORCHESTRATOR','COLLECTOR','PROCESSOR')),
  ADD COLUMN parent_agent_key VARCHAR(100) REFERENCES scheduled_agents(agent_key) ON DELETE RESTRICT,
  ADD COLUMN source_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN task_complexity VARCHAR(10) NOT NULL DEFAULT 'SIMPLE'
    CHECK (task_complexity IN ('SIMPLE','COMPLEX')),
  ADD COLUMN implementation_status VARCHAR(20) NOT NULL DEFAULT 'READY'
    CHECK (implementation_status IN ('PLANNED','READY','RETIRED'));

CREATE INDEX idx_scheduled_agents_area_parent ON scheduled_agents(site_area, parent_agent_key);

INSERT INTO sources (key, display_name, owner_name, homepage_url, content_area, admin_description, public_description, is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch)
VALUES ('unibot-catalog', 'Unibot catalog', 'Unibot', 'https://unibot.ru/', 'CATALOG', 'Authorised integration: synchronises the Unibot catalogue into an isolated cache. It is used for catalogue freshness and image checks; it does not publish robot records by itself.', 'Catalogue reference maintained by the Unibot ecosystem.', false, 'B', 'API', 'ACTIVE', 'UNKNOWN', 10, 0.80, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO scheduled_agents (agent_key, display_name, description, cron_expression, is_enabled, run_mode, site_area, agent_role, source_keys, task_complexity, implementation_status)
VALUES
  ('catalog-orchestrator', 'Catalog orchestrator', 'Coordinates catalogue discovery, entity resolution, evidence thresholds and exception routing. It never publishes a robot or company directly.', '0 2 * * *', false, 'SCHEDULED', 'CATALOG', 'ORCHESTRATOR', '["wikidata","unibot-catalog"]', 'COMPLEX', 'PLANNED'),
  ('research-orchestrator', 'Research orchestrator', 'Coordinates publication discovery, DOI normalization and evidence-quality checks before research can appear in Insights.', '0 3 * * *', false, 'SCHEDULED', 'RESEARCH', 'ORCHESTRATOR', '["arxiv","crossref","openalex"]', 'COMPLEX', 'PLANNED'),
  ('insights-orchestrator', 'Insights orchestrator', 'Coordinates permitted news metadata, deduplication and original-preview generation. It must enforce protected-content boundaries.', '0 4 * * *', false, 'SCHEDULED', 'INSIGHTS', 'ORCHESTRATOR', '["the-robot-report","ieee-spectrum-robotics"]', 'COMPLEX', 'PLANNED'),
  ('safety-orchestrator', 'Safety orchestrator', 'Coordinates regulatory safety notices, model matching and exception review. It never assigns a safety rating.', '0 5 * * *', false, 'SCHEDULED', 'SAFETY', 'ORCHESTRATOR', '["eu-safety-gate","cpsc-recalls","openfda-devices","accessgudid","nvd-cve"]', 'COMPLEX', 'PLANNED'),
  ('software-orchestrator', 'Software compatibility orchestrator', 'Coordinates software and standards evidence. It prevents a package or standard reference from becoming an unsupported compatibility claim.', '0 6 * * *', false, 'SCHEDULED', 'SOFTWARE', 'ORCHESTRATOR', '["robots-ros","rosdistro","gazebo-fuel","vda-5050","opc-ua-robotics","nvidia-isaac-ros"]', 'COMPLEX', 'PLANNED'),
  ('images-orchestrator', 'Image evidence orchestrator', 'Coordinates image discovery, license evidence, attribution and takedown controls. It never publishes an image without policy checks.', '0 7 * * *', false, 'SCHEDULED', 'IMAGES', 'ORCHESTRATOR', '["wikimedia-commons","openverse"]', 'COMPLEX', 'PLANNED'),
  ('integrators-orchestrator', 'Integrators orchestrator', 'Coordinates integrator discovery and geography coverage. Directory entries stay discovery-only until reuse permission and verification are available.', '0 8 * * *', false, 'SCHEDULED', 'INTEGRATORS', 'ORCHESTRATOR', '["csia-directory","automate-exhibitors","irex-exhibitors","automatica-exhibitors"]', 'COMPLEX', 'PLANNED'),
  ('market-orchestrator', 'Market evidence orchestrator', 'Coordinates case-study discovery, evidence freshness and market-readiness thresholds. It prevents marketing claims from becoming market facts.', '0 9 * * *', false, 'SCHEDULED', 'MARKET', 'ORCHESTRATOR', '["abb-customer-stories","kuka-case-studies","ur-resource-hub"]', 'COMPLEX', 'PLANNED')
ON CONFLICT (agent_key) DO NOTHING;

INSERT INTO scheduled_agents (agent_key, display_name, description, cron_expression, is_enabled, run_mode, site_area, agent_role, parent_agent_key, source_keys, task_complexity, implementation_status)
VALUES
  ('catalog-wikidata-discovery', 'Wikidata discovery collector', 'Collects candidate identities, aliases and official links from Wikidata. Technical specifications must be corroborated by stronger evidence.', '15 2 * * *', false, 'SCHEDULED', 'CATALOG', 'COLLECTOR', 'catalog-orchestrator', '["wikidata"]', 'SIMPLE', 'PLANNED'),
  ('research-metadata-collector', 'Research metadata collector', 'Collects permitted bibliographic metadata and DOI links from arXiv, Crossref and OpenAlex; it does not ingest protected full text.', '15 3 * * *', false, 'SCHEDULED', 'RESEARCH', 'COLLECTOR', 'research-orchestrator', '["arxiv","crossref","openalex"]', 'SIMPLE', 'PLANNED'),
  ('insights-metadata-collector', 'Insights metadata collector', 'Collects only permitted news metadata and links. Restricted publishers remain blocked until their contract and risk acknowledgement are approved.', '15 4 * * *', false, 'SCHEDULED', 'INSIGHTS', 'COLLECTOR', 'insights-orchestrator', '["the-robot-report","ieee-spectrum-robotics"]', 'SIMPLE', 'PLANNED'),
  ('safety-notice-collector', 'Safety notice collector', 'Collects regulatory notices, recalls and verified vulnerability metadata. It does not infer product/version matches.', '15 5 * * *', false, 'SCHEDULED', 'SAFETY', 'COLLECTOR', 'safety-orchestrator', '["eu-safety-gate","cpsc-recalls","openfda-devices","accessgudid","nvd-cve"]', 'SIMPLE', 'PLANNED'),
  ('software-evidence-collector', 'Software evidence collector', 'Collects software, standards and narrowly documented compatibility evidence; it never generalizes support across products.', '15 6 * * *', false, 'SCHEDULED', 'SOFTWARE', 'COLLECTOR', 'software-orchestrator', '["robots-ros","rosdistro","gazebo-fuel","vda-5050","opc-ua-robotics","nvidia-isaac-ros"]', 'SIMPLE', 'PLANNED'),
  ('image-license-collector', 'Image and license collector', 'Discovers candidate images and their license metadata. Each image requires independent landing-page and policy verification.', '15 7 * * *', false, 'SCHEDULED', 'IMAGES', 'COLLECTOR', 'images-orchestrator', '["wikimedia-commons","openverse"]', 'SIMPLE', 'PLANNED'),
  ('integrator-discovery-collector', 'Integrator discovery collector', 'Builds a discovery queue from association and event directories. It cannot bulk collect or publish entries before permission review.', '15 8 * * *', false, 'SCHEDULED', 'INTEGRATORS', 'COLLECTOR', 'integrators-orchestrator', '["csia-directory","automate-exhibitors","irex-exhibitors","automatica-exhibitors"]', 'SIMPLE', 'PLANNED'),
  ('market-case-collector', 'Market case-study collector', 'Collects links to manufacturer case studies as self-reported deployment evidence. It stores facts and original rewrites only after review.', '15 9 * * *', false, 'SCHEDULED', 'MARKET', 'COLLECTOR', 'market-orchestrator', '["abb-customer-stories","kuka-case-studies","ur-resource-hub"]', 'SIMPLE', 'PLANNED')
ON CONFLICT (agent_key) DO NOTHING;

UPDATE scheduled_agents SET site_area = 'CATALOG', agent_role = 'COLLECTOR', parent_agent_key = 'catalog-orchestrator', source_keys = '["unibot-catalog"]'::jsonb, task_complexity = 'SIMPLE', implementation_status = 'READY', updated_at = now() WHERE agent_key = 'unibot-catalog-sync';
UPDATE scheduled_agents SET site_area = 'CATALOG', agent_role = 'PROCESSOR', parent_agent_key = 'catalog-orchestrator', source_keys = '["unibot-catalog"]'::jsonb, task_complexity = 'SIMPLE', implementation_status = 'READY', updated_at = now() WHERE agent_key = 'unibot-brand-import';
