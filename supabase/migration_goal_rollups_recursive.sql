-- Multi-level goal rollups. org_goal_rollups() previously counted only the
-- *direct* children of an org goal (one level). This redefines it to also
-- return `total_count` = every descendant across all levels (a school goal now
-- reaches the individual goals beneath its department goals, not just the
-- departments). The existing columns keep their meaning for back-compat:
--   aligned_count / avg_pct = immediate children (unchanged)
--   total_count             = all descendants (recursive)
-- SECURITY DEFINER + stable so leaders see true school-wide totals regardless
-- of RLS. Depth-guarded against any accidental cycle in parent_goal_id.
-- Idempotent. The return type changed (added total_count), so the old function
-- is dropped first — Postgres can't change an existing function's OUT columns.
drop function if exists public.org_goal_rollups();
create or replace function public.org_goal_rollups()
returns table(parent_goal_id uuid, aligned_count int, avg_pct int, total_count int)
language sql
security definer
stable
set search_path = public
as $$
  with recursive chain as (
    -- Base: every active goal attributed to its immediate parent.
    select
      g.parent_goal_id as ancestor,
      g.id             as node,
      g.progress_pct   as progress_pct,
      true             as direct,
      1                as depth
    from public.goals g
    where g.parent_goal_id is not null
      and g.status in ('active', 'completed', 'paused')
    union all
    -- Walk up: a node is also a descendant of its ancestor's parent.
    select
      p.parent_goal_id as ancestor,
      c.node,
      c.progress_pct,
      false            as direct,
      c.depth + 1      as depth
    from chain c
    join public.goals p on p.id = c.ancestor
    where p.parent_goal_id is not null
      and p.status in ('active', 'completed', 'paused')
      and c.depth < 10
  )
  select
    ancestor as parent_goal_id,
    count(*) filter (where direct)::int as aligned_count,
    coalesce(round(avg(progress_pct) filter (where direct))::int, 0) as avg_pct,
    count(*)::int as total_count
  from chain
  group by ancestor
$$;
grant execute on function public.org_goal_rollups() to authenticated;
