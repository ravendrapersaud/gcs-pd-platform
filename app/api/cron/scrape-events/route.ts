import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { scrapeSource, type ScrapedEvent } from '@/lib/eventScrape'
import type { EventSource } from '@/lib/types'

export const maxDuration = 300 // scraping several sites can take a while

// Scrapes every active event source and upserts results into pd_events as
// 'pending' review-queue rows. Triggered weekly by Supabase pg_cron (with the
// CRON_SECRET) or on demand by an admin ("Run now" in Settings).
// Existing rows are updated in place by (source_id, external_key); a row an
// admin already approved/rejected keeps its status across re-runs.

const MAX_EVENTS_PER_SOURCE = 200

async function authorize(request: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (secret && auth === `Bearer ${secret}`) return { ok: true }

  // Otherwise require a logged-in admin (manual trigger).
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { ok: false, error: 'Admins only' }
  return { ok: true }
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: sources } = await admin
    .from('event_sources')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const now = new Date().toISOString()
  const summary: { source: string; status: string; found: number; added: number; updated: number; error?: string }[] = []

  for (const src of (sources ?? []) as EventSource[]) {
    const result = await scrapeSource(src.url, src.kind)
    let added = 0
    let updated = 0

    if (result.status === 'ok' && result.events.length > 0) {
      const events = result.events.slice(0, MAX_EVENTS_PER_SOURCE)

      // Existing scraped rows for this source, keyed by external_key.
      const { data: existing } = await admin
        .from('pd_events')
        .select('id, external_key')
        .eq('source_id', src.id)
      const byKey = new Map((existing ?? []).map((r) => [r.external_key as string, r.id as string]))

      for (const ev of events) {
        const row = toEventRow(ev, src)
        const existingId = byKey.get(ev.external_key)
        if (existingId) {
          // Update details but DON'T touch status (preserve admin decisions).
          const { title, event_type, location, is_virtual, start_date, end_date, url, cost, description } = row
          await admin.from('pd_events').update({
            title, event_type, location, is_virtual, start_date, end_date, url, cost, description,
            last_seen_at: now,
          }).eq('id', existingId)
          updated++
        } else {
          const { error } = await admin.from('pd_events').insert({ ...row, status: 'pending', is_auto: true, last_seen_at: now })
          if (!error) added++
        }
      }
    }

    await admin.from('event_sources').update({
      last_run_at: now,
      last_status: result.status,
      last_count: result.events.length,
      last_error: result.error ?? null,
    }).eq('id', src.id)

    summary.push({ source: src.name, status: result.status, found: result.events.length, added, updated, error: result.error })
  }

  return NextResponse.json({ ok: true, ran_at: now, sources: summary })
}

function toEventRow(ev: ScrapedEvent, src: EventSource) {
  return {
    title: ev.title.slice(0, 300),
    description: ev.description ?? null,
    event_type: ev.event_type || src.default_event_type || null,
    location: ev.location ?? null,
    is_virtual: ev.is_virtual ?? false,
    start_date: ev.start_date,
    end_date: ev.end_date ?? null,
    url: ev.url ?? src.url,
    cost: ev.cost ?? null,
    audience: src.default_audience ?? [],
    source_id: src.id,
    external_key: ev.external_key,
  }
}
