CREATE TABLE content_query_presets (
  id uuid PRIMARY KEY,
  collection_id text NOT NULL,
  owner_id uuid NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  name varchar(128) NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  query jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (jsonb_typeof(query) = 'object')
);
CREATE INDEX content_query_presets_collection_idx ON content_query_presets(collection_id,created_at,id);
CREATE INDEX content_query_presets_owner_idx ON content_query_presets(collection_id,owner_id);
