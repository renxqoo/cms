CREATE TABLE content_folders (
  id uuid PRIMARY KEY,
  collection_id text NOT NULL,
  parent_id uuid,
  name varchar(128) NOT NULL CHECK(length(btrim(name))>0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,collection_id),
  CHECK(parent_id IS NULL OR parent_id<>id),
  FOREIGN KEY(parent_id,collection_id) REFERENCES content_folders(id,collection_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX content_folders_siblings_uq ON content_folders(collection_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
CREATE TABLE content_documents (
  id uuid PRIMARY KEY,
  collection_id text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  current_version_id uuid,
  published_version_id uuid,
  trashed_at timestamptz,
  folder_id uuid,
  FOREIGN KEY(folder_id,collection_id) REFERENCES content_folders(id,collection_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,collection_id)
);
CREATE INDEX content_documents_collection_idx ON content_documents(collection_id,trashed_at,created_at,id);
CREATE TABLE content_revisions (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL,
  collection_id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  schema_version integer NOT NULL CHECK(schema_version>0),
  kind text NOT NULL,
  actor_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,document_id,collection_id),
  UNIQUE(id,document_id),
  UNIQUE(document_id,revision),
  FOREIGN KEY(document_id,collection_id) REFERENCES content_documents(id,collection_id) ON DELETE CASCADE
);
ALTER TABLE content_documents ADD CONSTRAINT content_current_version_fk FOREIGN KEY(current_version_id,id,collection_id) REFERENCES content_revisions(id,document_id,collection_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE content_documents ADD CONSTRAINT content_published_version_fk FOREIGN KEY(published_version_id,id,collection_id) REFERENCES content_revisions(id,document_id,collection_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX content_revisions_document_idx ON content_revisions(document_id,created_at,id);
CREATE TABLE content_references (
  source_revision_id uuid NOT NULL,
  source_document_id uuid NOT NULL,
  source_collection_id text NOT NULL,
  projection_schema_version integer NOT NULL CHECK(projection_schema_version>0),
  field_id text NOT NULL,
  source_path text NOT NULL,
  target_document_id uuid NOT NULL,
  target_collection_id text NOT NULL,
  on_delete text NOT NULL CHECK(on_delete IN('restrict','nullify','cascade')),
  media boolean NOT NULL,
  PRIMARY KEY(source_revision_id,projection_schema_version,source_path,target_document_id),
  FOREIGN KEY(source_revision_id,source_document_id,source_collection_id) REFERENCES content_revisions(id,document_id,collection_id) ON DELETE CASCADE,
  FOREIGN KEY(target_document_id,target_collection_id) REFERENCES content_documents(id,collection_id) ON DELETE RESTRICT
);
CREATE INDEX content_references_target_idx ON content_references(target_document_id,source_revision_id);
CREATE TABLE content_schema_manifests (
  fingerprint char(64) PRIMARY KEY,
  plan jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK(status IN('ready','preparing')),
  installed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE content_schema_control (
 collection_id text PRIMARY KEY,
 schema_version integer NOT NULL CHECK(schema_version>0),
 prepared_schema_version integer CHECK(prepared_schema_version>schema_version),
 prepared_fingerprint char(64)
);
CREATE TABLE content_schema_versions (
 collection_id text NOT NULL,
 schema_version integer NOT NULL CHECK(schema_version>0),
 data_fingerprint char(64) NOT NULL,
 PRIMARY KEY(collection_id,schema_version)
);
CREATE FUNCTION cms_register_content_schema(collection text,version integer,fingerprint text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO content_schema_versions(collection_id,schema_version,data_fingerprint) VALUES(collection,version,fingerprint) ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM content_schema_versions WHERE collection_id=collection AND schema_version=version AND data_fingerprint=fingerprint) THEN RAISE EXCEPTION 'content schema identity changed' USING ERRCODE='23514'; END IF;
END $$;
CREATE TABLE content_schema_backfills (
 revision_id uuid NOT NULL,
 document_id uuid NOT NULL,
 collection_id text NOT NULL,
 target_schema_version integer NOT NULL CHECK(target_schema_version>0),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(revision_id,target_schema_version),
 FOREIGN KEY(revision_id,document_id,collection_id) REFERENCES content_revisions(id,document_id,collection_id) ON DELETE CASCADE
);
CREATE TABLE content_schema_document_backfills (
 document_id uuid NOT NULL,
 collection_id text NOT NULL,
 target_schema_version integer NOT NULL CHECK(target_schema_version>0),
 revision integer NOT NULL CHECK(revision>=0),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,target_schema_version),
 FOREIGN KEY(document_id,collection_id) REFERENCES content_documents(id,collection_id) ON DELETE CASCADE
);
CREATE INDEX content_revisions_schema_idx ON content_revisions(collection_id,schema_version,id);
