'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { FundingRequest, FundingStatus, Resource } from '@/lib/types'
import { FALLBACK_FUND_CONFIG, parseFundSettings, effectiveAllotment, isInFundYear, fundYearLabel, formatUSD, type FundConfig } from '@/lib/funds'
import { fundingAdminThreshold, resourceModerationOn } from '@/lib/appSettings'
import { RESOURCE_TYPE_LABELS } from '@/lib/taxonomy'
import clsx from 'clsx'

// Pending resource with the submitter's name joined in.
type PendingResource = Resource & {
  submitter?: { first_name: string; last_name: string } | null
}

const statusColors: Record<FundingStatus, string> = {
  pending: 'badge-yellow',
  approved: 'badge-green',
  denied: 'badge-red',
  cancelled: 'badge-gray',
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function ApprovalsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'pending' | 'decided' | 'resources'>('pending')
  const [requests, setRequests] = useState<FundingRequest[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fundCfg, setFundCfg] = useState<FundConfig>(FALLBACK_FUND_CONFIG)
  const [adminThreshold, setAdminThreshold] = useState<number | null>(null)
  const [moderationOn, setModerationOn] = useState(false)
  const [pendingResources, setPendingResources] = useState<PendingResource[]>([])
  const [resActingId, setResActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setUserId(user.id)

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profErr) {
      setError(profErr.message)
      setLoading(false)
      return
    }

    const myRole = profile?.role ?? 'staff'
    setRole(myRole)

    if (myRole !== 'supervisor' && myRole !== 'admin') {
      setLoading(false)
      return
    }

    // Load fund policy settings (allotment + fund-year start dates)
    // plus the admin threshold and resource moderation flags.
    const { data: settingsRows } = await supabase.from('app_settings').select('key, value')
    setFundCfg(parseFundSettings(settingsRows))
    setAdminThreshold(fundingAdminThreshold(settingsRows))
    setModerationOn(resourceModerationOn(settingsRows))

    // Admins also review pending resource submissions here.
    if (myRole === 'admin') {
      const { data: pendingRes, error: pendingResErr } = await supabase
        .from('resources')
        .select('*, submitter:profiles!resources_submitted_by_fkey(first_name, last_name)')
        .eq('is_approved', false)
        .order('created_at', { ascending: false })
      if (pendingResErr) {
        setError(pendingResErr.message)
      } else {
        setPendingResources((pendingRes ?? []) as unknown as PendingResource[])
      }
    }

    const selectStr = `
      *,
      user:profiles!funding_requests_user_id_fkey(id, first_name, last_name, title, division, department, employee_type, pd_allotment),
      reviewer:profiles!funding_requests_reviewed_by_fkey(id, first_name, last_name)
    `

    let query = supabase
      .from('funding_requests')
      .select(selectStr)
      .order('created_at', { ascending: false })

    if (myRole !== 'admin') {
      // Supervisors only see requests from their direct reports.
      const { data: assignments, error: asgErr } = await supabase
        .from('supervisor_assignments')
        .select('staff_id')
        .eq('supervisor_id', user.id)

      if (asgErr) {
        setError(asgErr.message)
        setLoading(false)
        return
      }

      const staffIds = Array.from(new Set((assignments ?? []).map((a) => a.staff_id)))
      if (staffIds.length === 0) {
        setRequests([])
        setLoading(false)
        return
      }
      query = query.in('user_id', staffIds)
    }

    const { data, error: reqErr } = await query
    if (reqErr) {
      setError(reqErr.message)
      setLoading(false)
      return
    }

    setRequests((data ?? []) as unknown as FundingRequest[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  const decide = async (id: string, status: 'approved' | 'denied') => {
    setActingId(id)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Your session has expired — please sign in again.')

      const res = await fetch('/api/funding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id, status }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Request failed (${res.status})`)
      }

      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() }
            : r
        )
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update request')
    } finally {
      setActingId(null)
    }
  }

  // Approve or remove a pending resource submission (admins only).
  const decideResource = async (id: string, action: 'approve' | 'remove') => {
    setResActingId(id)
    setError(null)
    const { error: err } =
      action === 'approve'
        ? await supabase.from('resources').update({ is_approved: true }).eq('id', id)
        : await supabase.from('resources').delete().eq('id', id)
    if (err) {
      setError(err.message)
    } else {
      setPendingResources((prev) => prev.filter((r) => r.id !== id))
    }
    setResActingId(null)
  }

  // Approved totals per requester, counted within THEIR fund year
  // (faculty and staff have different reset dates).
  const approvedByUser: Record<string, number> = {}
  for (const r of requests) {
    if (r.status === 'approved' && isInFundYear(r.created_at, r.user?.employee_type, fundCfg)) {
      approvedByUser[r.user_id] = (approvedByUser[r.user_id] ?? 0) + Number(r.amount)
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  // Resources tab: admins only. Shown while moderation is on, or when
  // moderation is off but leftover unapproved items still exist (so
  // nothing gets stranded).
  const showResourcesTab = role === 'admin' && (moderationOn || pendingResources.length > 0)

  if (!loading && role !== null && role !== 'supervisor' && role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card p-10 text-center">
          <p className="text-gray-600 font-medium">Nothing to approve — this area is for supervisors.</p>
          <p className="text-sm text-gray-400 mt-1">
            Your own funding requests live in the PD Log.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex gap-2">
        <button
          onClick={() => setTab('pending')}
          className={clsx('tab', tab === 'pending' ? 'tab-active' : 'tab-inactive')}
        >
          Pending{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button
          onClick={() => setTab('decided')}
          className={clsx('tab', tab === 'decided' ? 'tab-active' : 'tab-inactive')}
        >
          Decided
        </button>
        {showResourcesTab && (
          <button
            onClick={() => setTab('resources')}
            className={clsx('tab', tab === 'resources' ? 'tab-active' : 'tab-inactive')}
          >
            Resources{pendingResources.length > 0 ? ` (${pendingResources.length})` : ''}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="card h-24 animate-pulse bg-gray-100" />)}
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No pending requests. You&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => {
              // Remaining is computed against the requester's own
              // allotment (profile override or school default).
              const remaining = Math.max(effectiveAllotment(r.user, fundCfg) - (approvedByUser[r.user_id] ?? 0), 0)
              const wouldLeave = remaining - Number(r.amount)
              // Over the admin-approval threshold: supervisors can't
              // decide these (admins can).
              const overThreshold = adminThreshold !== null && Number(r.amount) > adminThreshold
              return (
                <div key={r.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-500">
                        {r.user
                          ? `${r.user.first_name} ${r.user.last_name}`
                          : 'Unknown requester'}
                        {r.user?.title && <span> · {r.user.title}</span>}
                        {(r.user?.division || r.user?.department) && (
                          <span> · {r.user?.division ?? r.user?.department}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <p className="font-semibold text-gray-900">{r.title}</p>
                        {r.is_overseas_travel && (
                          <span className="badge badge-navy text-xs">✈ Overseas travel</span>
                        )}
                        {overThreshold && (
                          <span className="badge badge-red text-xs">Admin approval</span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-sm text-gray-500 mt-1">{r.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1.5">
                        Submitted {fmtDate(r.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-navy-900 text-lg">{formatUSD(Number(r.amount))}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatUSD(remaining)} remaining · {fundYearLabel(r.user?.employee_type, fundCfg)}
                      </p>
                      <p className={clsx('text-xs mt-0.5', wouldLeave < 0 ? 'text-red-600 font-medium' : 'text-gray-400')}>
                        {wouldLeave < 0
                          ? `Exceeds allotment by ${formatUSD(Math.abs(wouldLeave))}`
                          : `Would leave ${formatUSD(wouldLeave)} remaining`}
                      </p>
                    </div>
                  </div>
                  {overThreshold && role !== 'admin' ? (
                    <div className="flex mt-4 justify-end">
                      <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        Requires admin approval (over {formatUSD(adminThreshold ?? 0)})
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-3 mt-4 justify-end">
                      <button
                        onClick={() => decide(r.id, 'denied')}
                        disabled={actingId !== null}
                        className="btn-secondary text-sm"
                      >
                        {actingId === r.id ? 'Saving…' : 'Deny'}
                      </button>
                      <button
                        onClick={() => decide(r.id, 'approved')}
                        disabled={actingId !== null}
                        className="btn-primary text-sm"
                      >
                        {actingId === r.id ? 'Saving…' : 'Approve'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      ) : tab === 'resources' ? (
        pendingResources.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No resource submissions awaiting approval.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingResources.map((res) => (
              <div key={res.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-500">
                      {res.submitter
                        ? `${res.submitter.first_name} ${res.submitter.last_name}`
                        : 'Unknown submitter'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <p className="font-semibold text-gray-900">{res.title}</p>
                      <span className="badge badge-navy text-xs">
                        {RESOURCE_TYPE_LABELS[res.type] ?? res.type}
                      </span>
                    </div>
                    {res.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{res.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">
                      Submitted {fmtDate(res.created_at)}
                    </p>
                    {res.url && (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-navy-800 text-xs font-semibold hover:text-navy-900 mt-1"
                      >
                        Open resource →
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 mt-4 justify-end">
                  <button
                    onClick={() => decideResource(res.id, 'remove')}
                    disabled={resActingId !== null}
                    className="btn-secondary text-sm"
                  >
                    {resActingId === res.id ? 'Saving…' : 'Remove'}
                  </button>
                  <button
                    onClick={() => decideResource(res.id, 'approve')}
                    disabled={resActingId !== null}
                    className="btn-primary text-sm"
                  >
                    {resActingId === res.id ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : decided.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No decided requests yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Requester</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Request</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Reviewer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Decided</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {decided.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700">
                    {r.user ? `${r.user.first_name} ${r.user.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.title}</td>
                  <td className="px-4 py-3 text-right font-semibold text-navy-800">
                    {formatUSD(Number(r.amount))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${statusColors[r.status]} capitalize`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {r.reviewer
                      ? `${r.reviewer.first_name} ${r.reviewer.last_name}`
                      : r.reviewed_by === userId
                        ? 'You'
                        : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {r.reviewed_at ? fmtDate(r.reviewed_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
