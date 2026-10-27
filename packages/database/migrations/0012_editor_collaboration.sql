CREATE TABLE content_document_leases (
  document_id uuid PRIMARY KEY REFERENCES content_documents(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  display_name varchar(64),
  editor_id uuid NOT NULL,
  locale varchar(32) NOT NULL,
  generation integer NOT NULL CHECK (generation > 0),
  expires_at timestamptz NOT NULL
);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM asset_uploads WHERE status IN('pending','uploading','processing','ready'))
     OR EXISTS(SELECT 1 FROM asset_jobs WHERE status IN('queued','running')) THEN
    RAISE EXCEPTION 'Drain asset uploads and processing jobs before applying editor collaboration';
  END IF;
END $$;
ALTER TABLE asset_uploads ADD COLUMN authorization_locale varchar(32);
ALTER TABLE asset_uploads ADD CONSTRAINT asset_uploads_authorization_locale_check CHECK (
  authorization_locale IS NOT NULL OR status IN('consumed','failed','cancelled','expired')
);
