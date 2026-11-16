import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCohortWelcome } from '@/lib/email'
import type { Profile } from '@/lib/types'

// Sends a (manual) welcome email to one newly-added cohort member. Gated to
// cohort managers via the is_cohort_manager RPC. Best-effort: a send failure
// never affects membership. Logged to email_log.
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const cohortId: string | undefined = body?.cohort_id
    const memberId: string | undefined = body?.user_id
    if (!cohortId || !memberId) {
      return NextResponse.json({ error: 'cohort_id and user_id are required' }, { status: 400 })
    }

    // Only a manager of this cohort may send its welcome mail.
    const { data: isManager, error: mgrErr } = await supabase.rpc('is_cohort_manager', { c: cohortId })
    if (mgrErr) return NextResponse.json({ error: mgrErr.message }, { status: 500 })
    if (!isManager) return NextResponse.json({ error: 'Not permitted' }, { status: 403 })

    const [{ data: cohort }, { data: member }, { data: facRows }] = await Promise.all([
      supabase.from('cohorts').select('name').eq('id', cohortId).single(),
      supabase.from('profiles').select('id, first_name, last_name, email').eq('id', memberId).single(),
      supabase.from('cohort_members').select('user_id').eq('cohort_id', cohortId).eq('member_role', 'facilitator'),
    ])

    if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const facIds = (facRows ?? []).map((r) => r.user_id)
    const { data: facs } = facIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name, email').in('id', facIds)
      : { data: [] as Profile[] }

    const result = await sendCohortWelcome(member as Profile, cohort.name, (facs ?? []) as Profile[])

    const { error: logErr } = await supabase.from('email_log').insert({
      email_type: 'cohort_welcome',
      to_email: result.to[0] ?? (member as Profile).email,
      cc_emails: result.cc,
      bcc_emails: result.bcc,
      subject: result.subject,
      status: result.status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      created_by: user.id,
    })
    if (logErr) console.error('[POST /api/cohort/welcome] email_log insert failed (non-fatal):', logErr)

    return NextResponse.json({ ok: result.status === 'sent', email: result.status, error: result.error })
  } catch (err: unknown) {
    console.error('[POST /api/cohort/welcome] unexpected error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
