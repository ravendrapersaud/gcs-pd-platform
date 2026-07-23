'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PdActivity, FundingRequest, PdType, FundingStatus } from '@/lib/types'
import { FALLBACK_FUND_CONFIG, parseFundSettings, effectiveAllotment, isInFundYear, fundYearLabel, fundYearRange, formatUSD, type FundConfig } from '@/lib/funds'
import clsx from 'clsx'

const PD_TYPES: PdType[] = [
  'workshop', 'conference', 'course', 'webinar', 'book_study',
  'coaching', 'peer_observation', 'self_directed', 'other',
]

const typeLabel = (t: PdType) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const statusColors: Record<FundingStatus, string> = {
  pending: 'badge-yellow',
  approved: 'badge-green',
  denied: 'badge-red',
  cancelled: 'badge-gray',
}

export default function PdLogPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'log' | 'funding'>('log')
  const [activities, setActivities] = useState<PdActivity[]>([])
  const [fundingRequests, setFundingRequests] = useState<FundingRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fundCfg, setFundCfg] = useState<FundConfig>(FALLBACK_FUND_CONFIG)
  const [myProfile, setMyProfile] = useState<{ employee_type: string | null; pd_allotment: number | null } | null>(null)

  // Activity form state
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [actForm, setActForm] = useState({
    title: '',
    type: 'workshop' as PdType,
    activity_date: new Date().toISOString().split('T')[0],
    hours: '',
    notes: '',
  })
  const [savingAct, setSavingAct] = useState(false)

  // Funding form state
  const [showFundingForm, setShowFundingForm] = useState(false)
  const [fundForm, setFundForm] = useState({
    title: '',
    amount: '',
    description: '',
    pd_activity_id: '',
    is_overseas_travel: false,
  })
  const [savingFund, setSavingFund] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const [{ data: acts }, { data: funds }, { data: profile }, { data: settings }] = await Promise.all([
      supabase
        .from('pd_activities')
        .select('*')
        .eq('user_id', user.id)
        .order('activity_date', { ascending: false }),
      supabase
        .from('funding_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('employee_type, pd_allotment')
        .eq('id', user.id)
        .single(),
      supabase.from('app_settings').select('key, value'),
    ])
    setActivities((acts ?? []) as PdActivity[])
    setFundingRequests((funds ?? []) as FundingRequest[])
    setMyProfile((profile ?? null) as { employee_type: string | null; pd_allotment: number | null } | null)
    setFundCfg(parseFundSettings(settings))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSavingAct(true)
    setFormError(null)
    const { error } = await supabase.from('pd_activities').insert({
      user_id: userId,
      title: actForm.title,
      type: actForm.type,
      activity_date: actForm.activity_date,
      hours: parseFloat(actForm.hours),
      notes: actForm.notes || null,
    })
    if (error) setFormError(error.message)
    else {
      setActForm({ title: '', type: 'workshop', activity_date: new Date().toISOString().split('T')[0], hours: '', notes: '' })
      setShowActivityForm(false)
      load()
    }
    setSavingAct(false)
  }

  const handleFundingRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    setSavingFund(true)
    setFormError(null)
    const { error } = await supabase.from('funding_requests').insert({
      user_id: userId,
      title: fundForm.title,
      amount: parseFloat(fundForm.amount),
      description: fundForm.description || null,
      pd_activity_id: fundForm.pd_activity_id || null,
      is_overseas_travel: fundForm.is_overseas_travel,
    })
    if (error) setFormError(error.message)
    else {
      setFundForm({ title: '', amount: '', description: '', pd_activity_id: '', is_overseas_travel: false })
      setShowFundingForm(false)
      load()
    }
    setSavingFund(false)
  }

  const totalHours = activities.reduce((s, a) => s + (a.hours ?? 0), 0)

  // ── PD fund allotment (resets each fund year; window depends on
  //    faculty vs staff, amount honors any per-person override) ────
  const myAllotment = effectiveAllotment(myProfile, fundCfg)
  const fundsThisYear = fundingRequests.filter((fr) => isInFundYear(fr.created_at, myProfile?.employee_type, fundCfg))
  const usedFunds = fundsThisYear
    .filter((fr) => fr.status === 'approved')
    .reduce((s, fr) => s + Number(fr.amount), 0)
  const pendingFunds = fundsThisYear
    .filter((fr) => fr.status === 'pending')
    .reduce((s, fr) => s + Number(fr.amount), 0)
  const remainingFunds = Math.max(myAllotment - usedFunds, 0)
  const usedPct = myAllotment > 0 ? Math.min(Math.round((usedFunds / myAllotment) * 100), 100) : 100
  const myYearStart = fundYearRange(myProfile?.employee_type, fundCfg).start
  const resetDateLabel = myYearStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        {(['log', 'funding'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('tab', tab === t ? 'tab-active' : 'tab-inactive')}
          >
            {t === 'log' ? 'Activity Log' : 'Funding Requests'}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <>
          {/* Summary + add */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-navy-900">{totalHours.toFixed(1)} hrs</p>
              <p className="text-sm text-gray-500">{activities.length} activities logged this year</p>
            </div>
            <button onClick={() => setShowActivityForm(!showActivityForm)} className="btn-primary">
              + Log Activity
            </button>
          </div>

          {/* Activity form */}
          {showActivityForm && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Log PD Activity</h3>
              {formError && (
                <p className="text-red-600 text-sm mb-3">{formError}</p>
              )}
              <form onSubmit={handleLogActivity} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Title <span className="text-red-500">*</span></label>
                    <input
                      required
                      className="input"
                      placeholder="Activity name"
                      value={actForm.title}
                      onChange={(e) => setActForm({ ...actForm, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Type</label>
                    <select
                      className="input"
                      value={actForm.type}
                      onChange={(e) => setActForm({ ...actForm, type: e.target.value as PdType })}
                    >
                      {PD_TYPES.map((t) => (
                        <option key={t} value={t}>{typeLabel(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      required
                      className="input"
                      value={actForm.activity_date}
                      onChange={(e) => setActForm({ ...actForm, activity_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Hours <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      className="input"
                      placeholder="e.g. 3"
                      value={actForm.hours}
                      onChange={(e) => setActForm({ ...actForm, hours: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    rows={2}
                    className="input resize-none"
                    placeholder="Key takeaways or reflection"
                    value={actForm.notes}
                    onChange={(e) => setActForm({ ...actForm, notes: e.target.value })}
                  />
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowActivityForm(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={savingAct} className="btn-primary flex-1">
                    {savingAct ? 'Saving…' : 'Log Activity'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card h-12 animate-pulse bg-gray-100" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              No activities logged yet. Start tracking your PD!
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Activity</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Date</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Hours</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activities.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{a.title}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="badge badge-navy text-xs">{typeLabel(a.type)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                        {new Date(a.activity_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-navy-800">{a.hours}h</td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {a.verified ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'funding' && (
        <>
          {/* Annual PD fund allotment */}
          <div className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-gray-500">PD fund allotment · {fundYearLabel(myProfile?.employee_type, fundCfg)}</p>
                <p className="text-3xl font-bold text-navy-900 mt-1">
                  {formatUSD(remainingFunds)} <span className="text-base font-medium text-gray-400">remaining</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Resets to {formatUSD(myAllotment)} each year on {resetDateLabel}
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-gray-400">Allotment</p>
                  <p className="font-semibold text-gray-700">{formatUSD(myAllotment)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Approved</p>
                  <p className="font-semibold text-gray-700">{formatUSD(usedFunds)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Pending</p>
                  <p className="font-semibold text-yellow-600">{formatUSD(pendingFunds)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-navy-900 transition-all" style={{ width: `${usedPct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{usedPct}% of this year&apos;s allotment used</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowFundingForm(!showFundingForm)} className="btn-primary">
              + New Request
            </button>
          </div>

          {showFundingForm && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">New Funding Request</h3>
              {formError && <p className="text-red-600 text-sm mb-3">{formError}</p>}
              <form onSubmit={handleFundingRequest} className="space-y-4">
                <div>
                  <label className="label">Title <span className="text-red-500">*</span></label>
                  <input
                    required
                    className="input"
                    placeholder="e.g. ASCD Annual Conference 2025"
                    value={fundForm.title}
                    onChange={(e) => setFundForm({ ...fundForm, title: e.target.value })}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Amount ($) <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input"
                      placeholder="e.g. 850.00"
                      value={fundForm.amount}
                      onChange={(e) => setFundForm({ ...fundForm, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Linked PD Activity</label>
                    <select
                      className="input"
                      value={fundForm.pd_activity_id}
                      onChange={(e) => setFundForm({ ...fundForm, pd_activity_id: e.target.value })}
                    >
                      <option value="">None</option>
                      {activities.map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    rows={3}
                    className="input resize-none"
                    placeholder="Justification for this funding request…"
                    value={fundForm.description}
                    onChange={(e) => setFundForm({ ...fundForm, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <span className="text-sm font-medium text-gray-700" id="overseas-label">
                    Is this a request to travel overseas?
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={clsx('text-xs font-semibold', !fundForm.is_overseas_travel ? 'text-navy-900' : 'text-gray-400')}>No</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={fundForm.is_overseas_travel}
                      aria-labelledby="overseas-label"
                      onClick={() => setFundForm({ ...fundForm, is_overseas_travel: !fundForm.is_overseas_travel })}
                      className={clsx(
                        'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2',
                        fundForm.is_overseas_travel ? 'bg-navy-900' : 'bg-gray-300'
                      )}
                    >
                      <span
                        className={clsx(
                          'inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform',
                          fundForm.is_overseas_travel ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                    <span className={clsx('text-xs font-semibold', fundForm.is_overseas_travel ? 'text-navy-900' : 'text-gray-400')}>Yes</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowFundingForm(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" disabled={savingFund} className="btn-primary flex-1">
                    {savingFund ? 'Submitting…' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="card h-16 animate-pulse bg-gray-100" />)}
            </div>
          ) : fundingRequests.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No funding requests yet.</div>
          ) : (
            <div className="space-y-3">
              {fundingRequests.map((fr) => (
                <div key={fr.id} className="card p-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{fr.title}</p>
                      {fr.is_overseas_travel && (
                        <span className="badge badge-navy text-xs">✈ Overseas travel</span>
                      )}
                    </div>
                    {fr.description && (
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{fr.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Submitted {new Date(fr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-navy-900">${Number(fr.amount).toFixed(2)}</p>
                    <span className={`badge mt-1 ${statusColors[fr.status]}`}>{fr.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
