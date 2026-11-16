import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Lazy "Your department" opener. Ensures the signed-in user's department
// workspace exists (creating it on first open, deduped on department name) and
// redirects into it. Falls back to the workspaces index when the user has no
// department set. The heavy lifting is in the SECURITY DEFINER RPC
// ensure_department_workspace() so a staff user can provision their own shared
// space despite the supervisor/admin-only insert policy.
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const home = new URL('/dashboard/workspaces', request.url)
  if (!user) return NextResponse.redirect(home)

  const { data: wsId, error } = await supabase.rpc('ensure_department_workspace')
  if (error || !wsId) {
    // No department on file (or the RPC failed) — send them to the index.
    return NextResponse.redirect(home)
  }
  return NextResponse.redirect(new URL(`/dashboard/workspaces/${wsId}`, request.url))
}
