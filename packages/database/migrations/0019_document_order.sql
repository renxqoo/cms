LOCK TABLE content_documents IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE content_schema_control IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE content_order_control (
  collection_id text PRIMARY KEY,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  last_position numeric NOT NULL DEFAULT 0,
  CONSTRAINT content_order_control_position_check CHECK(last_position>=0 AND last_position<'Infinity'::numeric)
);

CREATE TABLE content_document_order (
  document_id uuid PRIMARY KEY,
  collection_id text NOT NULL,
  position numeric NOT NULL,
  CONSTRAINT content_document_order_document_fk FOREIGN KEY(document_id,collection_id)
    REFERENCES content_documents(id,collection_id) ON DELETE CASCADE,
  CONSTRAINT content_document_order_position_check CHECK(position NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
  CONSTRAINT content_document_order_position_uq UNIQUE(collection_id,position) DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO content_document_order(document_id,collection_id,position)
  SELECT id,collection_id,row_number() OVER(PARTITION BY collection_id ORDER BY created_at,id)
  FROM content_documents;
INSERT INTO content_order_control(collection_id,last_position)
  SELECT collection_id,max(position) FROM content_document_order GROUP BY collection_id;
INSERT INTO content_order_control(collection_id)
  SELECT collection_id FROM content_schema_control ON CONFLICT(collection_id) DO NOTHING;

CREATE FUNCTION cms_track_document_order() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE next_position numeric;
BEGIN
  IF TG_TABLE_NAME='content_schema_control' THEN
    INSERT INTO content_order_control(collection_id) VALUES(NEW.collection_id)
      ON CONFLICT(collection_id) DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    INSERT INTO content_order_control(collection_id,last_position)
      VALUES(NEW.collection_id,1)
      ON CONFLICT(collection_id) DO UPDATE
        SET last_position=content_order_control.last_position+1,version=gen_random_uuid()
      RETURNING last_position INTO next_position;
    INSERT INTO content_document_order(document_id,collection_id,position)
      VALUES(NEW.id,NEW.collection_id,next_position);
    RETURN NEW;
  END IF;
  UPDATE content_order_control SET version=gen_random_uuid() WHERE collection_id=OLD.collection_id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION cms_track_document_order() FROM PUBLIC;
CREATE TRIGGER content_documents_track_order AFTER INSERT OR DELETE ON content_documents
  FOR EACH ROW EXECUTE FUNCTION cms_track_document_order();
CREATE TRIGGER content_schema_track_order AFTER INSERT ON content_schema_control
  FOR EACH ROW EXECUTE FUNCTION cms_track_document_order();
