-- A short lived GitHub token is used only while a person confirms repository control.
CREATE TABLE registry_login_grants (
  user_id uuid PRIMARY KEY REFERENCES registry_users(id) ON DELETE RESTRICT,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  expires_at timestamptz(6) NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX registry_login_grants_expiry ON registry_login_grants(expires_at);

CREATE TABLE registry_claim_attempts (
  user_id uuid NOT NULL REFERENCES registry_users(id) ON DELETE RESTRICT,
  window_start timestamptz(6) NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX registry_claim_attempts_window ON registry_claim_attempts(window_start);
