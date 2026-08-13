import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

interface CsvRow {
  email?: string
  first_name?: string
  last_name?: string
  title?: string
  division?: string
  department?: string
  employee_id?: string
  employee_type?: string
  role?: string
  [key: string]: string | undefined
}

interface ImportError {
  row: number
  email: string
  error: string
}

const VALID_ROLES = ['staff', 'supervisor', 'admin']

export async function POST(request: NextRequest) {
  // Use service-role client to bypass RLS for user creation
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify caller is supervisor or admin. This endpoint uses the
  // service-role key to create auth users + profiles, so it MUST reject
  // any request that isn't a proven supervisor/admin. No token = no entry.
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '') ?? ''

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

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const text = await file.text()

  let rows: CsvRow[] = []
  const parseResult = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (parseResult.errors.length > 0) {
    return NextResponse.json(
      { error: `CSV parse error: ${parseResult.errors[0].message}` },
      { status: 400 }
    )
  }

  rows = parseResult.data

  const requiredFields = ['email', 'first_name', 'last_name']
  const missingFields = requiredFields.filter((f) => !parseResult.meta.fields?.includes(f))
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required columns: ${missingFields.join(', ')}` },
      { status: 400 }
    )
  }

  let created = 0
  let skipped = 0
  const errors: ImportError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-indexed + header row

    const email = row.email?.trim().toLowerCase()
    const firstName = row.first_name?.trim()
    const lastName = row.last_name?.trim()

    if (!email) {
      errors.push({ row: rowNum, email: '', error: 'Email is empty' })
      continue
    }
    if (!firstName || !lastName) {
      errors.push({ row: rowNum, email, error: 'first_name and last_name are required' })
      continue
    }

    const role = VALID_ROLES.includes(row.role?.toLowerCase() ?? '') ? row.role!.toLowerCase() : 'staff'

    // Only admins may create elevated accounts. Without this a supervisor
    // could upload a row with role=admin and mint full access (fund policy,
    // every profile, all allotments). Rejected per-row and reported rather
    // than silently downgraded, so the importer sees what was refused.
    if (role !== 'staff' && callerProfile.role !== 'admin') {
      errors.push({
        row: rowNum,
        email,
        error: `Only admins can import the "${role}" role — ask an admin to set it, or use "staff"`,
      })
      continue
    }
    const employeeType = ['faculty', 'staff', 'admin'].includes(row.employee_type?.trim().toLowerCase() ?? '')
      ? row.employee_type!.trim().toLowerCase()
      : null

    try {
      // Check if user already exists
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existingUser) {
        skipped++
        continue
      }

      // Create auth user with a random password (they will use Google SSO in practice)
      const tempPassword = `TempPW-${Math.random().toString(36).slice(2, 10)}!`
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: `${firstName} ${lastName}`,
        },
      })

      if (createErr) {
        if (createErr.message.includes('already') || createErr.message.includes('exists')) {
          skipped++
          continue
        }
        errors.push({ row: rowNum, email, error: createErr.message })
        continue
      }

      if (!newUser.user) {
        errors.push({ row: rowNum, email, error: 'User creation returned no user object' })
        continue
      }

      // Insert profile
      const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
        id: newUser.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        title: row.title?.trim() || null,
        division: row.division?.trim() || null,
        department: row.department?.trim() || null,
        employee_id: row.employee_id?.trim() || null,
        employee_type: employeeType,
      })

      if (profileErr) {
        errors.push({ row: rowNum, email, error: `Profile insert failed: ${profileErr.message}` })
        // Try to clean up auth user
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        continue
      }

      created++
    } catch (err: unknown) {
      errors.push({
        row: rowNum,
        email,
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }

  return NextResponse.json({ created, skipped, errors })
}
