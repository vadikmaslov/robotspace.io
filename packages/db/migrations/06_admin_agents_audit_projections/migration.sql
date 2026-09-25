-- Phase 2A Step 6: Admin Users, Operations & Audit Logs

-- admin_users (bootstrap from BOOTSTRAP_ADMIN_EMAIL)
CREATE TABLE admin_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','HIDDEN')),
    email_verified_at timestamptz(6),
    created_by_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
    last_login_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- ingestion_runs (PostgreSQL-backed job queue records)
CREATE TABLE ingestion_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) NOT NULL REFERENCES sources(key) ON DELETE RESTRICT,
    schedule_revision BIGINT,
    cursor_revision BIGINT,
    policy_revision BIGINT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    state VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (state IN ('SCHEDULED','RUNNING','SUCCEEDED','PARTIAL','FAILED','CANCELLED')),
    lease_owner VARCHAR(255),
    lease_expires timestamptz(6),
    heartbeat_at timestamptz(6),
    discovered_count INTEGER NOT NULL DEFAULT 0,
    fetched_count INTEGER NOT NULL DEFAULT 0,
    unchanged_count INTEGER NOT NULL DEFAULT 0,
    parsed_count INTEGER NOT NULL DEFAULT 0,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    quarantined_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    started_at timestamptz(6) NOT NULL DEFAULT now(),
    finished_at timestamptz(6),
    error_code VARCHAR(50)
);
CREATE INDEX idx_ingestion_state_date ON ingestion_runs(state, started_at);
CREATE INDEX idx_ingestion_src_state ON ingestion_runs(source_id, state);
CREATE INDEX idx_ingestion_idem ON ingestion_runs(idempotency_key);

-- agent_runs (AI agent operation records)
CREATE TABLE agent_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation VARCHAR(50) NOT NULL,
    entity_type VARCHAR(30),
    entity_id uuid,
    parent_run_id uuid,
    input_hash VARCHAR(64),
    output_schema_version VARCHAR(50),
    prompt_version VARCHAR(50),
    ai_request_id uuid,
    state VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','RUNNING','WAITING_RETRY','SUCCEEDED','FAILED','CANCELLED')),
    idempotency_key VARCHAR(100),
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    lease_owner VARCHAR(255),
    lease_expires timestamptz(6),
    result_assertion_id uuid,
    exception_id uuid,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    started_at timestamptz(6),
    finished_at timestamptz(6),
    error_code VARCHAR(50)
);
CREATE INDEX idx_agent_state_date ON agent_runs(state, created_at);
CREATE INDEX idx_agent_op_state ON agent_runs(operation, state);
CREATE INDEX idx_agent_parent ON agent_runs(parent_run_id);

-- ai_requests (usage tracking for budget monitoring)
CREATE TABLE ai_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id uuid,
    route_model_id uuid,
    route_provider VARCHAR(50),
    route_credential_version INTEGER DEFAULT 1,
    idempotency_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','RATE_LIMITED','AUTH_ERROR','CANCELLED')),
    input_hash VARCHAR(64),
    output_hash VARCHAR(64),
    tokens_used BIGINT NOT NULL DEFAULT 0,
    estimated_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
    latency_ms BIGINT,
    fallback_parent_id uuid,
    fallback_reason VARCHAR(100),
    error_code VARCHAR(50),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    started_at timestamptz(6),
    finished_at timestamptz(6)
);
CREATE INDEX idx_ai_status_date ON ai_requests(status, created_at);
CREATE INDEX idx_ai_provider_status ON ai_requests(route_provider, status);

-- exceptions (admin-only view of low-confidence/conflicts/errors)
CREATE TABLE exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_key VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    entity_type VARCHAR(30),
    entity_id uuid,
    run_id uuid,
    reason_summary TEXT NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','AUTO_RETRYING','WAITING_ADMIN','RESOLVED','DISMISSED')),
    resolution_actor VARCHAR(255),
    resolution_action VARCHAR(50),
    next_retry_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    resolved_at timestamptz(6)
);
CREATE INDEX idx_exceptions_state_sev ON exceptions(state, severity);
CREATE INDEX idx_exceptions_type_state ON exceptions(type, state);

-- notifications (email delivery tracking)
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    recipient_setting_key VARCHAR(50) NOT NULL,
    dedup_key VARCHAR(255) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','SENDING','SENT','FAILED','DEAD')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at timestamptz(6),
    template_version VARCHAR(20),
    provider_msg_id VARCHAR(255),
    sent_at timestamptz(6),
    error_timestamp timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_state_date ON notifications(state, created_at);
CREATE INDEX idx_notif_sev_state ON notifications(severity, state);

-- system_settings (editable config via admin UI)
CREATE TABLE system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value_json JSONB NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    optimistic_lock INTEGER NOT NULL DEFAULT 0,
    updated_by VARCHAR(255),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- feature_flags (runtime toggles)
CREATE TABLE feature_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'all',
    enabled BOOLEAN NOT NULL DEFAULT false,
    config_json JSONB NOT NULL DEFAULT '{}',
    policy_revision BIGINT NOT NULL DEFAULT 1,
    updated_by VARCHAR(255),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    UNIQUE(key, environment)
);

-- audit_logs (append-only, tamper-evident)
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp timestamptz(6) NOT NULL DEFAULT now(),
    actor_type VARCHAR(20) NOT NULL,
    actor_id VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(255),
    request_id uuid,
    before_hash VARCHAR(64),
    after_hash VARCHAR(64),
    safe_diff_json JSONB,
    prev_entry_hash VARCHAR(64),
    entry_hash VARCHAR(64)
);
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_ts ON audit_logs(timestamp DESC);

-- robot_public_projections (rebuildable query cache)
CREATE TABLE robot_public_projections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_entity_id uuid NOT NULL UNIQUE,
    canonical_name VARCHAR(255) NOT NULL,
    manufacturer_entity_id uuid,
    taxonomy_schema_version VARCHAR(50),
    category_id uuid,
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    release_date timestamptz(6),
    official_url VARCHAR(2000),
    summary TEXT,
    primary_media_id uuid,
    last_verified_at timestamptz(6),
    projection_hash VARCHAR(64),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);

-- company_public_projections (rebuildable query cache)
CREATE TABLE company_public_projections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_entity_id uuid NOT NULL UNIQUE,
    canonical_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    official_url VARCHAR(2000),
    country_code CHAR(2),
    founded_year INTEGER,
    summary TEXT,
    primary_media_id uuid,
    last_verified_at timestamptz(6),
    projection_hash VARCHAR(64),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);
