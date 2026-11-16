import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCalendarInvite, fromAddress } from '@/lib/email'
import { zonedWallClockToUtc, type IcsEvent } from '@/lib/ics'
import { SLOT_KIND_LABELS } from '@/lib/cohorts'
import type { Profile, SlotKind } from '@/lib/types'

// Books (or cancels) a cohort slot for the signed-in member and emails a Google
// Calendar invite — METHOD:REQUEST on booking, METHOD:CANCEL on cancellation —
// to BOTH the member and the host, so it lands on (and clears from) both
// calendars. RLS enforces that only a cohort member can book; capacity is
// checked here. The booking/cancellation always succeeds even if email can't.
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const slotId: string | undefined = body?.slot_id
    const cancel: boolean = body?.cancel === true
    if (!slotId) return NextResponse.json({ error: 'slot_id is required' }, { status: 400 })

    const { data: slot } = await supabase.from('cohort_slots').select('*').eq('id', slotId).single()
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

    const [{ data: member }, hostRes, { data: cohort }, { data: counts }] = await Promise.all([
      supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).single(),
      slot.host_id
        ? supabase.from('profiles').select('first_name, last_name, email').eq('id', slot.host_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('cohorts').select('name').eq('id', slot.cohort_id).single(),
      supabase.rpc('cohort_slot_counts', { c: slot.cohort_id }),
    ])
    const m = member as Profile | null
    const host = (hostRes.data ?? null) as Profile | null

    if (cancel) {
      const { error: delErr } = await supabase
        .from('cohort_slot_signups').delete().eq('slot_id', slotId).eq('user_id', user.id)
      if (delErr) return NextResponse.json({ error: `Could not cancel: ${delErr.message}` }, { status: 400 })
    } else {
      const taken = ((counts ?? []) as { slot_id: string; taken: number }[])
        .find((r) => r.slot_id === slotId)?.taken ?? 0
      if (taken >= slot.capacity) {
        return NextResponse.json({ error: 'This slot is full.' }, { status: 409 })
      }
      const { error: insErr } = await supabase
        .from('cohort_slot_signups').insert({ slot_id: slotId, user_id: user.id })
      if (insErr && insErr.code !== '23505') {
        return NextResponse.json({ error: `Could not book: ${insErr.message}` }, { status: 400 })
      }
    }

    // Build the calendar message only when the slot has a concrete time.
    const start = slot.slot_date && slot.start_time ? zonedWallClockToUtc(slot.slot_date, slot.start_time) : null
    if (!start || !m?.email) {
      return NextResponse.json({ ok: true, cancelled: cancel, email: 'skipped', reason: 'no time or email' })
    }
    const end = (slot.end_time ? zonedWallClockToUtc(slot.slot_date, slot.end_time) : null)
      ?? new Date(start.getTime() + 30 * 60000)

    const kindLabel = SLOT_KIND_LABELS[slot.kind as SlotKind] ?? 'Session'
    const hostName = host ? `${host.first_name} ${host.last_name}`.trim() : 'your cohort'
    const memberName = `${m.first_name} ${m.last_name}`.trim()
    const summary = slot.title || `${kindLabel} with ${hostName}`

    // Both the member and the host are attendees → the event appears on (and is
    // cancelled from) both calendars. The ORGANIZER must be the actual sending
    // address, or Gmail/Google shows "Unable to load event".
    const attendees = [{ name: memberName, email: m.email }]
    if (host?.email && host.email.toLowerCase() !== m.email.toLowerCase()) {
      attendees.push({ name: hostName, email: host.email })
    }

    const event: IcsEvent = {
      uid: `cohort-slot-${slot.id}-${user.id}@gcschool.org`,
      start, end, summary,
      description: [`${kindLabel} with ${hostName} — ${cohort?.name ?? 'New Faculty cohort'}.`, slot.notes].filter(Boolean).join('\n\n'),
      location: slot.location ?? undefined,
      organizerName: cohort?.name ? `${cohort.name} (GCS)` : 'GCS PD Platform',
      organizerEmail: fromAddress(),
      attendees,
      method: cancel ? 'CANCEL' : 'REQUEST',
      sequence: cancel ? 1 : 0,
    }

    const dateStr = start.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    })
    const html = cancel
      ? `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
          <h2 style="color:#003882">Booking canceled</h2>
          <p><strong>${summary}</strong> on <strong>${dateStr}</strong> has been canceled and removed from your calendar.</p>
        </div>`
      : `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
          <h2 style="color:#003882">You're booked</h2>
          <p>${summary} on <strong>${dateStr}</strong>${slot.location ? ` (${slot.location})` : ''}.</p>
          <p style="color:#6b7280;font-size:13px">The calendar invite is attached — accept to add it to your Google Calendar.</p>
        </div>`

    const to = m.email
    const cc = host?.email && host.email.toLowerCase() !== m.email.toLowerCase() ? [host.email] : []
    const result = await sendCalendarInvite({
      to, cc,
      subject: `${cancel ? 'Canceled: ' : ''}${summary} — ${dateStr}`,
      html, events: [event], method: cancel ? 'CANCEL' : 'REQUEST',
    })

    const { error: logErr } = await supabase.from('email_log').insert({
      email_type: cancel ? 'cohort_slot_cancel' : 'cohort_slot_invite',
      to_email: to, cc_emails: result.cc, bcc_emails: result.bcc,
      subject: result.subject, status: result.status,
      provider_id: result.providerId ?? null, error: result.error ?? null, created_by: user.id,
    })
    if (logErr) console.error('[cohort slot invite] email_log insert failed (non-fatal):', logErr)

    return NextResponse.json({ ok: true, cancelled: cancel, email: result.status, error: result.error })
  } catch (err: unknown) {
    console.error('[POST /api/cohort/slot-signup] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 })
  }
}
