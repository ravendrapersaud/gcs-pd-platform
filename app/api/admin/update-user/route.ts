import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Updates a user's identity fields (name and/or email).
// Email changes must go through the auth admin API so the login
// credential (auth.users) and the profile row stay in sync.
// Caller must be a supervisor or admin.

export async function POST(request: NextRequest) {
  const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── Verify caller ────────────────────────────────────────────
  const token = request.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
  if (!caller) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (!callerProfile || !['supervisor', 'admin'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Validate body ────────────────────────────────────────────
  const body = await request.json().catch(() => null)
  const userId: string | undefined = body?.user_id
  const firstName: string | undefined = body?.first_name?.trim()
  const lastName: string | undefined = body?.last_name?.trim()
  const email: string | undefined = body?.email?.trim().toLowerCase()

  if (!userId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  // Supervisors may only edit themselves or their assigned reports;
  // admins are unrestricted.
  if (callerProfile.role === 'supervisor' && userId !== caller.id) {
    const { data: assignment } = await supabaseAdmin
      .from('supervisor_assignments')
      .select('id')
      .eq('supervisor_id', caller.id)
      .eq('staff_id', userId)
      .maybeSingle()

    if (!assignment) {
      return NextResponse.json(
        { error: 'Forbidden — you are not the assigned supervisor for this person' },
        { status: 403 }
      )
    }
  }
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (!email.endsWith('@gcschool.org')) {
      return NextResponse.json({ error: 'Email must be an @gcschool.org address' }, { status: 400 })
    }
    // Refuse duplicates up front for a clearer error
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .neq('id', userId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'That email is already in use by another user' }, { status: 409 })
    }
  }

  // ── Apply: auth first (email), then profile ──────────────────
  if (email !== undefined) {
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    })
    if (authErr) {
      return NextResponse.json({ error: `Auth update failed: ${authErr.message}` }, { status: 500 })
    }
  }

  const profileUpdate: Record<string, string> = {}
  if (firstName) profileUpdate.first_name = firstName
  if (lastName) profileUpdate.last_name = lastName
  if (email !== undefined) profileUpdate.email = email

  if (Object.keys(profileUpdate).length > 0) {
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', userId)
    if (profErr) {
      return NextResponse.json({ error: `Profile update failed: ${profErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
