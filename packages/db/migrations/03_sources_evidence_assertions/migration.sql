-- Phase 2A Step 3: Source Registry & Contracts

CREATE TABLE sources (
    key VARCHAR(100) PRIMARY KEY,
    owner_name VARCHAR(255),
    tier VARCHAR(1) NOT NULL DEFAULT 'D' CHECK (tier IN ('A','B','C','D')),
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('API','RSS','SPARQL','SITEMAP','HTML','FILE_FEED','SUBMIT','MANUAL')),
    status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','ACTIVE','PAUSED','DISABLED','BROKEN')),
    legal_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (legal_status IN ('ALLOWED','UNKNOWN','RESTRICTED_RISK','TAKEDOWN')),
    risk_acknowledged_by VARCHAR(255),
    risk_acknowledged_at timestamptz(6),
    schedule VARCHAR(100),
    rate_limit_rpm INTEGER DEFAULT 10,
    trust_default_confidence DECIMAL(4,2) NOT NULL DEFAULT 0.50,
    kill_switch BOOLEAN NOT NULL DEFAULT false,
    policy_revision BIGINT NOT NULL DEFAULT 1,
    last_success_at timestamptz(6),
    last_error_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_status_legal ON sources(status, legal_status);
CREATE INDEX idx_sources_kill_switch ON sources(kill_switch);

-- source_contracts
CREATE TABLE source_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key VARCHAR(100) REFERENCES sources(key) ON DELETE RESTRICT,
    owner_contact VARCHAR(255),
    canonical_endpoint VARCHAR(2000) NOT NULL,
    access_mode VARCHAR(50) NOT NULL,
    legal_basis TEXT NOT NULL,
    terms_url VARCHAR(2000),
    terms_checked_at timestamptz(6),
    terms_content_hash VARCHAR(64),
    allowed_fields JSONB NOT NULL,
    allowed_operations JSONB NOT NULL,
    raw_retention_policy VARCHAR(100) NOT NULL,
    publication_policy TEXT NOT NULL,
    credential_binding_id uuid,
    rate_limit_strategy VARCHAR(100),
    stable_id_strategy VARCHAR(100),
    cursor_or_watermark VARCHAR(100),
    parser_version VARCHAR(20),
    schema_version VARCHAR(20),
    freshness_sla_hours INTEGER DEFAULT 30,
    confidence_caps_by_field JSONB,
    derived_from_sources JSONB DEFAULT '[]',
    attribution_template TEXT,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_source_contracts_key ON source_contracts(source_key);

-- source_credentials (encrypted)
CREATE TABLE source_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) REFERENCES sources(key) ON DELETE RESTRICT,
    credential_type VARCHAR(20) NOT NULL CHECK (credential_type IN ('API_KEY','BEARER','BASIC','OAUTH2_CLIENT','SFTP')),
    encrypted_payload BYTEA NOT NULL,
    nonce_auth_tag BYTEA NOT NULL,
    integration_key_version VARCHAR(10) NOT NULL DEFAULT 'v1',
    safe_label VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ROTATING','REVOKED','INVALID')),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    last_tested_at timestamptz(6),
    revoked_at timestamptz(6)
);

-- source_credential_bindings
CREATE TABLE source_credential_bindings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id uuid REFERENCES source_contracts(id) ON DELETE RESTRICT,
    credential_id uuid REFERENCES source_credentials(id) ON DELETE RESTRICT,
    normalized_origin VARCHAR(1000),
    allowed_path_prefix VARCHAR(500),
    auth_mechanism VARCHAR(50),
    active_from timestamptz(6) NOT NULL DEFAULT now(),
    active_until timestamptz(6),
    is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_cred_binding ON source_credential_bindings(contract_id, credential_id, auth_mechanism);

-- source_records
CREATE TABLE source_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) REFERENCES sources(key) ON DELETE RESTRICT,
    external_id VARCHAR(255),
    canonical_url VARCHAR(2000) NOT NULL,
    source_revision VARCHAR(100),
    payload_hash VARCHAR(64),
    first_seen_at timestamptz(6) NOT NULL DEFAULT now(),
    last_seen_at timestamptz(6) NOT NULL,
    parse_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    raw_snapshot_id uuid
);
CREATE UNIQUE INDEX uq_source_record ON source_records(source_id, external_id, source_revision);
CREATE INDEX idx_source_records_src_parse ON source_records(source_id, parse_status);
CREATE INDEX idx_source_records_url ON source_records(canonical_url);

-- evidence_origins
CREATE TABLE evidence_origins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_key VARCHAR(500) NOT NULL UNIQUE,
    origin_type VARCHAR(50) NOT NULL,
    primary_owner VARCHAR(255),
    primary_source_id uuid,
    first_observed_at timestamptz(6) NOT NULL DEFAULT now(),
    last_observed_at timestamptz(6) NOT NULL
);
CREATE INDEX idx_evidence_origin_key ON evidence_origins(origin_key);

-- evidence_dependency_graph_versions
CREATE TABLE evidence_dependency_graph_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number BIGINT NOT NULL UNIQUE,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
    published_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_edgv_status_num ON evidence_dependency_graph_versions(status, version_number);

-- evidence_dependency_edges
CREATE TABLE evidence_dependency_edges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    graph_version_id uuid NOT NULL REFERENCES evidence_dependency_graph_versions(id) ON DELETE RESTRICT,
    child_origin_id uuid NOT NULL REFERENCES evidence_origins(id) ON DELETE SET NULL,
    parent_origin_id uuid NOT NULL REFERENCES evidence_origins(id) ON DELETE SET NULL,
    relation VARCHAR(30) NOT NULL,
    created_metadata JSONB,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_edge ON evidence_dependency_edges(graph_version_id, child_origin_id, parent_origin_id, relation);
CREATE INDEX idx_edges_graph_child ON evidence_dependency_edges(graph_version_id, child_origin_id);
