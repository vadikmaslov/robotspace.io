-- New feed items remain private until either a validated AI summary or a clearly
-- labelled safe fallback is present. Existing articles retain their visibility.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS publication_status varchar(20) NOT NULL DEFAULT 'PUBLISHED'
    CHECK (publication_status IN ('PENDING', 'PUBLISHED', 'DRAFT', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS summary_status varchar(20) NOT NULL DEFAULT 'GENERATED'
    CHECK (summary_status IN ('PENDING', 'GENERATED', 'FALLBACK', 'MANUAL'));

CREATE INDEX IF NOT EXISTS idx_articles_publication_summary
  ON articles (publication_status, summary_status, published_at DESC);

INSERT INTO sources (key, display_name, owner_name, homepage_url, content_area, admin_description, public_description, is_public, tier, source_type, status, legal_status, rate_limit_rpm, trust_default_confidence, kill_switch)
VALUES
  ('techcrunch-robotics','TechCrunch Robotics','TechCrunch','https://techcrunch.com/category/robotics/feed/','INSIGHTS','Approved RSS metadata only: title, date, categories and canonical URL.','Robotics-news metadata and links to original reporting.',true,'B','RSS','ACTIVE','ALLOWED',2,.80,false),
  ('hackaday-robotics','Hackaday Robotics','Hackaday','https://hackaday.com/tag/robotics/feed/','INSIGHTS','Approved RSS metadata only: title, date, categories and canonical URL.','Robotics and hardware news metadata with original links.',true,'B','RSS','ACTIVE','ALLOWED',2,.75,false),
  ('roboticstomorrow','RoboticsTomorrow','RoboticsTomorrow','https://www.roboticstomorrow.com/rss.php','INSIGHTS','Approved RSS metadata only: title, date, categories and canonical URL.','Robotics-industry news metadata and original links.',true,'B','RSS','ACTIVE','ALLOWED',2,.80,false),
  ('ieee-spectrum-robotics','IEEE Spectrum','IEEE','https://spectrum.ieee.org/feeds/feed.rss','INSIGHTS','Approved RSS metadata only. The general feed is filtered strictly for robotics relevance.','Selected robotics-news metadata and links to original IEEE Spectrum reporting.',true,'A','RSS','ACTIVE','ALLOWED',2,.85,false),
  ('robotsguide','RobotsGuide','RobotsGuide','https://robotsguide.com/feed/','INSIGHTS','Approved RSS metadata only: title, date, categories and canonical URL.','Robotics news metadata and links to original reporting.',true,'B','RSS','ACTIVE','ALLOWED',2,.75,false),
  ('aparobot','Aparobot','Aparobot','https://www.aparobot.com/articles','INSIGHTS','Editorial source record. The supplied URL is a listing rather than an RSS endpoint, so no automated collector is enabled until a compliant feed endpoint is reviewed.','Robotics editorial source pending a reviewed machine-readable feed.',false,'C','HTML','PROPOSED','UNKNOWN',2,.70,true)
ON CONFLICT (key) DO UPDATE SET display_name=EXCLUDED.display_name, homepage_url=EXCLUDED.homepage_url, admin_description=EXCLUDED.admin_description, public_description=EXCLUDED.public_description, updated_at=now();

INSERT INTO source_contracts (source_key,canonical_endpoint,access_mode,legal_basis,allowed_fields,allowed_operations,raw_retention_policy,publication_policy,rate_limit_strategy,stable_id_strategy,parser_version,schema_version)
SELECT key, homepage_url, 'RSS_METADATA', 'Operator-approved RSS metadata discovery: retain title, date, categories and canonical URL only.', '["title","published_at","categories","canonical_url"]', '["metadata_discovery","deduplication"]', 'No raw RSS, HTML, images, excerpts or article bodies retained.', 'Only high-relevance July 2026+ metadata; link to original.', 'Maximum two requests per minute, one request per feed per run.', 'Canonical URL', 'rss-metadata-v2', '2'
FROM sources WHERE key IN ('techcrunch-robotics','hackaday-robotics','roboticstomorrow','ieee-spectrum-robotics','robotsguide')
AND NOT EXISTS (SELECT 1 FROM source_contracts c WHERE c.source_key=sources.key);

UPDATE scheduled_agents
SET source_keys='["techcrunch-robotics","hackaday-robotics","roboticstomorrow","techxplore-robotics","ieee-spectrum-robotics","robohub","robotics-automation-news","robotics-247","the-robot-report","robotsguide","humanoid-guide-news"]'::jsonb,
    description='Collects July 2026+ robotics-news metadata from approved RSS feeds, filters for high relevance, checks canonical URLs and same-story title/date similarity, and logs every publish, duplicate, irrelevant item, or source error. It never stores RSS HTML or images.',
    updated_at=now()
WHERE agent_key='insights-metadata-collector';

UPDATE scheduled_agents
SET source_keys='["techcrunch-robotics","hackaday-robotics","roboticstomorrow","techxplore-robotics","ieee-spectrum-robotics","robohub","robotics-automation-news","robotics-247","the-robot-report","robotsguide","humanoid-guide-news"]'::jsonb,
    description='Creates an original list preview and detailed summary from transient article text. If AI output is unavailable or invalid, publishes a clearly marked metadata-only fallback and logs it for retry. Raw article HTML is never stored.',
    updated_at=now()
WHERE agent_key='insights-summary-writer';
