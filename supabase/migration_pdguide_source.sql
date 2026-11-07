-- Seed PD Guide (pdguide.org) as a calendar event source.
-- PD Guide is a curated directory of PD events for independent schools. Our
-- scraper uses the 'pdguide' adapter, which treats the site as a DISCOVERY tool
-- only: it resolves each event to the HOST organization's own page (the
-- authoritative source) and shows that on our calendar — PD Guide itself never
-- appears. The adapter is deterministic and needs no API key, so this source
-- can be run on demand ("Run import now") before the weekly cron is live.
-- Idempotent: safe to run more than once.

insert into public.event_sources (name, url, kind, is_active, default_audience)
select
  'PD Guide (independent-school PD directory)',
  'https://www.pdguide.org/events',
  'pdguide',
  true,
  '{}'
where not exists (
  select 1 from public.event_sources where url = 'https://www.pdguide.org/events'
);
