'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { ResourceType } from '@/lib/types'

const RESOURCE_TYPES: ResourceType[] = [
  'webinar', 'certificate', 'conference', 'article', 'tool', 'book', 'video', 'other',
]

export default function SubmitResourcePage() {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    type: 'article' as ResourceType,
  })
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().replace(/,$/, '')
      if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let fileUrl: string | null = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `resources/${user.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('resources')
          .upload(path, file)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path)
        fileUrl = urlData.publicUrl
      }

      const { error: insertErr } = await supabase.from('resources').insert({
        title: form.title,
        description: form.description || null,
        url: form.url || null,
        file_url: fileUrl,
        type: form.type,
        tags,
        submitted_by: user.id,
        is_approved: true,
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
        <h2 className="text-xl font-semibold text-gray-800">Resource submitted!</h2>
        <p className="text-gray-500 text-sm mt-1">Redirecting to library…</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Submit a Resource</h2>

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
              placeholder="e.g. Introduction to Project-Based Learning"
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
                <option key={t} value={t} className="capitalize">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Tag input */}
          <div>
            <label className="label">Tags</label>
            <div className="border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-navy-500 focus-within:border-transparent">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 bg-navy-100 text-navy-800 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-navy-500 hover:text-navy-900 ml-0.5 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Type tag and press Enter or comma"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={addTag}
                className="w-full text-sm outline-none bg-transparent placeholder-gray-400"
              />
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="label">Attach File (optional)</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-navy-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {file ? (
                <p className="text-sm text-navy-700 font-medium">{file.name}</p>
              ) : (
                <>
                  <p className="text-gray-500 text-sm">Drag & drop or click to upload</p>
                  <p className="text-gray-400 text-xs mt-1">PDF, PPT, DOCX, or image</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Submitting…' : 'Submit Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
