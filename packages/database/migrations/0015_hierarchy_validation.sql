CREATE TABLE content_hierarchy_validation (
  collection_id text PRIMARY KEY REFERENCES content_schema_control(collection_id) ON DELETE CASCADE,
  epoch bigint NOT NULL DEFAULT 0 CHECK(epoch>=0),
  validated_epoch bigint CHECK(validated_epoch>=0 AND validated_epoch<=epoch),
  configuration char(64),
  validation_token uuid,
  validating_configuration char(64),
  validated_at timestamptz,
  validation_expires_at timestamptz
);
CREATE FUNCTION cms_invalidate_hierarchy_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected text;
BEGIN
  IF TG_TABLE_NAME='content_documents' AND TG_OP='UPDATE' THEN
    IF NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id AND NEW.trashed_at IS NOT DISTINCT FROM OLD.trashed_at THEN RETURN NULL; END IF;
  END IF;
  IF TG_OP='DELETE' THEN affected:=OLD.collection_id; ELSE affected:=NEW.collection_id; END IF;
  EXECUTE format('UPDATE %I.content_hierarchy_validation SET epoch=epoch+1,validation_token=NULL,validating_configuration=NULL,validation_expires_at=NULL WHERE collection_id=$1',TG_TABLE_SCHEMA) USING affected;
  RETURN NULL;
END $$;
CREATE TRIGGER content_hierarchy_document_epoch AFTER INSERT OR UPDATE OF current_version_id,trashed_at OR DELETE ON content_documents FOR EACH ROW EXECUTE FUNCTION cms_invalidate_hierarchy_epoch();
CREATE TRIGGER content_hierarchy_publication_epoch AFTER INSERT OR UPDATE OR DELETE ON content_publications FOR EACH ROW EXECUTE FUNCTION cms_invalidate_hierarchy_epoch();
