import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// Creates ONE user (auth row + profile) — the single-person equivalent of
// the CSV import, for adding a late hire without building a spreadsheet.
// Uses the service-role key, so it must prove the caller is a
// supervisor/admin before doing anything (same contract as /api/import-csv).

const VALID_ROLES = ['staff', 'supervisor', 'admin']

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
  const email: string = body?.email?.trim().toLowerCase() ?? ''
  const firstName: string = body?.first_name?.trim() ?? ''
  const lastName: string = body?.last_name?.trim() ?? ''

  if (!email || !firstName || !lastName) {
    return NextResponse.json(
      { error: 'email, first_name and last_name are required' },
      { status: 400 }
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  if (!email.endsWith('@gcschool.org')) {
    return NextResponse.json(
      { error: 'Email must be an @gcschool.org address' },
      { status: 400 }
    )
  }

  // Only admins may mint elevated accounts — otherwise a supervisor could
  // grant admin (fund policy, every profile, all allotments) to anyone.
  const requestedRole: string = VALID_ROLES.includes(body?.role) ? body.role : 'staff'
  if (requestedRole !== 'staff' && callerProfile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can create supervisor or admin accounts' },
      { status: 403 }
    )
  }

  const employeeType: string | null =
    ['faculty', 'staff', 'admin'].includes(body?.employee_type) ? body.employee_type : null

  let allotment: number | null = null
  if (body?.pd_allotment !== undefined && body?.pd_allotment !== null && body?.pd_allotment !== '') {
    const n = Number(body.pd_allotment)
    if (Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: 'pd_allotment must be a positive number' }, { status: 400 })
    }
    allotment = n
  }

  // ── Refuse duplicates up front for a clear error ─────────────
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'Someone with that email already exists' },
      { status: 409 }
    )
  }

  // ── Create auth user, then profile ───────────────────────────
  // Random password: in practice everyone signs in with Google SSO. It is
  // never returned to the caller, so it cannot be used as a back door.
  const tempPassword = `TempPW-${Math.random().toString(36).slice(2, 10)}!`
  const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: `${firstName} ${lastName}` },
  })

  if (createErr || !newUser?.user) {
    return NextResponse.json(
      { error: createErr?.message ?? 'User creation returned no user' },
      { status: 500 }
    )
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: newUser.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role: requestedRole,
      title: body?.title?.trim() || null,
      division: body?.division?.trim() || null,
      department: body?.department?.trim() || null,
      employee_id: body?.employee_id?.trim() || null,
      employee_type: employeeType,
      pd_allotment: allotment,
      needs_setup: false, // created deliberately with real details
    })
    .select()
    .single()

  if (profileErr) {
    // Don't leave an orphaned auth row behind.
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json(
      { error: `Profile insert failed: ${profileErr.message}` },
      { status: 500 }
    )
  }

  // ── Optional primary supervisor ──────────────────────────────
  let supervisorWarning: string | null = null
  const supervisorId: string | undefined = body?.supervisor_id || undefined
  if (supervisorId) {
    const { error: supErr } = await supabaseAdmin
      .from('supervisor_assignments')
      .insert({ staff_id: newUser.user.id, supervisor_id: supervisorId, is_primary: true })
    if (supErr) {
      // The person exists; surface this rather than failing the whole create.
      supervisorWarning = `Created, but supervisor assignment failed: ${supErr.message}`
    }
  }

  return NextResponse.json({ ok: true, profile, warning: supervisorWarning }, { status: 201 })
}
