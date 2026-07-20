import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FundingStatus } from '@/lib/types'

const VALID_STATUSES: FundingStatus[] = ['approved', 'denied', 'cancelled']

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!profile || !['supervisor', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — supervisor or admin role required' }, { status: 403 })
    }

    const body = await request.json()
    const { id, status } = body

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Funding request id is required' }, { status: 400 })
    }

    if (!status || !VALID_STATUSES.includes(status as FundingStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify the request exists
    const { data: existing } = await supabase
      .from('funding_requests')
      .select('id, status')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Funding request not found' }, { status: 404 })
    }

    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot update a request that is already ${existing.status}` },
        { status: 409 }
      )
    }

    const { data: updated, error: updateErr } = await supabase
      .from('funding_requests')
      .update({
        status: status as FundingStatus,
        reviewed_by: session.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) {
      console.error('[PATCH /api/funding] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err: unknown) {
    console.error('[PATCH /api/funding] unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const userId = searchParams.get('user_id')

    let query = supabase
      .from('funding_requests')
      .select(`
        *,
        user:profiles!funding_requests_user_id_fkey(id, first_name, last_name, title),
        reviewer:profiles!funding_requests_reviewed_by_fkey(id, first_name, last_name),
        pd_activity:pd_activities(id, title, type)
      `)
      .order('created_at', { ascending: false })

    // If not supervisor/admin, restrict to own requests
    if (!profile || !['supervisor', 'admin'].includes(profile.role)) {
      query = query.eq('user_id', session.user.id)
    } else if (userId) {
      query = query.eq('user_id', userId)
    }

    if (status && VALID_STATUSES.includes(status as FundingStatus)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
