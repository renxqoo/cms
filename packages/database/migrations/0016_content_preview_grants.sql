CREATE TABLE content_preview_grants (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  issuer_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  collection_id text NOT NULL,
  document_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  locale text NOT NULL,
  client_origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT content_preview_revision_fk FOREIGN KEY (revision_id,document_id,collection_id) REFERENCES content_revisions(id,document_id,collection_id) ON DELETE CASCADE,
  CONSTRAINT content_preview_lifetime CHECK (expires_at>created_at AND expires_at<=created_at+interval '600 seconds'),
  CONSTRAINT content_preview_locale CHECK (locale~'^[a-zA-Z][a-zA-Z0-9-]{0,31}$'),
  CONSTRAINT content_preview_digest CHECK (token_hash~'^[0-9a-f]{64}$')
);
CREATE INDEX content_preview_grants_expiry_idx ON content_preview_grants(expires_at,id);
CREATE INDEX content_preview_grants_issuer_idx ON content_preview_grants(issuer_id,expires_at) WHERE revoked_at IS NULL;
