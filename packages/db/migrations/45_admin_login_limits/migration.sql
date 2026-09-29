CREATE TABLE admin_login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_login_limits_expiry ON admin_login_limits(expires_at);
