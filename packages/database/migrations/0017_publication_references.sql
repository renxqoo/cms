ALTER TABLE content_publications ADD COLUMN completed_schema_versions integer[] NOT NULL DEFAULT '{}';
ALTER TABLE content_publications ADD COLUMN locale_schema_version integer;
UPDATE content_publications p SET locale_schema_version=c.schema_version FROM content_schema_control c WHERE c.collection_id=p.collection_id;
ALTER TABLE content_publications ALTER COLUMN locale_schema_version SET NOT NULL;
ALTER TABLE content_publications ADD CONSTRAINT content_publications_locale_schema_version_check CHECK (locale_schema_version > 0);
CREATE TABLE content_publication_references (
  source_document_id uuid NOT NULL,
  source_collection_id text NOT NULL,
  publication_locale text NOT NULL,
  source_revision_id uuid NOT NULL,
  projection_schema_version integer NOT NULL CHECK (projection_schema_version > 0),
  field_id text NOT NULL,
  source_path text NOT NULL,
  target_document_id uuid NOT NULL,
  target_collection_id text NOT NULL,
  on_delete text NOT NULL CHECK (on_delete IN ('restrict','nullify','cascade')),
  media boolean NOT NULL,
  PRIMARY KEY (source_document_id,publication_locale,projection_schema_version,source_path,target_document_id),
  FOREIGN KEY (source_document_id,publication_locale) REFERENCES content_publications(document_id,locale) ON DELETE CASCADE,
  FOREIGN KEY (source_revision_id,source_document_id,source_collection_id) REFERENCES content_revisions(id,document_id,collection_id) ON DELETE RESTRICT,
  FOREIGN KEY (target_document_id,target_collection_id) REFERENCES content_documents(id,collection_id) ON DELETE RESTRICT
);
CREATE INDEX content_publication_references_target_idx ON content_publication_references(target_document_id,target_collection_id);
