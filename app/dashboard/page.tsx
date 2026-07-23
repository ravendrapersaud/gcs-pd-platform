import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ANNUAL_PD_ALLOTMENT, academicYearRange, academicYearLabel, formatUSD } from '@/lib/funds'

interface ReportRow {
  id: string
  first_name: string
  last_name: string
  title: string | null
}

interface TeamData {
  label: string
  reports: (ReportRow & { pdHours: number; remainingFunds: number })[]
  pendingCount: number
  pendingTotal: number
  teamHours: number
  unsignedObs: number
}

async function fetchTeamData(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  role: string
): Promise<TeamData | null> {
  if (role !== 'supervisor' && role !== 'admin') return null

  let reports: ReportRow[] = []
  if (role === 'admin') {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, title')
      .neq('id', userId)
      .order('last_name')
    reports = (data ?? []) as ReportRow[]
  } else {
    const { data } = await supabase
      .from('supervisor_assignments')
      .select('staff:profiles!supervisor_assignments_staff_id_fkey(id, first_name, last_name, title)')
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
    reports: reports.map((r) => ({ ...r, pdHours: 0, remainingFunds: ANNUAL_PD_ALLOTMENT })),
    pendingCount: 0,
    pendingTotal: 0,
    teamHours: 0,
    unsignedObs: 0,
  }
  if (ids.length === 0) return base

  const { start } = academicYearRange()
  const startISO = start.toISOString()
  const startDate = startISO.slice(0, 10)

  const [pendingRes, approvedRes, hoursRes, obsRes] = await Promise.all([
    supabase
      .from('funding_requests')
      .select('id, amount')
      .in('user_id', ids)
      .eq('status', 'pending'),
    supabase
      .from('funding_requests')
      .select('user_id, amount')
      .in('user_id', ids)
      .eq('status', 'approved')
      .gte('created_at', startISO),
    supabase
      .from('pd_activities')
      .select('user_id, hours')
      .in('user_id', ids)
      .gte('activity_date', startDate),
    supabase
      .from('observations')
      .select('id')
      .in('observed_id', ids)
      .eq('signed_off', false),
  ])

  const approvedByUser: Record<string, number> = {}
  for (const row of approvedRes.data ?? []) {
    approvedByUser[row.user_id] = (approvedByUser[row.user_id] ?? 0) + Number(row.amount)
  }
  const hoursByUser: Record<string, number> = {}
  for (const row of hoursRes.data ?? []) {
    hoursByUser[row.user_id] = (hoursByUser[row.user_id] ?? 0) + (row.hours ?? 0)
  }

  return {
    ...base,
    reports: reports.map((r) => ({
      ...r,
      pdHours: hoursByUser[r.id] ?? 0,
      remainingFunds: Math.max(ANNUAL_PD_ALLOTMENT - (approvedByUser[r.id] ?? 0), 0),
    })),
    pendingCount: pendingRes.data?.length ?? 0,
    pendingTotal: (pendingRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
    teamHours: (hoursRes.data ?? []).reduce((s, r) => s + (r.hours ?? 0), 0),
    unsignedObs: obsRes.data?.length ?? 0,
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
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  // Current profile role (for supervisor/admin team section)
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  const team = await fetchTeamData(supabase, userId, myProfile?.role ?? 'staff')

  // Fetch PD activities
  const { data: pdActivities } = await supabase
    .from('pd_activities')
    .select('hours')
    .eq('user_id', userId)

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
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Team section (supervisors and admins) */}
      {team && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-lg">{team.label}</h2>
              <p className="text-xs text-gray-400">Academic year {academicYearLabel()}</p>
            </div>
            {team.pendingCount > 0 && (
              <Link href="/dashboard/approvals" className="text-sm text-navy-700 hover:underline font-medium">
                Review requests →
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
              sub="this academic year"
              color="green"
            />
            <MetricCard
              label="Unsigned observations"
              value={team.unsignedObs}
              sub="awaiting sign-off"
              color="blue"
            />
          </div>

          {team.reports.length > 0 && (
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {team.reports.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                      <span className="text-navy-800 text-xs font-bold">
                        {(r.first_name?.[0] ?? '')}{(r.last_name?.[0] ?? '')}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {r.first_name} {r.last_name}
                      </p>
                      {r.title && <p className="text-xs text-gray-400 truncate">{r.title}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-navy-800">{r.pdHours.toFixed(1)} hrs</p>
                      <p className="text-xs text-gray-400">{formatUSD(r.remainingFunds)} PD funds left</p>
                    </div>
                  </li>
                ))}
              </ul>
              {team.reports.length > 8 && (
                <p className="px-4 py-2.5 text-xs text-gray-400 border-t border-gray-100">
                  + {team.reports.length - 8} more
                </p>
              )}
            </div>
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
              <h2 className="font-semibold text-gray-900">Recent Spotlights</h2>
              <Link href="/dashboard/spotlights" className="text-sm text-navy-700 hover:underline">
                All
              </Link>
            </div>
            {!spotlights || spotlights.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">No spotlights yet.</p>
            ) : (
              <ul className="space-y-3">
                {spotlights.map((s) => {
                  const from = s.from_user as unknown as { first_name: string; last_name: string } | null
                  return (
                    <li key={s.id} className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
                      <p className="text-xs text-yellow-800 font-medium mb-1">
                        ⭐ from {from ? `${from.first_name} ${from.last_name}` : 'a colleague'}
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
