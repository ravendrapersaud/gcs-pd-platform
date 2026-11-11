-- Keep the teaching frameworks out of non-teaching staff's framework lists by
-- targeting them to the Faculty track. Only sets targeting when it's currently
-- unset, so a later admin change isn't clobbered. Observations link to these
-- frameworks directly via observations.framework_id, which targeting does NOT
-- affect — only where they appear in the Frameworks grid and the
-- review/project competency pickers. Idempotent.
update public.frameworks
set target_tracks = array['faculty']
where title in ('Teaching with Grace', 'GCS Teaching Excellence Framework')
  and coalesce(array_length(target_tracks, 1), 0) = 0;
