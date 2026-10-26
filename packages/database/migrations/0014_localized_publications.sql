CREATE TABLE content_publications (
  document_id uuid NOT NULL,
  collection_id text NOT NULL,
  locale text NOT NULL,
  version_id uuid NOT NULL,
  PRIMARY KEY (document_id, locale),
  CONSTRAINT content_publication_locale_check CHECK (locale = '*' OR locale ~ '^[a-zA-Z][a-zA-Z0-9-]{0,31}$'),
  CONSTRAINT content_publication_document_fk FOREIGN KEY (document_id, collection_id) REFERENCES content_documents(id, collection_id) ON DELETE CASCADE,
  CONSTRAINT content_publication_revision_fk FOREIGN KEY (version_id, document_id, collection_id) REFERENCES content_revisions(id, document_id, collection_id) ON DELETE RESTRICT
);
CREATE INDEX content_publications_version_idx ON content_publications(version_id);
INSERT INTO content_publications(document_id,collection_id,locale,version_id)
SELECT id,collection_id,'*',published_version_id FROM content_documents WHERE published_version_id IS NOT NULL;
ALTER TABLE content_documents DROP CONSTRAINT content_published_version_fk;
ALTER TABLE content_documents DROP COLUMN published_version_id;
UPDATE content_job_items i SET payload=jsonb_set(i.payload,'{action}','"publish"'::jsonb)
FROM content_jobs j WHERE i.job_id=j.id AND j.action='publication';
