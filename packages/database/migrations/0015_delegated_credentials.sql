CREATE TABLE oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  redirect_uris jsonb NOT NULL,
  grant_types text[] NOT NULL,
  scopes text[] NOT NULL,
  native boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  CHECK (jsonb_typeof(redirect_uris)='array'),
  CHECK (length(name)>0 AND length(name)<=80)
);

CREATE TABLE credential_grants (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES credential_grants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('api_key','oauth')),
  name text NOT NULL CHECK (length(name)>0 AND length(name)<=80),
  resource text NOT NULL CHECK (resource IN ('api','mcp')),
  client_id text REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  key_hash bytea UNIQUE,
  prefix text,
  grants jsonb NOT NULL CHECK (jsonb_typeof(grants)='array'),
  depth integer NOT NULL CHECK (depth>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  CHECK (expires_at>created_at),
  CHECK ((kind='api_key' AND key_hash IS NOT NULL AND octet_length(key_hash)=32 AND prefix IS NOT NULL AND client_id IS NULL AND resource='mcp') OR (kind='oauth' AND key_hash IS NULL AND prefix IS NULL AND client_id IS NOT NULL)),
  CHECK (parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX credential_grants_admin_idx ON credential_grants(admin_id,created_at,id);
CREATE INDEX credential_grants_parent_idx ON credential_grants(parent_id);
CREATE INDEX credential_grants_client_idx ON credential_grants(admin_id,client_id);
CREATE INDEX credential_grants_expiry_idx ON credential_grants(expires_at,id);

CREATE TABLE credential_tokens (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES credential_grants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('access','refresh')),
  resource text NOT NULL CHECK (resource IN ('api','mcp')),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at>created_at),
  CHECK (kind='refresh' OR consumed_at IS NULL)
);
CREATE INDEX credential_tokens_grant_idx ON credential_tokens(grant_id,kind,expires_at,id);
CREATE INDEX credential_tokens_expiry_idx ON credential_tokens(expires_at,id);

CREATE TABLE oauth_requests (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(id) ON DELETE RESTRICT,
  redirect_uri text NOT NULL,
  issuer text NOT NULL,
  resource_uri text NOT NULL,
  resource text NOT NULL CHECK (resource IN ('api','mcp')),
  scopes text[] NOT NULL,
  state text,
  code_challenge text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','denied','consumed')),
  code_hash bytea UNIQUE CHECK (code_hash IS NULL OR octet_length(code_hash)=32),
  grant_id uuid REFERENCES credential_grants(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK ((status='pending' AND code_hash IS NULL AND grant_id IS NULL) OR (status='denied' AND code_hash IS NULL AND grant_id IS NULL) OR (status IN ('approved','consumed') AND code_hash IS NOT NULL AND grant_id IS NOT NULL))
);
CREATE INDEX oauth_requests_expiry_idx ON oauth_requests(expires_at,id);
CREATE INDEX oauth_requests_grant_idx ON oauth_requests(grant_id);

ALTER TABLE content_jobs ADD COLUMN delegation_id uuid;
ALTER TABLE asset_uploads ADD COLUMN delegation_id uuid;
ALTER TABLE asset_jobs ADD COLUMN delegation_id uuid;
CREATE INDEX content_jobs_delegation_idx ON content_jobs(delegation_id) WHERE delegation_id IS NOT NULL;
CREATE INDEX asset_uploads_delegation_idx ON asset_uploads(delegation_id) WHERE delegation_id IS NOT NULL;
CREATE INDEX asset_jobs_delegation_idx ON asset_jobs(delegation_id) WHERE delegation_id IS NOT NULL;
