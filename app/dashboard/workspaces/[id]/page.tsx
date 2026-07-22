'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type {
  Profile, Workspace, WorkspaceMember, WorkspacePost, WorkspaceFile,
} from '@/lib/types'
import { openDrivePicker, driveIconFromUrl } from '@/lib/googleDrive'
import clsx from 'clsx'

type Tab = 'feed' | 'files' | 'members'

const FILE_ICONS: Record<string, string> = {
  doc: '📄', sheet: '📊', slide: '📽', form: '📋', pdf: '📕', file: '📁', upload: '⬆',
}

function fileIcon(f: WorkspaceFile): string {
  if (f.drive_url) return FILE_ICONS[f.drive_icon ?? 'file'] ?? '📁'
  if (f.name.toLowerCase().endsWith('.pdf')) return FILE_ICONS.pdf
  return FILE_ICONS.upload
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Avatar({ profile, size = 'w-9 h-9' }: { profile?: Profile; size?: string }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={`${profile.first_name} ${profile.last_name}`}
        className={clsx(size, 'rounded-full object-cover shrink-0')}
      />
    )
  }
  return (
    <div className={clsx(size, 'rounded-full bg-navy-100 flex items-center justify-center shrink-0')}>
      <span className="text-navy-700 text-xs font-bold">
        {profile?.first_name?.[0]}{profile?.last_name?.[0]}
      </span>
    </div>
  )
}

export default function WorkspaceDetailPage({ params }: { params: { id: string } }) {
  const wsId = params.id
  const supabase = createClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [posts, setPosts] = useState<WorkspacePost[]>([])
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [me, setMe] = useState<Profile | null>(null)
  const [tab, setTab] = useState<Tab>('feed')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Composer
  const [postTitle, setPostTitle] = useState('')
  const [postContent, setPostContent] = useState('')
  const [posting, setPosting] = useState(false)

  // Files
  const [uploading, setUploading] = useState(false)
  const [showDriveForm, setShowDriveForm] = useState(false)
  const [driveName, setDriveName] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [savingDrive, setSavingDrive] = useState(false)

  // Members
  const [showAddMember, setShowAddMember] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [
      { data: prof },
      { data: ws, error: wsErr },
      { data: mems, error: memErr },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('workspaces').select('*').eq('id', wsId).single(),
      supabase
        .from('workspace_members')
        .select('*, profile:profiles(*)')
        .eq('workspace_id', wsId),
    ])

    if (wsErr) {
      setError(`Could not load workspace: ${wsErr.message}`)
      setLoading(false)
      return
    }
    if (memErr) setError(`Could not load members: ${memErr.message}`)

    setMe((prof ?? null) as Profile | null)
    setWorkspace((ws ?? null) as Workspace | null)
    const memberRows = (mems ?? []) as unknown as WorkspaceMember[]
    setMembers(memberRows)

    const amMember = memberRows.some((m) => m.user_id === user.id)
    const amAdmin = (prof as Profile | null)?.role === 'admin'

    if (amMember || amAdmin) {
      const [{ data: ps, error: postErr }, { data: fs, error: fileErr }] = await Promise.all([
        supabase
          .from('workspace_posts')
          .select('*, author:profiles(*)')
          .eq('workspace_id', wsId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('workspace_files')
          .select('*, uploader:profiles(*)')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false }),
      ])
      if (postErr) setError(`Could not load posts: ${postErr.message}`)
      if (fileErr) setError(`Could not load files: ${fileErr.message}`)
      setPosts((ps ?? []) as unknown as WorkspacePost[])
      setFiles((fs ?? []) as unknown as WorkspaceFile[])
    } else {
      setPosts([])
      setFiles([])
    }
    setLoading(false)
  }, [wsId])

  useEffect(() => { load() }, [load])

  const myMembership = members.find((m) => m.user_id === me?.id)
  const isMember = !!myMembership
  const isAdmin = me?.role === 'admin'
  const isManager = !!myMembership?.is_manager || isAdmin || me?.role === 'supervisor'
  const managerCount = members.filter((m) => m.is_manager).length
  const canViewContent = isMember || isAdmin

  // ── Feed actions ─────────────────────────────────────────────
  const handlePost = async () => {
    if (!me || !postContent.trim()) return
    setPosting(true)
    setError(null)
    const { error: err } = await supabase.from('workspace_posts').insert({
      workspace_id: wsId,
      author_id: me.id,
      title: postTitle.trim() || null,
      content: postContent.trim(),
    })
    if (err) {
      setError(`Could not publish post: ${err.message}`)
      setPosting(false)
      return
    }
    setPostTitle('')
    setPostContent('')
    setPosting(false)
    load()
  }

  const handleDeletePost = async (postId: string) => {
    setError(null)
    const { error: err } = await supabase.from('workspace_posts').delete().eq('id', postId)
    if (err) setError(`Could not delete post: ${err.message}`)
    else load()
  }

  const handleTogglePin = async (post: WorkspacePost) => {
    setError(null)
    const { error: err } = await supabase
      .from('workspace_posts')
      .update({ is_pinned: !post.is_pinned })
      .eq('id', post.id)
    if (err) setError(`Could not ${post.is_pinned ? 'unpin' : 'pin'} post: ${err.message}`)
    else load()
  }

  // ── File actions ─────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !me) return
    setUploading(true)
    setError(null)

    const path = `${wsId}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('workspace-files').upload(path, file)
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('workspace-files').getPublicUrl(path)

    const { error: insErr } = await supabase.from('workspace_files').insert({
      workspace_id: wsId,
      uploaded_by: me.id,
      name: file.name,
      file_url: publicUrl,
      size_bytes: file.size,
    })
    if (insErr) setError(`File uploaded, but saving the record failed: ${insErr.message}`)

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    load()
  }

  const saveDriveFile = async (name: string, url: string, iconType?: string) => {
    if (!me) return
    setError(null)
    const { error: err } = await supabase.from('workspace_files').insert({
      workspace_id: wsId,
      uploaded_by: me.id,
      name,
      drive_url: url,
      drive_icon: iconType ?? driveIconFromUrl(url),
    })
    if (err) setError(`Could not add Drive file: ${err.message}`)
    else load()
  }

  const handleDrivePicker = async () => {
    setError(null)
    try {
      await openDrivePicker((picked) => {
        saveDriveFile(picked.name, picked.url, picked.iconType)
      })
    } catch (e) {
      if (e instanceof Error && e.message === 'picker-not-configured') {
        setShowDriveForm(true)
      } else {
        setError(`Google Drive picker failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const handleDrivePaste = async () => {
    if (!driveName.trim() || !driveUrl.trim()) {
      setError('Both a name and a Drive link are required.')
      return
    }
    setSavingDrive(true)
    await saveDriveFile(driveName.trim(), driveUrl.trim())
    setSavingDrive(false)
    setShowDriveForm(false)
    setDriveName('')
    setDriveUrl('')
  }

  const handleDeleteFile = async (fileId: string) => {
    setError(null)
    const { error: err } = await supabase.from('workspace_files').delete().eq('id', fileId)
    if (err) setError(`Could not delete file: ${err.message}`)
    else load()
  }

  // ── Member actions ───────────────────────────────────────────
  const openAddMember = async () => {
    setShowAddMember(true)
    if (allProfiles.length === 0) {
      const { data, error: err } = await supabase.from('profiles').select('*').order('last_name')
      if (err) setError(`Could not load staff list: ${err.message}`)
      setAllProfiles((data ?? []) as Profile[])
    }
  }

  const handleAddMember = async (userId: string) => {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('workspace_members').insert({
      workspace_id: wsId,
      user_id: userId,
      is_manager: false,
      added_via: 'manual',
    })
    if (err) setError(`Could not add member: ${err.message}`)
    setBusy(false)
    setMemberSearch('')
    load()
  }

  const handleRemoveMember = async (userId: string) => {
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', wsId)
      .eq('user_id', userId)
    if (err) setError(`Could not remove member: ${err.message}`)
    setBusy(false)
    load()
  }

  const handleSync = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    const { data, error: err } = await supabase.rpc('sync_workspace_members', { ws_id: wsId })
    if (err) setError(`Sync failed: ${err.message}`)
    else setNotice(`Sync complete — +${data ?? 0} member${data === 1 ? '' : 's'} added.`)
    setBusy(false)
    load()
  }

  const handleLeave = async () => {
    if (!me) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', wsId)
      .eq('user_id', me.id)
    if (err) {
      setError(`Could not leave workspace: ${err.message}`)
      setBusy(false)
      return
    }
    router.push('/dashboard/workspaces')
  }

  const handleJoin = async () => {
    if (!me) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.from('workspace_members').insert({
      workspace_id: wsId,
      user_id: me.id,
      is_manager: false,
      added_via: 'manual',
    })
    if (err) setError(`Could not join workspace: ${err.message}`)
    setBusy(false)
    load()
  }

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="card h-28 animate-pulse bg-gray-100" />
        <div className="card h-64 animate-pulse bg-gray-100" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card p-8 text-center space-y-3">
          <p className="text-gray-500">Workspace not found.</p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={() => router.push('/dashboard/workspaces')} className="btn-secondary">
            Back to Workspaces
          </button>
        </div>
      </div>
    )
  }

  const filesByPost: Record<string, WorkspaceFile[]> = {}
  for (const f of files) {
    if (f.post_id) filesByPost[f.post_id] = [...(filesByPost[f.post_id] ?? []), f]
  }

  const searchResults = memberSearch.trim()
    ? allProfiles
        .filter((p) => !members.some((m) => m.user_id === p.id))
        .filter((p) =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(memberSearch.toLowerCase())
        )
        .slice(0, 8)
    : []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {notice}
        </div>
      )}

      {/* Header */}
      <div className="card p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-2xl text-navy-900">{workspace.name}</h1>
            {workspace.description && (
              <p className="text-sm text-gray-600 mt-1">{workspace.description}</p>
            )}
          </div>
          <span className="text-sm text-gray-400 whitespace-nowrap">
            {members.length} member{members.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {workspace.rule_division && <span className="badge badge-navy">{workspace.rule_division}</span>}
          {workspace.rule_department && <span className="badge badge-gray">{workspace.rule_department}</span>}
          {workspace.rule_employee_type && (
            <span className="badge badge-gray capitalize">{workspace.rule_employee_type}</span>
          )}
          {!workspace.rule_division && !workspace.rule_department && !workspace.rule_employee_type && (
            <span className="badge badge-gray">Manual membership</span>
          )}
        </div>
      </div>

      {/* Non-member gate */}
      {!canViewContent ? (
        <div className="card p-8 text-center space-y-3">
          <p className="text-gray-600">
            You&apos;re not a member of this workspace yet. Join to see posts and files.
          </p>
          <button onClick={handleJoin} disabled={busy} className="btn-primary">
            {busy ? 'Joining…' : 'Join Workspace'}
          </button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-2">
            {(['feed', 'files', 'members'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx('tab capitalize', tab === t ? 'tab-active' : 'tab-inactive')}
              >
                {t}
              </button>
            ))}
          </div>

          {/* ── Feed tab ─────────────────────────────────────── */}
          {tab === 'feed' && (
            <div className="space-y-4">
              {isMember && (
                <div className="card p-4 space-y-3">
                  <input
                    className="input"
                    placeholder="Title (optional) — e.g. Math Dept Meeting 9/12 Notes"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                  />
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Share notes, links, or an update with the group…"
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handlePost}
                      disabled={posting || !postContent.trim()}
                      className="btn-primary text-sm"
                    >
                      {posting ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                </div>
              )}

              {posts.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">
                  No posts yet — be the first to share something.
                </p>
              ) : (
                posts.map((post) => {
                  const canDelete = post.author_id === me?.id || isManager
                  return (
                    <div key={post.id} className="card p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <Avatar profile={post.author} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900 text-sm">
                              {post.author?.first_name} {post.author?.last_name}
                            </span>
                            <span className="text-xs text-gray-400">{fmtDate(post.created_at)}</span>
                            {post.is_pinned && <span className="badge badge-yellow">📌 Pinned</span>}
                          </div>
                          {post.title && (
                            <p className="font-bold text-gray-900 mt-1">{post.title}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isManager && (
                            <button
                              onClick={() => handleTogglePin(post)}
                              className="text-xs text-gray-400 hover:text-navy-700"
                            >
                              {post.is_pinned ? 'Unpin' : 'Pin'}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="text-xs text-gray-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                      {(filesByPost[post.id] ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(filesByPost[post.id] ?? []).map((f) => (
                            <a
                              key={f.id}
                              href={f.drive_url ?? f.file_url ?? '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 hover:border-navy-300"
                            >
                              <span>{fileIcon(f)}</span>
                              <span className="truncate max-w-[180px]">{f.name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── Files tab ────────────────────────────────────── */}
          {tab === 'files' && (
            <div className="space-y-4">
              {isMember && (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="btn-primary text-sm"
                  >
                    {uploading ? 'Uploading…' : '⬆ Upload file'}
                  </button>
                  <button onClick={handleDrivePicker} className="btn-secondary text-sm">
                    Add from Google Drive
                  </button>
                </div>
              )}

              {/* Paste-a-link fallback when the picker isn't configured */}
              {showDriveForm && (
                <div className="card p-4 space-y-3">
                  <p className="text-sm text-gray-600">
                    The Google Drive picker isn&apos;t configured yet — paste a Drive link instead.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input
                      className="input"
                      placeholder="File name — e.g. Meeting agenda"
                      value={driveName}
                      onChange={(e) => setDriveName(e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="https://docs.google.com/…"
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowDriveForm(false)} className="btn-secondary text-sm">
                      Cancel
                    </button>
                    <button onClick={handleDrivePaste} disabled={savingDrive} className="btn-primary text-sm">
                      {savingDrive ? 'Adding…' : 'Add link'}
                    </button>
                  </div>
                </div>
              )}

              {files.length === 0 ? (
                <p className="text-center py-10 text-gray-400 text-sm">
                  No files yet — upload one or link a Google Doc.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.map((f) => {
                    const canDeleteFile = f.uploaded_by === me?.id || isManager
                    return (
                      <div key={f.id} className="card p-4 space-y-2 relative group">
                        <a
                          href={f.drive_url ?? f.file_url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="block space-y-2"
                        >
                          <div className="text-2xl">{fileIcon(f)}</div>
                          <p className="font-medium text-sm text-gray-900 break-words">{f.name}</p>
                          <p className="text-xs text-gray-400">
                            {f.uploader
                              ? `${f.uploader.first_name} ${f.uploader.last_name} · `
                              : ''}
                            {fmtDate(f.created_at)}
                            {fmtSize(f.size_bytes) ? ` · ${fmtSize(f.size_bytes)}` : ''}
                          </p>
                        </a>
                        {canDeleteFile && (
                          <button
                            onClick={() => handleDeleteFile(f.id)}
                            className="absolute top-2 right-2 text-gray-300 hover:text-red-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete file"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Members tab ──────────────────────────────────── */}
          {tab === 'members' && (
            <div className="space-y-4">
              {isManager && (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={openAddMember} className="btn-primary text-sm">
                    + Add member
                  </button>
                  <button onClick={handleSync} disabled={busy} className="btn-secondary text-sm">
                    {busy ? 'Working…' : 'Sync members'}
                  </button>
                  <span className="text-xs text-gray-400">
                    Sync re-applies the auto-membership rules to the current staff roster.
                  </span>
                </div>
              )}

              {showAddMember && (
                <div className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-gray-900">Add a member</p>
                    <button
                      onClick={() => setShowAddMember(false)}
                      className="text-gray-400 hover:text-gray-700"
                    >
                      &times;
                    </button>
                  </div>
                  <input
                    className="input"
                    placeholder="Search staff by name…"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                  {searchResults.length > 0 && (
                    <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                      {searchResults.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center justify-between px-3 py-2 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar profile={p} size="w-7 h-7" />
                            <span className="text-sm text-gray-800">
                              {p.first_name} {p.last_name}
                            </span>
                            {p.title && <span className="text-xs text-gray-400">{p.title}</span>}
                          </div>
                          <button
                            onClick={() => handleAddMember(p.id)}
                            disabled={busy}
                            className="btn-secondary text-xs"
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {memberSearch.trim() && searchResults.length === 0 && (
                    <p className="text-xs text-gray-400">No matching staff (or they&apos;re already members).</p>
                  )}
                </div>
              )}

              <div className="card overflow-hidden">
                <ul className="divide-y divide-gray-100">
                  {members
                    .slice()
                    .sort((a, b) =>
                      `${a.profile?.last_name}`.localeCompare(`${b.profile?.last_name}`)
                    )
                    .map((m) => {
                      const isSelf = m.user_id === me?.id
                      const isLastManager = m.is_manager && managerCount === 1
                      return (
                        <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                          <Avatar profile={m.profile} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-gray-900">
                                {m.profile?.first_name} {m.profile?.last_name}
                              </span>
                              {m.is_manager && <span className="badge badge-navy">Manager</span>}
                              {m.added_via === 'rule' && <span className="badge badge-gray">auto</span>}
                            </div>
                            <p className="text-xs text-gray-400 truncate">
                              {[m.profile?.title, m.profile?.division, m.profile?.department]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </p>
                          </div>
                          {isSelf && !isLastManager && (
                            <button
                              onClick={handleLeave}
                              disabled={busy}
                              className="text-xs text-gray-400 hover:text-red-600"
                            >
                              Leave workspace
                            </button>
                          )}
                          {!isSelf && isManager && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              disabled={busy}
                              className="text-xs text-gray-400 hover:text-red-600"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      )
                    })}
                </ul>
                {members.length === 0 && (
                  <p className="text-center py-10 text-gray-400 text-sm">No members yet.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
