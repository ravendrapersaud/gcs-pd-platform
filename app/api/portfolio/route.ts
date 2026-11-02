import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Assembles an employee portfolio (profile + goals + formal observations +
// shout-outs received + PD hours/funding) for a school year. Service-role so a
// single auth check covers every table; peer feedback is deliberately excluded.
// Viewable by an admin (anyone), a supervisor (their reports), or self.

// School year runs Jul 1 → Jun 30. `year` is the start year (e.g. 2026 = 2026–27).
function schoolYearRange(year: number) {
  return { start: `${year}-07-01`, end: `${year + 1}-06-30`, label: `${year}–${year + 1}` }
}
function currentSchoolYear(): number {
  const d = new Date()
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const userId = request.nextUrl.searchParams.get('userId') ?? ''
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const yearParam = Number(request.nextUrl.searchParams.get('year'))
  const year = Number.isFinite(yearParam) && yearParam > 2000 ? yearParam : currentSchoolYear()
  const { start, end, label } = schoolYearRange(year)
  const endTs = `${end}T23:59:59`

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── Authorize: admin (any), supervisor (their report), or self ──
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single()
  const role = me?.role
  let allowed = role === 'admin' || user.id === userId
  if (!allowed && role === 'supervisor') {
    const { data: a } = await admin.from('supervisor_assignments')
      .select('id').eq('supervisor_id', user.id).eq('staff_id', userId).maybeSingle()
    allowed = !!a
  }
  if (!allowed) return NextResponse.json({ error: 'Not authorized to view this portfolio.' }, { status: 403 })

  const [
    { data: profile },
    { data: goals },
    { data: observations },
    { data: shoutouts },
    { data: pd },
    { data: funding },
    { data: settings },
  ] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).single(),
    admin.from('goals').select('id, title, goal_type, status, progress_pct, due_date, created_at').eq('owner_id', userId),
    admin.from('observations')
      .select('id, obs_type, observed_at, notes, twg_data, observer:profiles!observations_observer_id_fkey(first_name, last_name)')
      .eq('observed_id', userId).eq('is_peer', false).eq('status', 'published')
      .gte('observed_at', start).lte('observed_at', endTs).order('observed_at', { ascending: false }),
    admin.from('spotlights')
      .select('id, message, tags, created_at, sender:profiles!spotlights_from_user_id_fkey(first_name, last_name)')
      .eq('to_user_id', userId).gte('created_at', start).lte('created_at', endTs).order('created_at', { ascending: false }),
    admin.from('pd_activities').select('id, title, type, activity_date, hours, verified')
      .eq('user_id', userId).gte('activity_date', start).lte('activity_date', end).order('activity_date', { ascending: false }),
    admin.from('funding_requests').select('id, title, amount, status, is_overseas_travel, created_at')
      .eq('user_id', userId).gte('created_at', start).lte('created_at', endTs).order('created_at', { ascending: false }),
    admin.from('app_settings').select('key, value'),
  ])

  if (!profile) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 })

  // Goals relevant to the year: created within it, or still active.
  const yearGoals = (goals ?? []).filter((g) => {
    const created = (g.created_at as string)?.slice(0, 10) ?? ''
    return (created >= start && created <= end) || g.status === 'active'
  })

  const hoursTotal = (pd ?? []).reduce((sum, a) => sum + (Number(a.hours) || 0), 0)
  const settingsMap = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]))
  const target = Number(settingsMap['pd_hours_target']) || 40

  return NextResponse.json({
    profile,
    year: { start, end, label, value: year },
    goals: yearGoals,
    observations: observations ?? [],
    shoutouts: shoutouts ?? [],
    pd: { activities: pd ?? [], hoursTotal, target },
    funding: funding ?? [],
  })
}
