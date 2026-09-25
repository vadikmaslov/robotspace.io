-- Phase 2A Step 2: Core Entities, Taxonomy & Companies
-- entities: unified base table for all domain entities
CREATE TABLE entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('ROBOT', 'ROBOT_VARIANT', 'COMPANY')),
    slug VARCHAR(255) NOT NULL UNIQUE,
    publication_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN ('DRAFT', 'PUBLISHED', 'HIDDEN')),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    archived_at timestamptz(6),
    superseded_by_entity_id uuid REFERENCES entities(id) ON UPDATE CASCADE
);
CREATE INDEX idx_entities_type_pub_archived ON entities(entity_type, publication_status, archived_at);
CREATE INDEX idx_entities_slug ON entities(slug);

-- robots: system metadata only (canonical fields via assertions)
CREATE TABLE robots (
    entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    created_by VARCHAR(255),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- robot_variants: model code/generation/lifecycle per variant
CREATE TABLE robot_variants (
    entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    robot_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'HIDDEN'))
);
CREATE INDEX idx_robot_variants_parent ON robot_variants(robot_entity_id);

-- categories with self-referencing tree
CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    name_en VARCHAR(255) NOT NULL,
    description_en TEXT,
    icon_key VARCHAR(50),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    updated_at timestamptz(6) NOT NULL DEFAULT now(),
    archived_at timestamptz(6)
);
CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_active_sort ON categories(is_active, sort_order);

-- taxonomy_schema_versions
CREATE TABLE taxonomy_schema_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number BIGINT NOT NULL UNIQUE,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
    published_at timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    created_by VARCHAR(255)
);
CREATE INDEX idx_taxonomy_versions_status_num ON taxonomy_schema_versions(status, version_number);

-- category_schema_versions
CREATE TABLE category_schema_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    taxonomy_schema_version_id uuid NOT NULL REFERENCES taxonomy_schema_versions(id) ON DELETE RESTRICT,
    category_local_version BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
    published_at timestamptz(6),
    compatibility_group VARCHAR(20) NOT NULL DEFAULT 'COMPATIBLE',
    compatibility_version VARCHAR(50),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_category_schema_ver ON category_schema_versions(category_id, category_local_version);
CREATE INDEX idx_cat_schema_taxonomy ON category_schema_versions(taxonomy_schema_version_id, category_id);

-- attribute_definitions: logical identity, immutable key
CREATE TABLE attribute_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- attribute_definition_versions
CREATE TABLE attribute_definition_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_definition_id uuid NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    taxonomy_schema_version_id uuid NOT NULL REFERENCES taxonomy_schema_versions(id) ON DELETE RESTRICT,
    label_en VARCHAR(255) NOT NULL,
    description_en TEXT,
    data_type VARCHAR(30) NOT NULL CHECK (data_type IN ('NUMBER','INTEGER','BOOLEAN','ENUM','TEXT','DATE','RANGE')),
    dimension VARCHAR(20) NOT NULL DEFAULT 'NONE' CHECK (dimension IN ('MASS','LENGTH','SPEED','TIME','ANGLE','TEMPERATURE','CURRENCY','NONE')),
    canonical_unit VARCHAR(20),
    enum_options_json JSONB,
    is_filterable BOOLEAN NOT NULL DEFAULT false,
    is_sortable BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_comparable BOOLEAN NOT NULL DEFAULT true,
    higher_is_better BOOLEAN,
    validation_schema_json JSONB,
    absolute_tolerance DECIMAL(10,6),
    relative_tolerance DECIMAL(10,6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_attr_def_schema ON attribute_definition_versions(attribute_definition_id, taxonomy_schema_version_id);
CREATE INDEX idx_attr_def_schema ON attribute_definition_versions(taxonomy_schema_version_id);

-- category_attributes: which attributes apply to which category versions
CREATE TABLE category_attributes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_schema_version_id uuid NOT NULL REFERENCES category_schema_versions(id) ON DELETE RESTRICT,
    attribute_definition_version_id uuid NOT NULL REFERENCES attribute_definition_versions(id) ON DELETE RESTRICT,
    is_required_for_publish BOOLEAN NOT NULL DEFAULT false,
    is_required_for_compare BOOLEAN NOT NULL DEFAULT false,
    display_group VARCHAR(100),
    display_order INTEGER NOT NULL DEFAULT 0,
    public_confidence_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.90
);
CREATE UNIQUE INDEX uq_cat_attr ON category_attributes(category_schema_version_id, attribute_definition_version_id);

-- companies base table
CREATE TABLE companies (
    entity_id uuid PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT
);

-- company_types
CREATE TABLE company_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name VARCHAR(30) NOT NULL UNIQUE,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- company_type_assignments
CREATE TABLE company_type_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
    company_type_id uuid NOT NULL REFERENCES company_types(id) ON DELETE RESTRICT,
    assigned_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_company_type ON company_type_assignments(company_entity_id, company_type_id);
