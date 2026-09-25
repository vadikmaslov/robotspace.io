-- The operator approved deterministic publication of a RobotSpace identity
-- record from the authorised directory links. The underlying catalogue text,
-- photographs, prices and page specifications remain out of scope.
UPDATE source_contracts
SET allowed_operations = '["discovery_queue","identity_cross_reference"]'::jsonb,
    publication_policy = 'May automatically publish a minimal RobotSpace identity after deterministic canonical-name validation. Do not retain or publish source text, prices, images, descriptions or technical claims.',
    updated_at = now()
WHERE source_key IN ('aparobot-robots','humanoid-guide-database','robotlab-store');

UPDATE scheduled_agents
SET description = 'Collects validated robot names and canonical URLs from authorised directories, then creates or merges minimal RobotSpace identities. A deterministic Unibot match may attach the Unibot brand and image. It never copies source descriptions, prices, photos or technical specifications.',
    source_keys = '["aparobot-robots","humanoid-guide-database","robotlab-store","unibot-catalog"]'::jsonb,
    implementation_status = 'READY',
    updated_at = now()
WHERE agent_key = 'catalog-orchestrator';

UPDATE scheduled_agents
SET description = 'Creates a 55–80 word list preview and a 350–500 word, three-paragraph detailed preview from transient article text. Raw article HTML is never stored.',
    updated_at = now()
WHERE agent_key = 'insights-summary-writer';

-- Existing articles retain the previous short-preview policy. Newly inserted
-- articles receive the long, paragraph-based policy without rewriting history.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS summary_format varchar(20) NOT NULL DEFAULT 'LONG_V2';

UPDATE articles
SET summary_format = 'LEGACY_V1'
WHERE summary_format = 'LONG_V2'
  AND created_at < now();
