LOCK TABLE content_jobs IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM content_jobs WHERE action='extension' AND status IN ('queued','running')) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Drain queued and running extension work before installing source_locale; its original locale cannot be inferred safely';
  END IF;
END;
$$;

ALTER TABLE content_jobs ADD COLUMN source_locale text;
ALTER TABLE content_jobs ADD CONSTRAINT content_job_source_locale_shape CHECK (
  (action='extension' OR source_locale IS NULL) AND
  (action<>'extension' OR status NOT IN ('queued','running') OR source_locale IS NOT NULL)
);
ALTER TABLE content_jobs ADD CONSTRAINT content_job_source_locale_valid CHECK (
  source_locale IS NULL OR source_locale ~ '^[a-zA-Z][a-zA-Z0-9-]{0,31}$'
);
