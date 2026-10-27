ALTER TABLE content_documents
  ADD COLUMN created_by uuid REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN updated_by uuid REFERENCES admins(id) ON DELETE SET NULL;
UPDATE content_documents d SET
  created_by=(SELECT a.id FROM content_revisions r JOIN admins a ON a.id=r.actor_id WHERE r.document_id=d.id AND r.revision=1),
  updated_by=(SELECT a.id FROM content_revisions r JOIN admins a ON a.id=r.actor_id WHERE r.id=d.current_version_id);
CREATE INDEX content_documents_created_by_idx ON content_documents(collection_id,created_by,id);
CREATE INDEX content_documents_updated_by_idx ON content_documents(collection_id,updated_by,id);
