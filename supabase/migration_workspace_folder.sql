-- Let a workspace embed a shared Google Drive folder (a lightweight team hub,
-- in addition to the post feed and file links). Just stores the folder's URL;
-- the app renders Google's read-only embedded folder view. Idempotent.
alter table public.workspaces add column if not exists drive_folder_url text;
