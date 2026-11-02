-- Weekly PD-calendar scrape, scheduled from the database (Supabase pg_cron).
--
-- ⚠️  RUN THIS BY HAND in the Supabase SQL editor, AFTER you have:
--   1. Set CRON_SECRET in Vercel (Production) and in .env.local to a long
--      random string (e.g. `openssl rand -hex 32`), then redeployed so the
--      /api/cron/scrape-events route knows the secret.
--   2. Replaced the two placeholders below:
--        <YOUR_PRODUCTION_URL>  → e.g. https://gcs-pd-platform.vercel.app
--        <YOUR_CRON_SECRET>     → the exact CRON_SECRET value you set in Vercel
--
-- (HTML sources also need ANTHROPIC_API_KEY set in Vercel; .ics feeds don't.)
--
-- Schedule: '0 7 * * 1' = 07:00 UTC every Monday ≈ 2 AM US Eastern in winter
-- (3 AM during daylight saving). pg_cron runs in UTC; adjust the hour to taste.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any existing job of this name, then (re)create it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-pd-events-weekly') then
    perform cron.unschedule('scrape-pd-events-weekly');
  end if;
end $$;

select cron.schedule(
  'scrape-pd-events-weekly',
  '0 7 * * 1',
  $$
  select net.http_post(
    url     := '<YOUR_PRODUCTION_URL>/api/cron/scrape-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- To verify later:  select jobname, schedule, active from cron.job;
-- To run once now:  select net.http_post(url := '<YOUR_PRODUCTION_URL>/api/cron/scrape-events',
--                      headers := jsonb_build_object('Authorization','Bearer <YOUR_CRON_SECRET>'),
--                      body := '{}'::jsonb);
