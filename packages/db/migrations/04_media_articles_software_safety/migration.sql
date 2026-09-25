-- Phase 2A Step 4: Media, Documents, Articles & Software Safety

-- media_assets
CREATE TABLE media_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('ROBOT','ROBOT_VARIANT','COMPANY')),
    entity_id uuid NOT NULL,
    s3_key VARCHAR(2000) NOT NULL,
    original_url VARCHAR(2000),
    source_landing_url VARCHAR(2000),
    mime_type VARCHAR(100),
    size_bytes BIGINT,
    width INTEGER,
    height INTEGER,
    hash_sha256 VARCHAR(64),
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('IMAGE','VIDEO','DOCUMENT','ICON')),
    license_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN' CHECK (license_status IN ('ALLOWED','UNKNOWN','RESTRICTED_RISK','TAKEDOWN')),
    owner VARCHAR(255),
    author VARCHAR(255),
    attribution TEXT,
    license_url VARCHAR(2000),
    checked_at timestamptz(6),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    hidden_at timestamptz(6),
    takedown_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_entity ON media_assets(entity_type, entity_id);
CREATE INDEX idx_media_primary ON media_assets(is_primary);
CREATE INDEX idx_media_license_type ON media_assets(license_status, media_type);

-- documents
CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('ROBOT','ROBOT_VARIANT','COMPANY')),
    entity_id uuid NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('DATASHEET','MANUAL','CERTIFICATE','CASE_STUDY','OTHER')),
    source_url VARCHAR(2000) NOT NULL,
    s3_key VARCHAR(2000),
    legal_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    language CHAR(2) NOT NULL DEFAULT 'en',
    version VARCHAR(50),
    published_date timestamptz(6),
    hash_sha256 VARCHAR(64),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);

-- articles
CREATE TABLE articles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(100) REFERENCES sources(key) ON DELETE RESTRICT,
    external_id VARCHAR(255),
    guid VARCHAR(500),
    canonical_url VARCHAR(2000) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    authors TEXT,
    published_at timestamptz(6) NOT NULL,
    categories JSONB,
    language CHAR(2) NOT NULL DEFAULT 'en',
    metadata_hash VARCHAR(64),
    full_text_storage_allowed BOOLEAN NOT NULL DEFAULT true,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_articles_source_pub ON articles(source_id, published_at);
CREATE INDEX idx_articles_fulltext_allowed ON articles(full_text_storage_allowed);

-- article_previews
CREATE TABLE article_previews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id uuid NOT NULL,
    preview_en TEXT NOT NULL,
    generation_mode VARCHAR(20) NOT NULL DEFAULT 'METADATA_ONLY' CHECK (generation_mode IN ('METADATA_ONLY','SOURCE_EXCERPT','TRANSIENT_FULL_TEXT')),
    request_id uuid,
    prompt_version VARCHAR(50),
    publication_confidence DECIMAL(4,2),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_previews_article ON article_previews(article_id);

-- publications (arXiv/Crossref/OpenAlex)
CREATE TABLE publications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    arxiv_id VARCHAR(50),
    openalex_id VARCHAR(50),
    crossref_doi VARCHAR(255) UNIQUE,
    title TEXT NOT NULL,
    abstract_ TEXT,
    pub_date timestamptz(6),
    citation_count INTEGER NOT NULL DEFAULT 0
);

-- entity_mentions linking articles to robots/companies
CREATE TABLE entity_mentions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id uuid,
    publication_id uuid,
    entity_type VARCHAR(30),
    entity_id uuid,
    mention_type VARCHAR(30),
    confidence DECIMAL(4,2),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_mentions_entity ON entity_mentions(entity_type, entity_id);

-- trend_snapshots for AI Trend Radar
CREATE TABLE trend_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_entity_type VARCHAR(30),
    target_entity_id uuid,
    window_start timestamptz(6) NOT NULL,
    window_end timestamptz(6) NOT NULL,
    raw_mention_count INTEGER NOT NULL DEFAULT 0,
    normalized_score DECIMAL(10,6),
    methodology_version VARCHAR(50),
    ai_narrative TEXT,
    publish_readiness BOOLEAN NOT NULL DEFAULT false,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_trends_target ON trend_snapshots(target_entity_type, target_entity_id, window_start);

-- software_packages
CREATE TABLE software_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name VARCHAR(255) NOT NULL,
    ecosystem VARCHAR(30) NOT NULL CHECK (ecosystem IN ('ROS','ISAAC','GAZEBO','VENDOR','OTHER')),
    repository_url VARCHAR(2000),
    homepage_url VARCHAR(2000),
    license_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    last_verified_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_sw_packages_name ON software_packages(canonical_name);

-- software_releases
CREATE TABLE software_releases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    software_id uuid NOT NULL REFERENCES software_packages(id) ON DELETE RESTRICT,
    version VARCHAR(100) NOT NULL,
    release_tag VARCHAR(100),
    release_date timestamptz(6),
    support_status VARCHAR(30) NOT NULL DEFAULT 'current'
);
CREATE UNIQUE INDEX uq_sw_release ON software_releases(software_id, version);

-- compatibility_claims (versioned relations, never simple booleans)
CREATE TABLE compatibility_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type VARCHAR(30) NOT NULL,
    subject_entity_id uuid NOT NULL,
    object_type VARCHAR(30) NOT NULL,
    object_entity_id uuid NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('SOFTWARE','COMPONENT','PROTOCOL','STANDARD','ACCESSORY')),
    subject_version_range VARCHAR(100),
    object_version_range VARCHAR(100),
    claim_status VARCHAR(20) NOT NULL DEFAULT 'CLAIMED' CHECK (claim_status IN ('CLAIMED','VERIFIED','DEPRECATED','UNKNOWN')),
    evidence_url VARCHAR(2000),
    checked_at timestamptz(6),
    confidence DECIMAL(4,2),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_compat_subject ON compatibility_claims(subject_type, subject_entity_id);
CREATE INDEX idx_compat_object ON compatibility_claims(object_type, object_entity_id);

-- certifications
CREATE TABLE certifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL,
    entity_id uuid NOT NULL,
    authority VARCHAR(255) NOT NULL,
    certification_type VARCHAR(30) NOT NULL,
    certificate_id VARCHAR(255),
    issued_at timestamptz(6) NOT NULL,
    expires_at timestamptz(6),
    status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    evidence_url VARCHAR(2000),
    confidence DECIMAL(4,2),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_certs_entity ON certifications(entity_type, entity_id);

-- safety_notices & recalls
CREATE TABLE safety_notices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    regulator VARCHAR(255) NOT NULL,
    external_notice_id VARCHAR(255),
    notice_type VARCHAR(30) NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    hazard TEXT,
    remedy TEXT,
    issued_at timestamptz(6) NOT NULL,
    updated_at timestamptz(6),
    jurisdiction CHAR(2),
    source_url VARCHAR(2000),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX idx_safety_type_date ON safety_notices(notice_type, issued_at);

CREATE TABLE recalls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    safety_notice_id uuid NOT NULL REFERENCES safety_notices(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    recall_at timestamptz(6) NOT NULL,
    matching_confidence DECIMAL(4,2),
    evidence_url VARCHAR(2000),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
