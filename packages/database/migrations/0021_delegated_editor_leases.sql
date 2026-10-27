ALTER TABLE content_document_leases
  ADD COLUMN delegation_id uuid REFERENCES credential_grants(id) ON DELETE CASCADE;
UPDATE content_document_leases SET expires_at=LEAST(expires_at,clock_timestamp());
