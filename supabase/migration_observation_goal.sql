-- Let a formal observation be tagged as evidence toward a specific goal of the
-- observed teacher. Shows on the goal and in the portfolio. Idempotent.
alter table public.observations add column if not exists goal_id uuid references public.goals(id) on delete set null;
create index if not exists observations_goal_id_idx on public.observations(goal_id);
