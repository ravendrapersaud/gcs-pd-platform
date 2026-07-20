'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Framework, FrameworkDomain, FrameworkIndicator } from '@/lib/types'
import clsx from 'clsx'

function FrameworkDetail({ fw }: { fw: Framework }) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {fw.description && (
        <p className="text-sm text-gray-600 mb-4">{fw.description}</p>
      )}
      {(fw.domains ?? []).map((domain) => (
        <div key={domain.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggle(domain.id)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-900">{domain.title}</p>
              {domain.description && (
                <p className="text-xs text-gray-500 mt-0.5">{domain.description}</p>
              )}
            </div>
            <span className="text-gray-400 shrink-0 ml-2">{open.has(domain.id) ? '▲' : '▼'}</span>
          </button>
          {open.has(domain.id) && (domain.indicators ?? []).length > 0 && (
            <ul className="border-t border-gray-100 divide-y divide-gray-100">
              {(domain.indicators ?? []).map((ind: FrameworkIndicator) => (
                <li key={ind.id} className="px-6 py-3">
                  <p className="text-sm font-medium text-gray-800">{ind.title}</p>
                  {ind.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{ind.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

interface DomainInput {
  title: string
  description: string
  indicators: { title: string; description: string }[]
}

export default function FrameworksPage() {
  const supabase = createClient()
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [selected, setSelected] = useState<Framework | null>(null)
  const [userRole, setUserRole] = useState<string>('staff')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [fwForm, setFwForm] = useState({ title: '', division: '', department: '', description: '' })
  const [domains, setDomains] = useState<DomainInput[]>([
    { title: '', description: '', indicators: [{ title: '', description: '' }] },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(p?.role ?? 'staff')
    }
    const { data: fws } = await supabase
      .from('frameworks')
      .select('*, domains:framework_domains(*, indicators:framework_indicators(*))')
      .order('title')
    setFrameworks((fws ?? []) as unknown as Framework[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addDomain = () =>
    setDomains((prev) => [...prev, { title: '', description: '', indicators: [{ title: '', description: '' }] }])

  const removeDomain = (i: number) =>
    setDomains((prev) => prev.filter((_, idx) => idx !== i))

  const updateDomain = (i: number, key: 'title' | 'description', val: string) =>
    setDomains((prev) => prev.map((d, idx) => (idx === i ? { ...d, [key]: val } : d)))

  const addIndicator = (domainIdx: number) =>
    setDomains((prev) =>
      prev.map((d, i) =>
        i === domainIdx
          ? { ...d, indicators: [...d.indicators, { title: '', description: '' }] }
          : d
      )
    )

  const updateIndicator = (
    domainIdx: number,
    indIdx: number,
    key: 'title' | 'description',
    val: string
  ) =>
    setDomains((prev) =>
      prev.map((d, di) =>
        di === domainIdx
          ? {
              ...d,
              indicators: d.indicators.map((ind, ii) =>
                ii === indIdx ? { ...ind, [key]: val } : ind
              ),
            }
          : d
      )
    )

  const removeIndicator = (domainIdx: number, indIdx: number) =>
    setDomains((prev) =>
      prev.map((d, di) =>
        di === domainIdx
          ? { ...d, indicators: d.indicators.filter((_, ii) => ii !== indIdx) }
          : d
      )
    )

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: fw, error: fwErr } = await supabase
        .from('frameworks')
        .insert({
          title: fwForm.title,
          division: fwForm.division || null,
          department: fwForm.department || null,
          description: fwForm.description || null,
          created_by: user.id,
        })
        .select()
        .single()
      if (fwErr) throw fwErr

      for (let di = 0; di < domains.length; di++) {
        const dom = domains[di]
        if (!dom.title.trim()) continue
        const { data: domRow, error: domErr } = await supabase
          .from('framework_domains')
          .insert({
            framework_id: fw.id,
            title: dom.title,
            description: dom.description || null,
            order_index: di,
          })
          .select()
          .single()
        if (domErr) throw domErr

        const indicators = dom.indicators.filter((ind) => ind.title.trim())
        if (indicators.length > 0) {
          await supabase.from('framework_indicators').insert(
            indicators.map((ind, ii) => ({
              domain_id: domRow.id,
              title: ind.title,
              description: ind.description || null,
              order_index: ii,
            }))
          )
        }
      }

      setShowCreate(false)
      setFwForm({ title: '', division: '', department: '', description: '' })
      setDomains([{ title: '', description: '', indicators: [{ title: '', description: '' }] }])
      load()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create framework')
    } finally {
      setSubmitting(false)
    }
  }

  const isSupervisorOrAdmin = userRole === 'supervisor' || userRole === 'admin'

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="btn-ghost text-sm"
        >
          ← Back to Frameworks
        </button>
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selected.title}</h2>
              {(selected.division || selected.department) && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {[selected.division, selected.department].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <span className="badge badge-navy">{(selected.domains ?? []).length} domains</span>
          </div>
          <FrameworkDetail fw={selected} />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {isSupervisorOrAdmin && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            + Create Framework
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="card p-6 space-y-5">
          <h3 className="font-semibold text-gray-900 text-lg">New Framework</h3>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Title <span className="text-red-500">*</span></label>
                <input required className="input" value={fwForm.title}
                  onChange={(e) => setFwForm({ ...fwForm, title: e.target.value })}
                  placeholder="e.g. GCS Teaching Excellence Framework" />
              </div>
              <div>
                <label className="label">Division</label>
                <input className="input" value={fwForm.division}
                  onChange={(e) => setFwForm({ ...fwForm, division: e.target.value })}
                  placeholder="Upper School" />
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" value={fwForm.department}
                  onChange={(e) => setFwForm({ ...fwForm, department: e.target.value })}
                  placeholder="All Departments" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea rows={2} className="input resize-none" value={fwForm.description}
                  onChange={(e) => setFwForm({ ...fwForm, description: e.target.value })}
                  placeholder="Purpose and scope of this framework" />
              </div>
            </div>

            {/* Domains */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-800">Domains</h4>
                <button type="button" onClick={addDomain} className="btn-ghost text-sm">
                  + Add Domain
                </button>
              </div>
              {domains.map((dom, di) => (
                <div key={di} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">DOMAIN {di + 1}</span>
                    {domains.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDomain(di)}
                        className="ml-auto text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    className="input text-sm"
                    placeholder="Domain title (required)"
                    value={dom.title}
                    onChange={(e) => updateDomain(di, 'title', e.target.value)}
                  />
                  <input
                    className="input text-sm"
                    placeholder="Domain description (optional)"
                    value={dom.description}
                    onChange={(e) => updateDomain(di, 'description', e.target.value)}
                  />
                  {/* Indicators */}
                  <div className="pl-3 border-l-2 border-gray-200 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Indicators</p>
                    {dom.indicators.map((ind, ii) => (
                      <div key={ii} className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <input
                            className="input text-sm"
                            placeholder="Indicator title"
                            value={ind.title}
                            onChange={(e) => updateIndicator(di, ii, 'title', e.target.value)}
                          />
                          <input
                            className="input text-sm"
                            placeholder="Indicator description (optional)"
                            value={ind.description}
                            onChange={(e) => updateIndicator(di, ii, 'description', e.target.value)}
                          />
                        </div>
                        {dom.indicators.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeIndicator(di, ii)}
                            className="text-gray-400 hover:text-red-500 mt-1 text-lg leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addIndicator(di)}
                      className="text-xs text-navy-700 hover:underline"
                    >
                      + Add Indicator
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1">
                {submitting ? 'Creating…' : 'Create Framework'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="card h-32 animate-pulse bg-gray-100" />)}
        </div>
      ) : frameworks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No frameworks yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {frameworks.map((fw) => (
            <button
              key={fw.id}
              onClick={() => setSelected(fw)}
              className="card p-5 text-left hover:shadow-md transition-shadow group"
            >
              <h3 className="font-semibold text-gray-900 group-hover:text-navy-800 transition-colors">
                {fw.title}
              </h3>
              {(fw.division || fw.department) && (
                <p className="text-xs text-gray-500 mt-1">
                  {[fw.division, fw.department].filter(Boolean).join(' · ')}
                </p>
              )}
              {fw.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{fw.description}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="badge badge-gray">
                  {(fw.domains ?? []).length} domain{(fw.domains ?? []).length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-navy-700 mt-2 group-hover:underline">View details →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
