CREATE TABLE content_jobs (
  id uuid PRIMARY KEY,
  collection_id text NOT NULL,
  collection_key text NOT NULL,
  action text NOT NULL CHECK(action IN('batch','publication','extension')),
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  document_id uuid,
  expected_revision integer CHECK(expected_revision>0),
  version_id uuid,
  handler_name text,
  source_operation text NOT NULL,
  requested_version_id uuid,
  result_revision_id uuid,
  execute_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','succeeded','partial','failed','cancelled')),
  owner uuid,
  generation integer NOT NULL DEFAULT 0 CHECK(generation>=0),
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY(version_id,document_id,collection_id) REFERENCES content_revisions(id,document_id,collection_id) ON DELETE RESTRICT,
  CHECK((status='running' AND owner IS NOT NULL AND lease_until IS NOT NULL) OR (status<>'running' AND owner IS NULL AND lease_until IS NULL)),
  CHECK((status IN('succeeded','partial','failed','cancelled') AND finished_at IS NOT NULL) OR (status IN('queued','running') AND finished_at IS NULL)),
  CHECK(action<>'publication' OR (document_id IS NOT NULL AND expected_revision IS NOT NULL)),
  CHECK(action<>'extension' OR (document_id IS NOT NULL AND handler_name IS NOT NULL))
);
CREATE INDEX content_jobs_due_idx ON content_jobs(status,execute_at,lease_until,id);
CREATE INDEX content_jobs_document_idx ON content_jobs(document_id,status);
CREATE TABLE content_job_items (
  job_id uuid NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK(position>=0),
  document_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK(expected_revision>0),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','succeeded','failed','cancelled')),
  result_document_id uuid,
  result_revision_id uuid,
  error_code text,
  PRIMARY KEY(job_id,position),
  CHECK((status IN('queued','cancelled') AND error_code IS NULL AND result_document_id IS NULL AND result_revision_id IS NULL) OR (status='succeeded' AND error_code IS NULL AND result_document_id IS NOT NULL) OR (status='failed' AND error_code IS NOT NULL AND result_document_id IS NULL AND result_revision_id IS NULL))
);
