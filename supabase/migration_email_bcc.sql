-- Add a BCC column to the email audit log. BCC recipients are hidden from the
-- other recipients of a message, but for a personnel record (observations) they
-- must still be recorded in the audit trail. Idempotent.
alter table public.email_log
  add column if not exists bcc_emails text[] not null default '{}';
