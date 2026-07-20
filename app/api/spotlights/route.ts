import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSpotlightEmail } from '@/lib/email'
import type { Profile, Spotlight } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Get current session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { to_user_id, message, tags } = body

    // Validate
    if (!to_user_id || typeof to_user_id !== 'string') {
      return NextResponse.json({ error: 'to_user_id is required' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json({ error: 'message must be at least 10 characters' }, { status: 400 })
    }
    if (to_user_id === session.user.id) {
      return NextResponse.json({ error: 'You cannot spotlight yourself' }, { status: 400 })
    }

    const validTags = Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : []

    // Insert spotlight
    const { data: spotlight, error: insertErr } = await supabase
      .from('spotlights')
      .insert({
        from_user_id: session.user.id,
        to_user_id,
        message: message.trim(),
        tags: validTags,
        email_sent: false,
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[POST /api/spotlights] insert error:', insertErr)
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Fetch sender profile
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    // Fetch recipient profile
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', to_user_id)
      .single()

    if (!senderProfile || !recipientProfile) {
      return NextResponse.json(spotlight, { status: 201 })
    }

    // Fetch recipient's supervisors
    const { data: assignments } = await supabase
      .from('supervisor_assignments')
      .select('supervisor_id')
      .eq('staff_id', to_user_id)

    let supervisors: Profile[] = []
    if (assignments && assignments.length > 0) {
      const supIds = assignments.map((a) => a.supervisor_id)
      const { data: supProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', supIds)
      supervisors = (supProfiles ?? []) as Profile[]
    }

    // Send email (best-effort — don't fail the request if email fails)
    try {
      await sendSpotlightEmail(
        spotlight as Spotlight,
        recipientProfile as Profile,
        supervisors,
        senderProfile as Profile
      )

      // Mark email sent
      await supabase
        .from('spotlights')
        .update({ email_sent: true })
        .eq('id', spotlight.id)
    } catch (emailErr) {
      console.error('[POST /api/spotlights] email error (non-fatal):', emailErr)
    }

    return NextResponse.json({ ...spotlight, email_sent: true }, { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/spotlights] unexpected error:', err)
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

    const { searchParams } = new URL(request.url)
    const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20'))
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const { data, error } = await supabase
      .from('spotlights')
      .select(`
        *,
        from_user:profiles!spotlights_from_user_id_fkey(id, first_name, last_name, title, avatar_url),
        to_user:profiles!spotlights_to_user_id_fkey(id, first_name, last_name, title, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
