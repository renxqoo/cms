ALTER TABLE asset_objects ADD COLUMN cleanup_generation bigint NOT NULL DEFAULT 0 CHECK (cleanup_generation >= 0);
CREATE INDEX content_jobs_discovery_idx ON content_jobs(collection_id,created_at DESC,id DESC);
CREATE INDEX asset_jobs_discovery_idx ON asset_jobs(actor_id,collection_key,created_at DESC,id DESC);
CREATE INDEX asset_uploads_discovery_idx ON asset_uploads(actor_id,collection_key,created_at DESC,id DESC);
DROP INDEX asset_uploads_actor_idx;
CREATE INDEX asset_objects_discovery_idx ON asset_objects(cleanup_blocked,created_at DESC,id DESC);
