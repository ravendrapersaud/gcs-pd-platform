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
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  // Enforce the school domain server-side: even if a non-gcschool
  // Google account somehow authenticates, it never gets a profile.
  const ALLOWED_DOMAIN = '@gcschool.org'
  if (!session.user.email?.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    await supabase.auth.signOut()
    redirect('/login?error=domain')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    // Profile not yet created — insert minimal row from OAuth data,
    // flagged needs_setup so admins can complete title/division/dept.
    const meta = session.user.user_metadata
    const nameParts = (meta?.full_name || meta?.name || '').split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    await supabase.from('profiles').upsert({
      id: session.user.id,
      email: session.user.email!,
      first_name: firstName,
      last_name: lastName,
      avatar_url: meta?.avatar_url || meta?.picture || null,
      role: 'staff',
      needs_setup: true,
    })
  }

  const currentProfile = (profile as Profile | null) ?? {
    id: session.user.id,
    email: session.user.email!,
    first_name: session.user.user_metadata?.full_name?.split(' ')[0] || 'User',
    last_name: session.user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
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
