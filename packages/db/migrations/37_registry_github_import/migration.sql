CREATE TABLE registry_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_url varchar(2000) NOT NULL UNIQUE CHECK (repository_url ~ '^https://github\.com/[^/]+/[^/]+$'),
  repository_id bigint UNIQUE,
  project_id uuid REFERENCES software_packages(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','FETCHING','IMPORTED','RATE_LIMITED','FAILED','REJECTED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 10),
  next_retry_at timestamptz(6),
  last_error_code varchar(80),
  last_error_message varchar(500),
  manifest_version integer,
  metadata_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX registry_imports_state_retry ON registry_imports(state, next_retry_at);
