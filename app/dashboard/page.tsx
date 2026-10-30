import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { parseFundSettings, fundYearRange, fundYearLabel, isInFundYear, effectiveAllotment, formatUSD } from '@/lib/funds'
import { pdHoursTarget } from '@/lib/appSettings'

interface ReportRow {
  id: string
  first_name: string
  last_name: string
  title: string | null
  employee_type: string | null
  pd_allotment: number | null
}

interface TeamData {
  label: string
  yearLabel: string
  hoursTarget: number
  reports: (ReportRow & { pdHours: number; remainingFunds: number })[]
  pendingCount: number
  pendingTotal: number
  teamHours: number
}

async function fetchTeamData(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  role: string
): Promise<TeamData | null> {
  if (role !== 'supervisor' && role !== 'admin') return null

  // Fund policy settings (default allotment + fund-year start dates).
  const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
  const fundCfg = parseFundSettings(settingsRows)

  let reports: ReportRow[] = []
  if (role === 'admin') {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, title, employee_type, pd_allotment')
      .neq('id', userId)
      .order('last_name')
    reports = (data ?? []) as ReportRow[]
  } else {
    const { data } = await supabase
      .from('supervisor_assignments')
      .select('staff:profiles!supervisor_assignments_staff_id_fkey(id, first_name, last_name, title, employee_type, pd_allotment)')
      .eq('supervisor_id', userId)
    const seen = new Set<string>()
    reports = (data ?? []).flatMap((row) => {
      const s = row.staff as unknown as ReportRow | null
      if (!s || seen.has(s.id)) return []
      seen.add(s.id)
      return [s]
    })
  }

  const ids = reports.map((r) => r.id)
  const base: TeamData = {
    label: role === 'admin' ? 'School overview' : 'My Team',
    yearLabel: fundYearLabel('staff', fundCfg),
    hoursTarget: pdHoursTarget(settingsRows),
    reports: reports.map((r) => ({ ...r, pdHours: 0, remainingFunds: effectiveAllotment(r, fundCfg) })),
    pendingCount: 0,
    pendingTotal: 0,
    teamHours: 0,
  }
  if (ids.length === 0) return base

  // Staff and faculty fund years start on different dates, so fetch
  // approved requests since the EARLIER of the two starts, then filter
  // per-user in JS with each person's own window.
  const staffStart = fundYearRange('staff', fundCfg).start
  const facultyStart = fundYearRange('faculty', fundCfg).start
  const earliestStart = staffStart < facultyStart ? staffStart : facultyStart
  const earliestISO = earliestStart.toISOString()
  // Hours use the same treatment as funds: fetch from the earlier of the
  // two fund-year starts, then filter per person against their own window
  // below. (Previously every report was measured on the staff window, so
  // faculty hours between the two start dates were counted wrongly.)
  const hoursStartDate = earliestStart.toISOString().slice(0, 10)

  const [pendingRes, approvedRes, hoursRes] = await Promise.all([
    supabase
      .from('funding_requests')
      .select('id, amount')
      .in('user_id', ids)
      .eq('status', 'pending'),
    supabase
      .from('funding_requests')
      .select('user_id, amount, created_at')
      .in('user_id', ids)
      .eq('status', 'approved')
      .gte('created_at', earliestISO),
    supabase
      .from('pd_activities')
      .select('user_id, hours, activity_date')
      .in('user_id', ids)
      .gte('activity_date', hoursStartDate),
  ])

  const typeById: Record<string, string | null> = {}
  for (const r of reports) typeById[r.id] = r.employee_type

  const approvedByUser: Record<string, number> = {}
  for (const row of approvedRes.data ?? []) {
    // Only count spend inside this person's own fund year.
    if (!isInFundYear(row.created_at, typeById[row.user_id], fundCfg)) continue
    approvedByUser[row.user_id] = (approvedByUser[row.user_id] ?? 0) + Number(row.amount)
  }
  const hoursByUser: Record<string, number> = {}
  for (const row of hoursRes.data ?? []) {
    // Only count hours inside this person's own fund year.
    if (!isInFundYear(row.activity_date, typeById[row.user_id], fundCfg)) continue
    hoursByUser[row.user_id] = (hoursByUser[row.user_id] ?? 0) + (row.hours ?? 0)
  }

  return {
    ...base,
    reports: reports.map((r) => ({
      ...r,
      pdHours: hoursByUser[r.id] ?? 0,
      remainingFunds: Math.max(effectiveAllotment(r, fundCfg) - (approvedByUser[r.id] ?? 0), 0),
    })),
    pendingCount: pendingRes.data?.length ?? 0,
    pendingTotal: (pendingRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    // Sum the per-person filtered figures, not the raw rows, so the
    // headline total matches the per-report numbers beneath it.
    teamHours: Object.values(hoursByUser).reduce((s, h) => s + h, 0),
  }
}

function MetricCard({
  label,
  value,
  sub,
  color = 'navy',
}: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  const colorMap: Record<string, string> = {
    navy: 'bg-navy-50 border-navy-200 text-navy-900',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
  }
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

// Line icons matching the sidebar's stroke style (navy, 1.7 weight).
const Ico = ({ children }: { children: React.ReactNode }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)
const ICONS: Record<string, React.ReactNode> = {
  log: <Ico><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></Ico>,
  chat: <Ico><path d="M7.5 8.25h9m-9 3H12m8.25.75a8.25 8.25 0 01-11.68 7.5L3 21l1.5-5.57A8.25 8.25 0 1120.25 12z" /></Ico>,
  flag: <Ico><path d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" /></Ico>,
  money: <Ico><path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></Ico>,
  eye: <Ico><path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></Ico>,
  team: <Ico><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></Ico>,
}

// A dashboard action tile that links straight to a task.
function ActionTile({ href, icon, label, desc }: { href: string; icon: string; label: string; desc: string }) {
  return (
    <Link href={href} className="card p-4 flex items-start gap-3 hover:border-navy-300 transition-colors">
      <span className="w-10 h-10 rounded-xl bg-navy-50 text-navy-700 grid place-items-center shrink-0" aria-hidden>{ICONS[icon]}</span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-500 line-clamp-2">{desc}</p>
      </div>
    </Link>
  )
}

// Quick actions earn a tile only when they reduce clicks or surface a feature
// that isn't a one-click sidebar destination — so no plain duplicates of the
// sidebar (Resources, Approvals, Roster, Reports, Settings, Shout-outs). The
// ?new / ?tab deep-links open a form or sub-view the sidebar can't reach directly.
interface DashAction { href: string; icon: string; label: string; desc: string; roles: string[] }
const DASH_ACTIONS: DashAction[] = [
  { href: '/dashboard/pd-log?new=1', icon: 'log', label: 'Log PD', desc: 'Record a workshop, course, or activity', roles: ['staff', 'supervisor', 'admin'] },
  { href: '/dashboard/observations/peer', icon: 'chat', label: 'Give peer feedback', desc: 'A quick, collegial note to a colleague', roles: ['staff', 'supervisor', 'admin'] },
  { href: '/dashboard/goals?new=1', icon: 'flag', label: 'Set a goal', desc: 'Start a new growth or inquiry goal', roles: ['staff', 'supervisor', 'admin'] },
  { href: '/dashboard/pd-log?tab=funding&new=1', icon: 'money', label: 'Request funding', desc: 'Submit a PD funding request', roles: ['staff', 'supervisor', 'admin'] },
  { href: '/dashboard/observations/twg', icon: 'eye', label: 'Record an observation', desc: 'Teaching with Grace capture', roles: ['supervisor', 'admin'] },
  { href: '/dashboard/goals?tab=team', icon: 'team', label: 'Team goals', desc: "Your team's growth goals", roles: ['supervisor', 'admin'] },
]

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-navy-700 h-2 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userId = user.id

  // Current profile role (for supervisor/admin team section) and
  // employee_type (faculty/staff decides which fund year applies).
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role, employee_type')
    .eq('id', userId)
    .single()

  const role = myProfile?.role ?? 'staff'
  const team = await fetchTeamData(supabase, userId, role)

  // PD activities for THIS fund year only. The hours target is annual, so
  // an all-time total would let hours from earlier years count toward it.
  // Staff and faculty fund years start on different dates, hence the
  // per-person window rather than a calendar year.
  const { data: mySettingsRows } = await supabase.from('app_settings').select('key, value')
  const myFundCfg = parseFundSettings(mySettingsRows)
  const myYear = fundYearRange(myProfile?.employee_type, myFundCfg)

  const { data: pdActivities } = await supabase
    .from('pd_activities')
    .select('hours')
    .eq('user_id', userId)
    .gte('activity_date', myYear.start.toISOString().slice(0, 10))
    .lt('activity_date', myYear.end.toISOString().slice(0, 10))

  const totalHours = pdActivities?.reduce((sum, a) => sum + (a.hours ?? 0), 0) ?? 0
  const pdCount = pdActivities?.length ?? 0

  // Fetch active goals
  const { data: goals } = await supabase
    .from('goals')
    .select('id, title, progress_pct, due_date, status')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('due_date', { ascending: true })
    .limit(5)

  // Fetch observations
  const { data: observations } = await supabase
    .from('observations')
    .select('id')
    .eq('observed_id', userId)

  // Fetch recent spotlights
  const { data: spotlights } = await supabase
    .from('spotlights')
    .select('id, message, tags, created_at, from_user:profiles!spotlights_from_user_id_fkey(first_name, last_name)')
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(3)

  // Fetch pending funding requests
  const { data: fundingRequests } = await supabase
    .from('funding_requests')
    .select('id, title, amount, status')
    .eq('user_id', userId)
    .eq('status', 'pending')

  // Fetch favorited resources preview
  const { data: favResources } = await supabase
    .from('resource_favorites')
    .select('resource:resources(id, title, type, url)')
    .eq('user_id', userId)
    .limit(3)

  const activeGoalsCount = goals?.length ?? 0
  const observationCount = observations?.length ?? 0
  const pendingFundingCount = fundingRequests?.length ?? 0

  return (
    <div className="max-w-[1180px] mx-auto space-y-8">
      {/* Quick actions — role-tailored; each tile links straight to the task */}
      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900 text-lg">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DASH_ACTIONS.filter((a) => a.roles.includes(role)).map((a) => (
            <ActionTile key={a.href} href={a.href} icon={a.icon} label={a.label} desc={a.desc} />
          ))}
        </div>
      </section>

      {/* Team summary (supervisors and admins) */}
      {team && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">{team.label}</h2>
              <p className="text-xs text-gray-400">Academic year {team.yearLabel}</p>
            </div>
            {team.pendingCount > 0 && (
              <Link href="/dashboard/approvals" className="text-sm text-navy-700 hover:underline font-medium">
                Review requests →
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCard
              label={team.label === 'My Team' ? 'Team members' : 'Staff members'}
              value={team.reports.length}
              color="navy"
            />
            <MetricCard
              label="Pending approvals"
              value={team.pendingCount}
              sub={team.pendingCount > 0 ? `${formatUSD(team.pendingTotal)} requested` : 'none waiting'}
              color="yellow"
            />
            <MetricCard
              label="Team PD hours"
              value={team.teamHours.toFixed(1)}
              sub={`Target: ${team.hoursTarget} hrs each`}
              color="green"
            />
          </div>

          {team.reports.length > 0 && (
            <Link
              href={role === 'admin' ? '/dashboard/admin/staff' : '/dashboard/goals?tab=team'}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline"
            >
              View {team.label === 'My Team' ? 'your team' : 'all staff'} ({team.reports.length}) →
            </Link>
          )}
        </section>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="PD Hours This Year"
          value={totalHours.toFixed(1)}
          sub={`${pdCount} activit${pdCount === 1 ? 'y' : 'ies'} logged`}
          color="navy"
        />
        <MetricCard
          label="Active Goals"
          value={activeGoalsCount}
          sub="in progress"
          color="green"
        />
        <MetricCard
          label="Observations"
          value={observationCount}
          sub="total received"
          color="blue"
        />
        <MetricCard
          label="Pending Funding"
          value={pendingFundingCount}
          sub="awaiting review"
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Active Goals</h2>
            <Link href="/dashboard/goals" className="text-sm text-navy-700 hover:underline">
              View all
            </Link>
          </div>
          {!goals || goals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No active goals yet.</p>
              <Link href="/dashboard/goals" className="btn-primary mt-3 text-xs">
                Set a goal
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {goals.map((goal) => (
                <li key={goal.id}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-800 line-clamp-1">
                      {goal.title}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0 ml-2">
                      {goal.progress_pct}%
                    </span>
                  </div>
                  <ProgressBar pct={goal.progress_pct} />
                  {goal.due_date && (
                    <p className="text-xs text-gray-400 mt-1">
                      Due {new Date(goal.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Spotlights */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Recent Shout-outs</h2>
              <Link href="/dashboard/shout-outs" className="text-sm text-navy-700 hover:underline">
                All
              </Link>
            </div>
            {!spotlights || spotlights.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">No shout-outs yet.</p>
            ) : (
              <ul className="space-y-3">
                {spotlights.map((s) => {
                  const from = s.from_user as unknown as { first_name: string; last_name: string } | null
                  return (
                    <li key={s.id} className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
                      <p className="text-xs text-yellow-800 font-medium mb-1">
                        📣 from {from ? `${from.first_name} ${from.last_name}` : 'a colleague'}
                      </p>
                      <p className="text-sm text-gray-700 line-clamp-2">{s.message}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Saved resources */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Saved Resources</h2>
              <Link href="/dashboard/resources" className="text-sm text-navy-700 hover:underline">
                Browse
              </Link>
            </div>
            {!favResources || favResources.length === 0 ? (
              <p className="text-gray-400 text-sm py-2 text-center">No saved resources yet.</p>
            ) : (
              <ul className="space-y-2">
                {favResources.map((fr) => {
                  const r = fr.resource as unknown as { id: string; title: string; type: string; url: string | null } | null
                  if (!r) return null
                  return (
                    <li key={r.id}>
                      <a
                        href={r.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 text-sm text-gray-700 hover:text-navy-800 transition-colors"
                      >
                        <span className="text-gray-400 mt-0.5">→</span>
                        <span className="line-clamp-1">{r.title}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Pending funding */}
          {pendingFundingCount > 0 && (
            <div className="card p-5 border-yellow-200 bg-yellow-50">
              <h2 className="font-semibold text-yellow-800 mb-2">Pending Funding</h2>
              <ul className="space-y-1">
                {fundingRequests?.map((fr) => (
                  <li key={fr.id} className="flex justify-between text-sm">
                    <span className="text-gray-700 line-clamp-1">{fr.title}</span>
                    <span className="text-gray-600 font-medium shrink-0 ml-2">
                      ${Number(fr.amount).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/dashboard/pd-log" className="text-xs text-yellow-700 underline mt-2 block">
                View all requests →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
