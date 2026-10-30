import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import type { Profile } from '@/lib/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Enforce the school domain server-side: even if a non-gcschool
  // Google account somehow authenticates, it never gets a profile.
  const ALLOWED_DOMAIN = '@gcschool.org'
  if (!user.email?.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    await supabase.auth.signOut()
    redirect('/login?error=domain')
  }

  // Read the profile, retrying a transient failure. A failed READ (network or
  // grant hiccup) must be distinguished from a genuine "no row" — if we can't
  // read the row we must NOT render a downgraded shell, because that looks like
  // a demotion to an admin whose row is perfectly fine (their role just didn't
  // load this request). See the throw below.
  let profile: Profile | null = null
  let profileError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    profile = (res.data as Profile | null) ?? null
    profileError = res.error
    if (!res.error) break
  }

  // Could not read the profile at all (not a "no row" — an actual error).
  // Fail loudly to the error boundary so the user can reload, rather than
  // silently presenting an admin/supervisor as a "member".
  if (profileError) {
    throw new Error('Could not load your profile — please reload. If this keeps happening, your session may have expired; sign out and back in.')
  }

  // Only provision when the read SUCCEEDED and genuinely returned no row.
  // A read error (RLS/grant hiccup, transient failure) must NOT trigger
  // provisioning: the row may already exist, and an upsert here would
  // overwrite an existing admin back down to role:'staff' + needs_setup.
  let provisioned: Profile | null = null
  if (!profileError && !profile) {
    // New user — create a minimal row from OAuth data, flagged needs_setup
    // so admins can complete title/division/dept. ignoreDuplicates makes this
    // an INSERT ... ON CONFLICT DO NOTHING, so it can never modify an existing
    // profile's role or setup flag.
    const meta = user.user_metadata
    const nameParts = (meta?.full_name || meta?.name || '').split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email!,
        first_name: firstName,
        last_name: lastName,
        avatar_url: meta?.avatar_url || meta?.picture || null,
        role: 'staff',
        needs_setup: true,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )

    // Re-read so this request renders the real row (including anything an
    // existing row kept) rather than a synthetic fallback.
    const { data: created } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    provisioned = (created as Profile | null) ?? null
  }

  const currentProfile = (profile as Profile | null) ?? provisioned ?? {
    id: user.id,
    email: user.email!,
    first_name: user.user_metadata?.full_name?.split(' ')[0] || 'User',
    last_name: user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
    role: 'staff' as const,
    title: null,
    division: null,
    department: null,
    employee_id: null,
    employee_type: null,
    pd_allotment: null,
    needs_setup: true,
    can_create_workspaces: false,
    avatar_url: null,
    created_at: new Date().toISOString(),
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar profile={currentProfile} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar profile={currentProfile} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
