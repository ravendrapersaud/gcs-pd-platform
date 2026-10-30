import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendObservationEmail } from '@/lib/email'
import { MODES } from '@/lib/twg'
import type { Profile } from '@/lib/types'

const ALLOWED_DOMAIN = '@gcschool.org'
const MAX_EXTRA_RECIPIENTS = 25

// Normalize a cc/bcc list from the request: strings only, valid @gcschool.org
// addresses, de-duped against each other and anything already receiving the
// message. Keeps mail inside the school and prevents accidental leaks.
function cleanRecipients(raw: unknown, alreadyUsed: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set(alreadyUsed)
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const email = item.trim().toLowerCase()
    if (!email.endsWith(ALLOWED_DOMAIN)) continue
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    if (seen.has(email)) continue
    seen.add(email)
    out.push(email)
    if (out.length >= MAX_EXTRA_RECIPIENTS) break
  }
  return out
}

// Emails the observed teacher that a published observation is ready.
// Called after the observer publishes. Email is best-effort — a send
// failure never un-publishes the observation.
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const id: string | undefined = body?.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Observation id is required' }, { status: 400 })
    }

    const { data: obs } = await supabase
      .from('observations')
      .select(`
        id, observer_id, status, observed_at, notes, twg_data, is_peer,
        observed:profiles!observations_observed_id_fkey(id, first_name, last_name, email),
        observer:profiles!observations_observer_id_fkey(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .single()

    if (!obs) return NextResponse.json({ error: 'Observation not found' }, { status: 404 })
    if (obs.observer_id !== user.id) {
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

    // Extra recipients. Peer feedback is strictly between the two teachers, so
    // cc/bcc are ignored for peer observations regardless of what was sent.
    let cc: string[] = []
    let bcc: string[] = []
    if (!obs.is_peer) {
      const used = new Set<string>([teacher.email.toLowerCase()])
      cc = cleanRecipients(body?.cc, used)
      cc.forEach((e) => used.add(e))
      bcc = cleanRecipients(body?.bcc, used)
    }

    const twg = obs.twg_data as { mode?: string } | null
    const modeKey = twg?.mode as keyof typeof MODES | undefined
    const visit = obs.is_peer
      ? 'Peer feedback'
      : modeKey && MODES[modeKey] ? MODES[modeKey].label : 'Observation'
    const dateStr = new Date(obs.observed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const overall = (obs.notes as string | null) || null

    const result = await sendObservationEmail(teacher, observer, visit, dateStr, overall, Boolean(obs.is_peer), cc, bcc)

    // Audit trail — best-effort, must not fail the request.
    const { error: logErr } = await supabase.from('email_log').insert({
      email_type: 'observation',
      to_email: result.to[0] ?? teacher.email,
      cc_emails: result.cc,
      bcc_emails: result.bcc,
      subject: result.subject,
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      created_by: user.id,
    })
    if (logErr) console.error('[POST /api/observations/notify] email_log insert failed (non-fatal):', logErr)

    return NextResponse.json({ ok: result.status === 'sent', email: result.status, cc: result.cc.length, bcc: result.bcc.length })
  } catch (err: unknown) {
    console.error('[POST /api/observations/notify] unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
