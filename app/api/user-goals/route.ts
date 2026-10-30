import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Returns a person's ACTIVE (in-progress) goals as read-only context for the
// observation forms. Any authenticated gcschool user may call it — recording an
// observation is open to all adults, and the observed teacher's current goals
// give the observer something to look for. Deliberately narrow: active goals
// only, and just the fields the form shows. This is the one place where a peer
// can see a colleague's goals; the goals RLS policy stays strict everywhere
// else, so this service-role read is the single, scoped exception.

export async function GET(request: NextRequest) {
  const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── Verify caller is a signed-in user ────────────────────────
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
  if (!caller) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const userId = request.nextUrl.searchParams.get('userId') ?? ''
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('goals')
    .select('id, title, goal_type, progress_pct, due_date')
    .eq('owner_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ goals: data ?? [] })
}
