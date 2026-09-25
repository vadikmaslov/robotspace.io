-- Phase 2A Step 5: Market Readiness, Submissions & Quotes

-- metric_definitions for Market analytics
CREATE TABLE metric_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description_en TEXT NOT NULL,
    formula_version VARCHAR(50) NOT NULL,
    min_sources INTEGER NOT NULL DEFAULT 3,
    min_observations INTEGER NOT NULL DEFAULT 30,
    freshness_hours INTEGER DEFAULT 720,
    publish_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.80,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- metric_observations
CREATE TABLE metric_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_id uuid NOT NULL REFERENCES metric_definitions(id) ON DELETE RESTRICT,
    dimensions_json JSONB NOT NULL,
    value_numeric DECIMAL(18,6),
    unit VARCHAR(20),
    observed_at timestamptz(6) NOT NULL,
    confidence DECIMAL(4,2) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_obs ON metric_observations(metric_id, observed_at);

-- readiness_snapshots for Market/Map features
CREATE TABLE readiness_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature VARCHAR(20) NOT NULL CHECK (feature IN ('MARKET','MAP')),
    coverage_metrics JSONB NOT NULL,
    required_thresholds JSONB NOT NULL,
    is_ready BOOLEAN NOT NULL DEFAULT false,
    blockers_json JSONB NOT NULL DEFAULT '[]',
    calculated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_readiness_feature_date ON readiness_snapshots(feature, calculated_at);

-- comparison_snapshots (immutable share records, TTL 30 days default)
CREATE TABLE comparison_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id VARCHAR(32) NOT NULL UNIQUE,
    robot_entity_ids JSONB NOT NULL,
    category_schema_version VARCHAR(50) NOT NULL,
    taxonomy_schema_version VARCHAR(50) NOT NULL,
    rendered_values_json JSONB NOT NULL,
    policy_revision BIGINT NOT NULL DEFAULT 1,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    expires_at timestamptz(6) NOT NULL
);
CREATE INDEX idx_comp_snap_expires ON comparison_snapshots(expires_at);

-- submissions (user-provided robot/company data)
CREATE TABLE submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(30) NOT NULL CHECK (type IN ('ROBOT','COMPANY','UPDATE')),
    payload_json JSONB NOT NULL,
    submitter_email VARCHAR(255),
    source_urls JSONB DEFAULT '[]',
    captcha_result TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSING','AUTO_ACCEPTED','EXCEPTION','REJECTED')),
    linked_entity_id uuid,
    agent_run_id uuid,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    processed_at timestamptz(6)
);
CREATE INDEX idx_submissions_status ON submissions(status, created_at);

-- quote_requests (B2B inquiries with PII)
CREATE TABLE quote_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_entity_id uuid,
    company_entity_id uuid,
    contact_name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    email_verification_status VARCHAR(30) NOT NULL DEFAULT 'UNVERIFIED',
    phone VARCHAR(50),
    country CHAR(2),
    message TEXT,
    consent_version VARCHAR(50) NOT NULL,
    consent_timestamp timestamptz(6) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','SENT','IN_PROGRESS','CLOSED','SPAM')),
    notification_sent BOOLEAN NOT NULL DEFAULT false,
    spam_score DECIMAL(4,2),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    sent_at timestamptz(6)
);
CREATE INDEX idx_quotes_status ON quote_requests(status, created_at);
CREATE INDEX idx_quotes_email_verify ON quote_requests(email_verification_status);
