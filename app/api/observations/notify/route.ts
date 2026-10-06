import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendObservationEmail } from '@/lib/email'
import { MODES } from '@/lib/twg'
import type { Profile } from '@/lib/types'

// Emails the observed teacher that a published observation is ready.
// Called after the observer publishes. Email is best-effort — a send
// failure never un-publishes the observation.
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const id: string | undefined = body?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Observation id is required' }, { status: 400 })
    }

    const { data: obs } = await supabase
      .from('observations')
      .select(`
        id, observer_id, status, observed_at, notes, twg_data,
        observed:profiles!observations_observed_id_fkey(id, first_name, last_name, email),
        observer:profiles!observations_observer_id_fkey(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .single()

    if (!obs) return NextResponse.json({ error: 'Observation not found' }, { status: 404 })
    if (obs.observer_id !== session.user.id) {
      return NextResponse.json({ error: 'Only the observer can notify the teacher.' }, { status: 403 })
    }
    if (obs.status !== 'published') {
      return NextResponse.json({ error: 'Publish the observation before notifying.' }, { status: 409 })
    }

    const teacher = obs.observed as unknown as Profile
    const observer = obs.observer as unknown as Profile
    if (!teacher?.email) {
      return NextResponse.json({ error: 'The teacher has no email address on file.' }, { status: 422 })
    }

    const twg = obs.twg_data as { mode?: string } | null
    const modeKey = twg?.mode as keyof typeof MODES | undefined
    const visit = modeKey && MODES[modeKey] ? MODES[modeKey].label : 'Observation'
    const dateStr = new Date(obs.observed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const overall = (obs.notes as string | null) || null

    const result = await sendObservationEmail(teacher, observer, visit, dateStr, overall)

    // Audit trail — best-effort, must not fail the request.
    const { error: logErr } = await supabase.from('email_log').insert({
      email_type: 'observation',
      to_email: result.to[0] ?? teacher.email,
      cc_emails: result.cc,
      subject: result.subject,
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      created_by: session.user.id,
    })
    if (logErr) console.error('[POST /api/observations/notify] email_log insert failed (non-fatal):', logErr)

    return NextResponse.json({ ok: result.status === 'sent', email: result.status })
  } catch (err: unknown) {
    console.error('[POST /api/observations/notify] unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
