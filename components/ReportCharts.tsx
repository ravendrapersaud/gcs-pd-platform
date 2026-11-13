'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

// Prototype charts for the admin Reports page, themed to Grace navy. Fed the
// already-computed per-division rows so there are no extra queries.
export type DivChartRow = {
  division: string; campus: string; count: number; avg: number
  obsPct: number; goalsTotal: number; goalsDone: number; goalPct: number
  servicePct: number
}

const NAVY = '#003882'   // navy-900, official Grace Navy
const GREEN = '#15803d'
const AMBER = '#f59e0b'

const axisTick = { fontSize: 11, fill: '#6b7280' }
const axisLine = { stroke: '#e5e7eb' }

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-400 mb-3">{subtitle}</p>}
      <div style={{ width: '100%', height: 260 }}>{children}</div>
    </div>
  )
}

export default function ReportCharts({ data, pdGoal, loading }: { data: DivChartRow[]; pdGoal: number; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="card h-[332px] animate-pulse bg-gray-100" />)}
      </div>
    )
  }
  if (data.length === 0) return null

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {/* Avg PD hours by division, with the target as a reference line */}
      <ChartCard title="Avg PD hours by division" subtitle={`Dashed line = ${pdGoal}h target`}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="division" tick={axisTick} axisLine={axisLine} tickLine={false} interval={0} />
            <YAxis
              tick={axisTick} axisLine={axisLine} tickLine={false} width={40} allowDecimals={false}
              domain={[0, (dataMax: number) => Math.max(Math.ceil(dataMax), pdGoal)]}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,56,130,0.05)' }}
              formatter={((v: number) => [`${Number(v).toFixed(1)} h`, 'Avg hours']) as never}
            />
            <ReferenceLine y={pdGoal} stroke={AMBER} strokeDasharray="4 4" />
            <Bar dataKey="avg" fill={NAVY} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Goal completion % by division, colored by how close to done */}
      <ChartCard title="Goal completion by division" subtitle="Share of active goals completed">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="division" tick={axisTick} axisLine={axisLine} tickLine={false} interval={0} />
            <YAxis domain={[0, 100]} unit="%" tick={axisTick} axisLine={axisLine} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'rgba(0,56,130,0.05)' }}
              formatter={((v: number, _n: string, entry: { payload?: DivChartRow }) =>
                [`${v}%  (${entry?.payload?.goalsDone ?? 0}/${entry?.payload?.goalsTotal ?? 0})`, 'Completed']) as never}
            />
            <Bar dataKey="goalPct" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.goalPct >= 80 ? GREEN : d.goalPct >= 40 ? NAVY : AMBER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Observation coverage % by division (staff with at least one observation) */}
      <ChartCard title="Observation coverage by division" subtitle="Staff with at least one observation">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="division" tick={axisTick} axisLine={axisLine} tickLine={false} interval={0} />
            <YAxis domain={[0, 100]} unit="%" tick={axisTick} axisLine={axisLine} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'rgba(0,56,130,0.05)' }}
              formatter={((v: number, _n: string, entry: { payload?: DivChartRow }) =>
                [`${v}% of ${entry?.payload?.count ?? 0} staff`, 'Observed']) as never}
            />
            <Bar dataKey="obsPct" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.obsPct >= 80 ? GREEN : d.obsPct >= 40 ? NAVY : AMBER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Service engagement % by division — is community load spread fairly? */}
      <ChartCard title="Service engagement by division" subtitle="Staff on a committee or with logged service">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="division" tick={axisTick} axisLine={axisLine} tickLine={false} interval={0} />
            <YAxis domain={[0, 100]} unit="%" tick={axisTick} axisLine={axisLine} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: 'rgba(0,56,130,0.05)' }}
              formatter={((v: number, _n: string, entry: { payload?: DivChartRow }) =>
                [`${v}% of ${entry?.payload?.count ?? 0} staff`, 'Engaged']) as never}
            />
            <Bar dataKey="servicePct" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.servicePct >= 80 ? GREEN : d.servicePct >= 40 ? NAVY : AMBER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
