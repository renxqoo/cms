CREATE TABLE asset_objects (
  id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK(state IN('pending','ready','deleting','deleted')),
  digest char(64),
  bytes bigint,
  mime_type text,
  retain_until timestamptz NOT NULL,
  write_deadline timestamptz,
  next_cleanup_at timestamptz,
  cleanup_attempts integer NOT NULL DEFAULT 0 CHECK(cleanup_attempts>=0),
  cleanup_failure_code text,
  cleanup_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(bytes IS NULL OR bytes>0),
  CHECK((state='pending') OR (digest IS NOT NULL AND bytes IS NOT NULL AND mime_type IS NOT NULL) OR state IN('deleting','deleted'))
);
CREATE INDEX asset_objects_cleanup_idx ON asset_objects(state,next_cleanup_at,retain_until);
CREATE TABLE asset_manifests (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK(bytes>0),
  digest char(64) NOT NULL,
  width integer,
  height integer,
  orientation integer,
  processor_version text NOT NULL,
  recipe jsonb NOT NULL,
  state text NOT NULL CHECK(state IN('ready','deleting','deleted')),
  retain_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX asset_manifests_retention_idx ON asset_manifests(state,retain_until);
CREATE TABLE asset_manifest_objects (
  manifest_id uuid NOT NULL REFERENCES asset_manifests(id) ON DELETE RESTRICT,
  object_id uuid NOT NULL REFERENCES asset_objects(id) ON DELETE RESTRICT,
  name text NOT NULL,
  width integer,
  height integer,
  PRIMARY KEY(manifest_id,name),
  UNIQUE(manifest_id,object_id)
);
CREATE INDEX asset_manifest_objects_object_idx ON asset_manifest_objects(object_id);
CREATE TABLE asset_uploads (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  collection_key text NOT NULL,
  purpose text NOT NULL CHECK(purpose IN('create','replace')),
  document_id uuid,
  expected_revision integer,
  filename text NOT NULL,
  declared_type text NOT NULL,
  declared_bytes bigint NOT NULL CHECK(declared_bytes>0),
  settings jsonb NOT NULL,
  status text NOT NULL CHECK(status IN('pending','uploading','processing','ready','consumed','failed','cancelled','expired')),
  expires_at timestamptz NOT NULL,
  generation integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  manifest_id uuid REFERENCES asset_manifests(id) ON DELETE RESTRICT,
  bound_document_id uuid,
  bound_revision_id uuid,
  original_object_id uuid REFERENCES asset_objects(id) ON DELETE RESTRICT,
  failure_code text,
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((purpose='create' AND document_id IS NULL AND expected_revision IS NULL) OR (purpose='replace' AND document_id IS NOT NULL AND expected_revision>0)),
  CHECK(status NOT IN('ready','consumed') OR manifest_id IS NOT NULL)
);
CREATE INDEX asset_uploads_expiry_idx ON asset_uploads(status,expires_at);
CREATE INDEX asset_uploads_actor_idx ON asset_uploads(actor_id,collection_key,created_at);
CREATE TABLE asset_references (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL,
  document_id uuid NOT NULL,
  collection_key text NOT NULL,
  source_path text NOT NULL,
  media_document_id uuid NOT NULL REFERENCES content_documents(id) ON DELETE RESTRICT,
  media_collection_key text NOT NULL,
  manifest_id uuid NOT NULL REFERENCES asset_manifests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(revision_id,source_path),
  FOREIGN KEY(revision_id,document_id) REFERENCES content_revisions(id,document_id) ON DELETE CASCADE
);
CREATE INDEX asset_references_manifest_idx ON asset_references(manifest_id);
CREATE INDEX asset_references_media_idx ON asset_references(media_document_id);
CREATE TABLE asset_jobs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  collection_key text NOT NULL,
  action text NOT NULL CHECK(action IN('process','reprocess')),
  upload_id uuid NOT NULL REFERENCES asset_uploads(id) ON DELETE RESTRICT,
  document_id uuid,
  expected_revision integer,
  recipe jsonb NOT NULL,
  status text NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled')),
  owner uuid,
  generation integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  failure_code text,
  manifest_id uuid REFERENCES asset_manifests(id) ON DELETE RESTRICT,
  next_run_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  CHECK((status='running' AND owner IS NOT NULL AND lease_until IS NOT NULL) OR status<>'running')
);
ALTER TABLE asset_uploads ADD CONSTRAINT asset_uploads_job_fk FOREIGN KEY(job_id) REFERENCES asset_jobs(id) ON DELETE RESTRICT;
CREATE INDEX asset_jobs_claim_idx ON asset_jobs(status,next_run_at,lease_until);
CREATE TABLE asset_job_objects (
  job_id uuid NOT NULL REFERENCES asset_jobs(id) ON DELETE RESTRICT,
  generation integer NOT NULL,
  object_id uuid NOT NULL REFERENCES asset_objects(id) ON DELETE RESTRICT,
  PRIMARY KEY(job_id,generation,object_id)
);
