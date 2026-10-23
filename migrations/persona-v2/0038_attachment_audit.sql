-- Attachment bodies/handles are ephemeral and encrypted, never stored in the audit.
ALTER TABLE audit_v2 ADD COLUMN attachment_id uuid;
ALTER TABLE audit_v2 ADD COLUMN attachment_bytes integer CHECK (attachment_bytes >= 0);
