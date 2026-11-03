import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendObservationInvite } from '@/lib/email'
import type { IcsEvent } from '@/lib/ics'
import type { Profile } from '@/lib/types'

// Emails the observed teacher a calendar invite for a scheduled observation
// (and, when a post-observation meeting date is set, a second invite), copying
// the observer. The pre-observation prework rides along in the description.
// Only the observer or an admin can trigger it.

const MODE_MINUTES: Record<string, number> = { popin: 10, short: 25, full: 60 }

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const id: string | undefined = body?.id
    if (!id) return NextResponse.json({ error: 'Observation id is required' }, { status: 400 })

    const { data: obs } = await supabase
      .from('observations')
      .select(`
        id, observer_id, observed_at, post_obs_meeting_date, twg_data, course_grade,
        observed:profiles!observations_observed_id_fkey(id, first_name, last_name, email),
        observer:profiles!observations_observer_id_fkey(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .single()

    if (!obs) return NextResponse.json({ error: 'Observation not found' }, { status: 404 })

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (obs.observer_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Only the observer can send the invite.' }, { status: 403 })
    }

    const teacher = obs.observed as unknown as Profile
    const observer = obs.observer as unknown as Profile
    if (!teacher?.email) return NextResponse.json({ error: 'The teacher has no email on file.' }, { status: 422 })
    if (!obs.observed_at) return NextResponse.json({ error: 'Set an observation date first.' }, { status: 422 })

    const twg = obs.twg_data as { mode?: string; pre?: { focus?: string; objective?: string; unit?: string; style?: string } } | null
    const minutes = MODE_MINUTES[twg?.mode ?? 'full'] ?? 60
    const location = (obs.course_grade as string) || 'Classroom'
    const observerName = `${observer?.first_name ?? ''} ${observer?.last_name ?? ''}`.trim() || 'Your observer'
    const teacherName = `${teacher.first_name} ${teacher.last_name}`

    const pre = twg?.pre
    const preLines = [
      pre?.focus ? `Focus: ${pre.focus}` : '',
      pre?.objective ? `Lesson objective: ${pre.objective}` : '',
      pre?.unit ? `Unit context: ${pre.unit}` : '',
    ].filter(Boolean).join('\n')

    const start = new Date(obs.observed_at as string)
    const events: IcsEvent[] = [{
      uid: `obs-${obs.id}@gcschool.org`,
      start,
      end: new Date(start.getTime() + minutes * 60000),
      summary: `Teaching with Grace observation with ${observerName}`,
      description: `A classroom observation by ${observerName}.${preLines ? `\n\n${preLines}` : ''}`,
      location,
      organizerName: observerName,
      organizerEmail: observer?.email ?? 'noreply@notify.gcschool.org',
      attendeeName: teacherName,
      attendeeEmail: teacher.email,
    }]

    if (obs.post_obs_meeting_date) {
      const pstart = new Date(obs.post_obs_meeting_date as string)
      if (!isNaN(pstart.getTime())) {
        events.push({
          uid: `obs-${obs.id}-post@gcschool.org`,
          start: pstart,
          end: new Date(pstart.getTime() + 30 * 60000),
          summary: `Post-observation meeting with ${observerName}`,
          description: `Debrief of the ${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} observation.`,
          location: 'TBD',
          organizerName: observerName,
          organizerEmail: observer?.email ?? 'noreply@notify.gcschool.org',
          attendeeName: teacherName,
          attendeeEmail: teacher.email,
        })
      }
    }

    const dateStr = start.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
      <h2 style="color:#003882">Observation scheduled</h2>
      <p>Hi ${teacher.first_name}, ${observerName} has scheduled a Teaching with Grace observation with you for <strong>${dateStr}</strong>.</p>
      ${preLines ? `<p style="background:#f8fafc;border-left:4px solid #003882;padding:12px 16px;white-space:pre-wrap">${preLines.replace(/</g, '&lt;')}</p>` : ''}
      ${events.length > 1 ? `<p>A separate invite for the post-observation meeting is attached too.</p>` : ''}
      <p style="color:#6b7280;font-size:13px">The calendar invite${events.length > 1 ? 's are' : ' is'} attached — accept to add ${events.length > 1 ? 'them' : 'it'} to your Google Calendar.</p>
    </div>`

    const result = await sendObservationInvite({
      to: teacher.email,
      cc: observer?.email ? [observer.email] : [],
      subject: `Observation scheduled — ${dateStr}`,
      html,
      events,
    })

    const { error: logErr } = await supabase.from('email_log').insert({
      email_type: 'observation_invite',
      to_email: teacher.email,
      cc_emails: result.cc,
      bcc_emails: result.bcc,
      subject: result.subject,
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      created_by: user.id,
    })
    if (logErr) console.error('[invite] email_log insert failed (non-fatal):', logErr)

    return NextResponse.json({ ok: result.status === 'sent', email: result.status, events: events.length, error: result.error })
  } catch (err: unknown) {
    console.error('[POST /api/observations/invite] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
