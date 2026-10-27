LOCK TABLE content_documents IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE content_schema_control IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE content_order_control IN ACCESS EXCLUSIVE MODE;
LOCK TABLE content_document_order IN ACCESS EXCLUSIVE MODE;

ALTER TABLE content_order_control ADD COLUMN scope_key text NOT NULL DEFAULT '';
ALTER TABLE content_order_control DROP CONSTRAINT content_order_control_pkey;
ALTER TABLE content_order_control ADD PRIMARY KEY(collection_id,scope_key);
ALTER TABLE content_document_order ADD COLUMN scope_key text NOT NULL DEFAULT '';
ALTER TABLE content_document_order ADD COLUMN initial_position numeric;
UPDATE content_document_order SET initial_position=position;
ALTER TABLE content_document_order DROP CONSTRAINT content_document_order_pkey;
ALTER TABLE content_document_order ADD PRIMARY KEY(document_id,scope_key);
ALTER TABLE content_document_order DROP CONSTRAINT content_document_order_position_uq;
ALTER TABLE content_document_order ADD CONSTRAINT content_document_order_position_uq
  UNIQUE(collection_id,scope_key,position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE content_document_order ADD CONSTRAINT content_document_order_initial_uq
  UNIQUE(collection_id,initial_position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE content_document_order ADD CONSTRAINT content_document_order_initial_check
  CHECK((scope_key='' AND initial_position IS NOT NULL AND initial_position NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
    OR (scope_key<>'' AND initial_position IS NULL));

CREATE OR REPLACE FUNCTION cms_track_document_order() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE next_position numeric;
BEGIN
  IF TG_TABLE_NAME='content_schema_control' THEN
    INSERT INTO content_order_control(collection_id,scope_key) VALUES(NEW.collection_id,'')
      ON CONFLICT(collection_id,scope_key) DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' THEN
    INSERT INTO content_order_control(collection_id,scope_key,last_position)
      VALUES(NEW.collection_id,'',1)
      ON CONFLICT(collection_id,scope_key) DO UPDATE
        SET last_position=content_order_control.last_position+1,version=gen_random_uuid()
      RETURNING last_position INTO next_position;
    INSERT INTO content_document_order(document_id,collection_id,scope_key,position,initial_position)
      VALUES(NEW.id,NEW.collection_id,'',next_position,next_position);
    RETURN NEW;
  END IF;
  UPDATE content_order_control SET version=gen_random_uuid()
    WHERE collection_id=OLD.collection_id AND scope_key='';
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION cms_track_document_order() FROM PUBLIC;

CREATE FUNCTION cms_guard_document_order_identity() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.collection_id IS DISTINCT FROM OLD.collection_id
    OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
    OR NEW.initial_position IS DISTINCT FROM OLD.initial_position THEN
    RAISE EXCEPTION 'content_document_order_identity_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION cms_guard_document_order_identity() FROM PUBLIC;
CREATE TRIGGER content_document_order_identity_guard
  BEFORE UPDATE OF document_id,collection_id,scope_key,initial_position ON content_document_order
  FOR EACH ROW EXECUTE FUNCTION cms_guard_document_order_identity();
