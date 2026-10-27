ALTER TABLE content_query_presets ADD COLUMN access jsonb;
UPDATE content_query_presets SET access=jsonb_build_object(
  'read',CASE WHEN shared THEN jsonb_build_object('constraint','everyone') ELSE jsonb_build_object('constraint','onlyMe','users',jsonb_build_array(owner_id::text)) END,
  'update',jsonb_build_object('constraint','onlyMe','users',jsonb_build_array(owner_id::text)),
  'delete',jsonb_build_object('constraint','onlyMe','users',jsonb_build_array(owner_id::text))
);
ALTER TABLE content_query_presets ALTER COLUMN access SET NOT NULL;
ALTER TABLE content_query_presets ADD CONSTRAINT content_query_presets_access_check CHECK (coalesce((
  jsonb_typeof(access)='object'
  AND jsonb_typeof(access->'read')='object'
  AND jsonb_typeof(access->'read'->'constraint')='string'
  AND jsonb_typeof(access->'update')='object'
  AND jsonb_typeof(access->'update'->'constraint')='string'
  AND jsonb_typeof(access->'delete')='object'
  AND jsonb_typeof(access->'delete'->'constraint')='string'
),false));
ALTER TABLE content_query_presets DROP COLUMN shared;
CREATE TABLE content_query_preset_references (
  preset_id uuid NOT NULL,
  field_id text NOT NULL,
  source_path text NOT NULL,
  target_document_id uuid NOT NULL,
  target_collection_id text NOT NULL,
  CONSTRAINT content_query_preset_references_pkey PRIMARY KEY(preset_id,source_path,target_document_id),
  CONSTRAINT content_query_preset_references_preset_fk FOREIGN KEY(preset_id) REFERENCES content_query_presets(id) ON DELETE CASCADE,
  CONSTRAINT content_query_preset_references_document_fk FOREIGN KEY(target_document_id,target_collection_id) REFERENCES content_documents(id,collection_id) ON DELETE RESTRICT
);
CREATE INDEX content_query_preset_references_target_idx ON content_query_preset_references(target_document_id);
