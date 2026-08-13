'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { DEFAULT_PD_HOURS_TARGET, pdHoursTarget } from '@/lib/appSettings'
import ReportBuilder from '@/components/ReportBuilder'

interface DeptStats {
  department: string
  count: number
  hours: number
}

interface StaffStats {
  profile: Profile
  hours: number
  obsCount: number
}

export default function ReportsPage() {
  const supabase = createClient()
  const [divFilter, setDivFilter] = useState('')
  const [divisions, setDivisions] = useState<string[]>([])
  const [deptStats, setDeptStats] = useState<DeptStats[]>([])
  const [staffStats, setStaffStats] = useState<StaffStats[]>([])
  const [totalStaff, setTotalStaff] = useState(0)
  const [avgHours, setAvgHours] = useState(0)
  const [obsCompletion, setObsCompletion] = useState(0)
  const [totalFunding, setTotalFunding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pdGoal, setPdGoal] = useState(DEFAULT_PD_HOURS_TARGET)

  const load = useCallback(async () => {
    setLoading(true)
    const year = new Date().getFullYear()

    const [{ data: profiles }, { data: pdActs }, { data: observations }, { data: funding }, { data: settings }] =
      await Promise.all([
        supabase.from('profiles').select('*'),
        supabase
          .from('pd_activities')
          .select('user_id, hours')
          .gte('activity_date', `${year}-01-01`),
        supabase.from('observations').select('observed_id'),
        supabase.from('funding_requests').select('amount').eq('status', 'approved'),
        supabase.from('app_settings').select('key, value'),
      ])

    setPdGoal(pdHoursTarget(settings))

    const allProfiles = (profiles ?? []) as Profile[]
    const filteredProfiles = divFilter
      ? allProfiles.filter((p) => p.division === divFilter)
      : allProfiles

    const divs = Array.from(new Set(allProfiles.map((p) => p.division).filter(Boolean))).sort() as string[]
    setDivisions(divs)

    // PD hours map
    const hoursMap: Record<string, number> = {}
    for (const a of pdActs ?? []) {
      hoursMap[a.user_id] = (hoursMap[a.user_id] ?? 0) + (a.hours ?? 0)
    }

    // Observation set
    const obsSet = new Set((observations ?? []).map((o) => o.observed_id))

    // Staff with ≥1 observation
    const staffWithObs = filteredProfiles.filter((p) => obsSet.has(p.id)).length
    const obsCompletionPct = filteredProfiles.length > 0
      ? Math.round((staffWithObs / filteredProfiles.length) * 100)
      : 0
    setObsCompletion(obsCompletionPct)

    // Total funding
    const fundingTotal = (funding ?? []).reduce((s, f) => s + (Number(f.amount) ?? 0), 0)
    setTotalFunding(fundingTotal)

    // Avg hours
    const totalHrs = filteredProfiles.reduce((s, p) => s + (hoursMap[p.id] ?? 0), 0)
    setAvgHours(filteredProfiles.length > 0 ? totalHrs / filteredProfiles.length : 0)
    setTotalStaff(filteredProfiles.length)

    // By department
    const deptMap: Record<string, { count: number; hours: number }> = {}
    for (const p of filteredProfiles) {
      const dept = p.department ?? 'Unknown'
      if (!deptMap[dept]) deptMap[dept] = { count: 0, hours: 0 }
      deptMap[dept].count++
      deptMap[dept].hours += hoursMap[p.id] ?? 0
    }
    const deptArr = Object.entries(deptMap)
      .map(([department, { count, hours }]) => ({ department, count, hours }))
      .sort((a, b) => b.hours - a.hours)
    setDeptStats(deptArr)

    // Staff rows
    const rows: StaffStats[] = filteredProfiles.map((p) => ({
      profile: p,
      hours: hoursMap[p.id] ?? 0,
      obsCount: (observations ?? []).filter((o) => o.observed_id === p.id).length,
    })).sort((a, b) => b.hours - a.hours)
    setStaffStats(rows)

    setLoading(false)
  }, [divFilter])

  useEffect(() => { load() }, [load])

  const maxHours = Math.max(...deptStats.map((d) => d.hours), 1)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Division selector */}
      <div className="flex items-center gap-4">
        <label className="label mb-0 shrink-0">Filter by Division:</label>
        <select
          className="input w-56"
          value={divFilter}
          onChange={(e) => setDivFilter(e.target.value)}
        >
          <option value="">All Divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Staff Count', value: totalStaff, sub: divFilter || 'All School' },
          { label: 'Avg PD Hours', value: avgHours.toFixed(1), sub: `Goal: ${pdGoal}h` },
          { label: 'Obs Coverage', value: `${obsCompletion}%`, sub: 'with ≥1 observation' },
          { label: 'Approved Funding', value: `$${totalFunding.toFixed(0)}`, sub: 'this year' },
        ].map((m) => (
          <div key={m.label} className="card p-5">
            <p className="text-sm text-gray-500">{m.label}</p>
            <p className="text-2xl font-bold text-navy-900 mt-1">{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Bar chart: PD hours by department */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-5">PD Hours by Department</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-6 bg-gray-100 rounded animate-pulse flex-1" />
              </div>
            ))}
          </div>
        ) : deptStats.length === 0 ? (
          <p className="text-gray-400 text-sm">No data available.</p>
        ) : (
          <div className="space-y-3">
            {deptStats.map((d) => {
              const pct = (d.hours / maxHours) * 100
              const goalPct = Math.min(100, (d.hours / (d.count * pdGoal)) * 100)
              return (
                <div key={d.department} className="flex items-center gap-4">
                  <div className="w-36 text-sm text-gray-700 shrink-0 truncate" title={d.department}>
                    {d.department}
                  </div>
                  <div className="flex-1 relative">
                    <div className="w-full bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      {/* Goal marker at proportional position */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-400 z-10 opacity-60"
                        style={{ left: `${Math.min(100, (d.count * pdGoal) / maxHours * 100)}%` }}
                      />
                      <div
                        className="h-6 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: goalPct >= 100 ? '#15803d' : goalPct >= 70 ? '#1B2A4A' : '#fbbf24',
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0 w-24 text-sm">
                    <span className="font-bold text-navy-900">{d.hours.toFixed(1)}h</span>
                    <span className="text-gray-400 ml-1 text-xs">/ {d.count} staff</span>
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-gray-400 mt-2">
              Orange line = team goal ({pdGoal}h × staff count). Green = at/above goal.
            </p>
          </div>
        )}
      </div>

      {/* Staff table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Staff PD Summary</h2>
        </div>
        {loading ? (
          <div className="h-32 animate-pulse bg-gray-50" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">Department</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500">PD Hours</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 hidden sm:table-cell">vs Goal</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500">Obs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffStats.map(({ profile: p, hours, obsCount }) => {
                const pct = Math.min(100, Math.round((hours / pdGoal) * 100))
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.first_name} {p.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{p.department ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${hours >= pdGoal ? 'text-green-700' : 'text-navy-800'}`}>
                        {hours.toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-navy-700'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${obsCount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {obsCount}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {staffStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No staff data for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Reports & exports */}
      <div className="pt-6 border-t border-gray-200">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Reports &amp; exports</h2>
        <p className="text-sm text-gray-500 mb-4">
          Run a standard report or build your own — pick any fields, filter, optionally
          group, and export to CSV or XLSX.
        </p>
        <ReportBuilder />
      </div>
    </div>
  )
}
