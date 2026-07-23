'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Resource, ResourceType } from '@/lib/types'
import { RESOURCE_TYPES, RESOURCE_TYPE_LABELS } from '@/lib/taxonomy'
import { termsFor, type TaxonomyTerm } from '@/lib/taxonomyDb'
import { resourceModerationOn, type AppSettingRow } from '@/lib/appSettings'
import clsx from 'clsx'

function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={clsx(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              active
                ? 'bg-navy-900 text-white border-navy-900'
                : 'border-gray-300 text-gray-600 hover:border-navy-400'
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export default function SubmitResourcePage() {
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    cover_image: '',
    type: 'website' as ResourceType,
  })
  const [audience, setAudience] = useState<string[]>([])
  const [subjects, setSubjects] = useState<string[]>([])
  const [themes, setThemes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Cover image: paste a URL, or upload a file to Supabase Storage
  const [imageMode, setImageMode] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false)

  // Admin-managed tag lists + moderation setting
  const [taxTerms, setTaxTerms] = useState<TaxonomyTerm[]>([])
  const [moderation, setModeration] = useState(false)

  // Edit mode
  const [editId, setEditId] = useState<string | null>(null)
  const [editDenied, setEditDenied] = useState(false)
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    const loadMeta = async () => {
      const [{ data: tax }, { data: settings }] = await Promise.all([
        supabase.from('taxonomy_terms').select('*').order('sort_order', { ascending: true }),
        supabase.from('app_settings').select('key, value'),
      ])
      setTaxTerms((tax ?? []) as TaxonomyTerm[])
      setModeration(resourceModerationOn((settings ?? []) as AppSettingRow[]))
    }
    loadMeta()

    // Detect edit mode from the URL (avoids useSearchParams / Suspense requirement)
    const id = new URLSearchParams(window.location.search).get('edit')
    if (id) {
      setEditId(id)
      setEditLoading(true)
      const loadResource = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            setEditDenied(true)
            return
          }
          const [{ data: res }, { data: profile }] = await Promise.all([
            supabase.from('resources').select('*').eq('id', id).maybeSingle(),
            supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          ])
          const resource = res as unknown as Resource | null
          const role = (profile as unknown as { role: string } | null)?.role
          if (!resource || !(resource.submitted_by === user.id || role === 'admin')) {
            setEditDenied(true)
            return
          }
          setForm({
            title: resource.title,
            description: resource.description ?? '',
            url: resource.url ?? '',
            cover_image: resource.cover_image ?? '',
            type: resource.type as ResourceType,
          })
          setAudience(resource.audience ?? [])
          setSubjects(resource.subjects ?? [])
          setThemes(resource.themes ?? [])
        } catch {
          setEditDenied(true)
        } finally {
          setEditLoading(false)
        }
      }
      loadResource()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('resource-covers')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('resource-covers').getPublicUrl(path)
      setForm((f) => ({ ...f, cover_image: data.publicUrl }))
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Upload failed: ${err.message}. (Make sure a public "resource-covers" storage bucket exists.)`
          : 'Upload failed.'
      )
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      if (editId) {
        // Edit mode: update the existing resource. is_approved is intentionally
        // left out so the existing value is preserved.
        const { data: updated, error: updateErr } = await supabase
          .from('resources')
          .update({
            title: form.title,
            description: form.description || null,
            url: form.url || null,
            cover_image: form.cover_image || null,
            type: form.type,
            audience,
            subjects,
            themes,
            tags: [...themes], // legacy backward-compat
          })
          .eq('id', editId)
          .select()

        if (updateErr) throw updateErr
        if (!updated || updated.length === 0) {
          throw new Error("You don't have permission to edit this resource.")
        }

        setSuccess(true)
        setTimeout(() => router.push('/dashboard/resources'), 1500)
        return
      }

      const { error: insertErr } = await supabase.from('resources').insert({
        title: form.title,
        description: form.description || null,
        url: form.url || null,
        cover_image: form.cover_image || null,
        type: form.type,
        audience,
        subjects,
        themes,
        tags: [...themes], // legacy backward-compat
        submitted_by: user.id,
        // With moderation on, submissions wait for admin approval.
        is_approved: !moderation,
      })

      if (insertErr) throw insertErr

      setSuccess(true)
      setTimeout(() => router.push('/dashboard/resources'), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit resource')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <p className="text-4xl mb-4">✅</p>
        <h2 className="text-xl font-semibold text-gray-800">
          {editId ? 'Resource updated.' : moderation ? 'Submitted for approval' : 'Resource submitted!'}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          {editId
            ? 'Redirecting to library…'
            : moderation
            ? 'Submitted for approval — it will appear once approved.'
            : 'Redirecting to library…'}
        </p>
      </div>
    )
  }

  if (editDenied) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          You don&apos;t have permission to edit this resource.
        </div>
        <Link
          href="/dashboard/resources"
          className="inline-block mt-4 text-navy-800 text-sm font-semibold hover:text-navy-900"
        >
          ← Back to Resource Library
        </Link>
      </div>
    )
  }

  if (editLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 h-96 animate-pulse bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          {editId ? 'Edit Resource' : 'Submit a Resource'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label" htmlFor="title">Title <span className="text-red-500">*</span></label>
            <input
              id="title"
              required
              className="input"
              placeholder="e.g. The Writing Revolution"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={3}
              className="input resize-none"
              placeholder="Briefly describe this resource…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="url">URL</label>
            <input
              id="url"
              type="url"
              className="input"
              placeholder="https://example.com"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="type">Type <span className="text-red-500">*</span></label>
            <select
              id="type"
              required
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ResourceType })}
            >
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Cover image</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setImageMode('url')}
                  className={clsx('px-3 py-1 font-medium', imageMode === 'url' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50')}
                >
                  Paste URL
                </button>
                <button
                  type="button"
                  onClick={() => setImageMode('upload')}
                  className={clsx('px-3 py-1 font-medium', imageMode === 'upload' ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50')}
                >
                  Upload file
                </button>
              </div>
            </div>

            {imageMode === 'url' ? (
              <>
                <input
                  id="cover_image"
                  type="url"
                  className="input"
                  placeholder="https://images.unsplash.com/…"
                  value={form.cover_image}
                  onChange={(e) => setForm({ ...form, cover_image: e.target.value })}
                />
                <p className="text-xs text-gray-400 mt-1">Paste an image URL, or leave blank for a placeholder.</p>
              </>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-navy-900 file:text-white file:text-sm file:font-medium hover:file:bg-navy-800 file:cursor-pointer disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {uploading ? 'Uploading…' : 'PNG or JPG, up to 5 MB.'}
                </p>
              </>
            )}

            {form.cover_image && (
              <div className="mt-3 relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.cover_image} alt="Cover preview" className="h-28 rounded-lg border border-gray-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, cover_image: '' })}
                  className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full w-6 h-6 text-gray-500 hover:text-red-600 shadow-sm"
                  aria-label="Remove cover image"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="label">Audience</label>
            <ChipGroup options={termsFor(taxTerms, 'audience')} selected={audience} onToggle={toggle(setAudience)} />
          </div>

          <div>
            <label className="label">Subjects</label>
            <ChipGroup options={termsFor(taxTerms, 'subject')} selected={subjects} onToggle={toggle(setSubjects)} />
          </div>

          <div>
            <label className="label">Themes</label>
            <ChipGroup options={termsFor(taxTerms, 'theme')} selected={themes} onToggle={toggle(setThemes)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading || uploading} className="btn-primary flex-1">
              {loading
                ? editId
                  ? 'Saving…'
                  : 'Submitting…'
                : uploading
                ? 'Uploading image…'
                : editId
                ? 'Save Changes'
                : 'Submit Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
