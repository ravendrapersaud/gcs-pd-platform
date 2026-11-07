// Event-source scraping helpers for the PD calendar.
// Two extraction paths, chosen per source:
//   • ICS (iCalendar) feeds   → parsed directly (reliable, no API cost)
//   • HTML pages              → extracted by an LLM (needs ANTHROPIC_API_KEY)
// Everything degrades gracefully: no key → HTML sources return skipped, feeds
// still work. Pure data in, pure data out — the API route does the DB writes.

export interface ScrapedEvent {
  title: string
  description?: string | null
  event_type?: string | null
  location?: string | null
  is_virtual?: boolean
  start_date: string // YYYY-MM-DD
  end_date?: string | null
  url?: string | null
  cost?: number | null
  external_key: string // stable id for dedup across runs
}

export interface ScrapeResult {
  events: ScrapedEvent[]
  status: 'ok' | 'error' | 'skipped'
  error?: string
}

const UA = 'GCS-PD-Platform/1.0 (+https://gcschool.org; PD calendar importer)'
const FETCH_TIMEOUT_MS = 15000
const MODEL = process.env.EVENT_SCRAPE_MODEL || 'claude-haiku-5-5'

async function fetchText(url: string): Promise<{ text: string; contentType: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/calendar, text/html, */*' }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const contentType = res.headers.get('content-type') ?? ''
    return { text: await res.text(), contentType }
  } finally {
    clearTimeout(t)
  }
}

// ── robots.txt (best-effort) ─────────────────────────────────
// Fails OPEN (allows) on any error — a missing or unreadable robots.txt
// conventionally means "no restrictions". Honors the '*' group and our own
// user-agent token; longest matching path rule wins.
async function isAllowedByRobots(target: string): Promise<boolean> {
  let origin: string, path: string
  try { const u = new URL(target); origin = u.origin; path = u.pathname || '/' } catch { return true }
  let txt = ''
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return true
    txt = await res.text()
  } catch { return true }

  const token = 'gcs-pd-platform'
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim())
  let applies = false
  const rules: { allow: boolean; path: string }[] = []
  for (const line of lines) {
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i)
    if (!m) continue
    const field = m[1].toLowerCase(); const val = m[2].trim()
    if (field === 'user-agent') {
      const ua = val.toLowerCase()
      applies = ua === '*' || ua.includes(token) || token.includes(ua)
    } else if (applies) {
      rules.push({ allow: field === 'allow', path: val })
    }
  }
  // Compare the most specific (longest) matching Allow vs Disallow prefix.
  // An empty Disallow value means "allow everything", so it never blocks.
  let bestLen = -1, bestAllow = true
  for (const r of rules) {
    if (!r.path) continue
    const prefix = r.path.replace(/\*.*$/, '') // treat first '*' as a prefix cut
    if (path.startsWith(prefix) && prefix.length > bestLen) { bestLen = prefix.length; bestAllow = r.allow }
  }
  return bestLen === -1 ? true : bestAllow
}

// ── dates ────────────────────────────────────────────────────
// Accepts an ICS date (YYYYMMDD or YYYYMMDDTHHMMSSZ) → YYYY-MM-DD, or passes
// through an already-ISO date. Returns null if it can't be made sense of.
function toIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  let m = s.match(/^(\d{4})(\d{2})(\d{2})/) // ICS basic
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

// ── ICS ──────────────────────────────────────────────────────
function unfoldIcs(text: string): string {
  // RFC5545 line folding: a CRLF followed by space/tab continues the line.
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function icsField(block: string, name: string): string | undefined {
  // Match "NAME" or "NAME;PARAM=..." at line start, capture the value.
  const re = new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'im')
  const m = block.match(re)
  return m ? m[1].trim() : undefined
}

function unescapeIcs(v: string | undefined): string | null {
  if (v == null) return null
  return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim() || null
}

export function parseIcs(raw: string): ScrapedEvent[] {
  const text = unfoldIcs(raw)
  const blocks = text.split('BEGIN:VEVENT').slice(1)
  const out: ScrapedEvent[] = []
  for (const b of blocks) {
    const block = b.split('END:VEVENT')[0]
    const start = toIsoDate(icsField(block, 'DTSTART'))
    if (!start) continue
    const title = unescapeIcs(icsField(block, 'SUMMARY'))
    if (!title) continue
    const rawEnd = icsField(block, 'DTEND')
    let end = toIsoDate(rawEnd)
    // An all-day DTEND (a DATE value, no time component) is exclusive — the
    // morning after the event. Pull it back a day so the calendar shows the
    // real last day.
    if (end && end !== start && rawEnd && !/T/i.test(rawEnd)) {
      const d = new Date(`${end}T12:00:00`); d.setDate(d.getDate() - 1); end = d.toISOString().slice(0, 10)
    }
    const uid = icsField(block, 'UID')
    const url = unescapeIcs(icsField(block, 'URL'))
    const location = unescapeIcs(icsField(block, 'LOCATION'))
    out.push({
      title,
      description: unescapeIcs(icsField(block, 'DESCRIPTION')),
      location,
      is_virtual: !!location && /virtual|online|zoom|webinar/i.test(location),
      start_date: start,
      end_date: end && end !== start ? end : null,
      url,
      external_key: `ics:${uid || `${title}|${start}`}`,
    })
  }
  return out
}

// ── HTML → text → LLM ────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000)
}

function hashKey(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0 }
  return `html:${(h >>> 0).toString(36)}`
}

async function extractEventsWithLLM(pageText: string, sourceUrl: string): Promise<ScrapeResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return { events: [], status: 'skipped', error: 'No ANTHROPIC_API_KEY — HTML sources need it; ICS feeds work without it.' }
  }
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `You extract professional-development events from a web page for a K-12 school's PD calendar.
Today is ${today}. Source URL: ${sourceUrl}

Return ONLY a JSON array (no prose). Each item:
{"title": string, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"|null, "event_type": "Conference"|"Workshop"|"Webinar"|"Local Event"|"Certificate Program"|null, "location": string|null, "is_virtual": boolean, "url": string|null, "cost": number|null, "description": string|null}

Rules:
- Only real, dated events on or after ${today}. Skip anything without a clear start date, and skip navigation/boilerplate.
- Absolute URLs only. If a listing has its own link use it, else use the source URL.
- cost is a number in USD (0 for free), or null if unknown.
- If no events are found, return [].

PAGE CONTENT:
${pageText}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { events: [], status: 'error', error: `LLM HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    const data = await res.json()
    const raw: string = (data?.content?.[0]?.text ?? '').trim()
    const jsonText = raw.startsWith('[') ? raw : raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)
    const parsed = JSON.parse(jsonText) as Record<string, unknown>[]
    const events: ScrapedEvent[] = []
    for (const e of Array.isArray(parsed) ? parsed : []) {
      const start = toIsoDate(e.start_date as string)
      const title = typeof e.title === 'string' ? e.title.trim() : ''
      if (!start || !title) continue
      const url = typeof e.url === 'string' && e.url ? e.url : sourceUrl
      events.push({
        title,
        description: (e.description as string) || null,
        event_type: (e.event_type as string) || null,
        location: (e.location as string) || null,
        is_virtual: !!e.is_virtual,
        start_date: start,
        end_date: toIsoDate(e.end_date as string),
        url,
        cost: typeof e.cost === 'number' ? e.cost : null,
        external_key: hashKey(`${title}|${start}|${url}`),
      })
    }
    return { events, status: 'ok' }
  } catch (err: unknown) {
    return { events: [], status: 'error', error: err instanceof Error ? err.message : 'LLM extraction failed' }
  }
}

// ── PD Guide (pdguide.org) ───────────────────────────────────
// A curated directory of PD events for independent schools. We use it ONLY as a
// discovery tool. PD Guide's /events page is a Next.js app whose full event list
// ships in the server payload as structured JSON — each event already carries the
// HOST organization's own URL. We decode that payload, take the facts, and link
// each event to the HOST (never PD Guide, and never its affiliate link). PD Guide
// itself never appears on our calendar: their terms bar presenting their listings
// as part of another site, and the host org is the authoritative source anyway.
// Deterministic — one request, no LLM / API key.

const PDGUIDE_MAX_EVENTS = 100 // soonest-first cap — keeps the review queue sane

function isPdGuide(url: string): boolean {
  try { return /(^|\.)pdguide\.org$/i.test(new URL(url).host) } catch { return false }
}

// "From $6,500 (members)", "$$99–$149", "Free", null → a best-effort USD number.
function parsePdCost(raw: string | undefined | null): number | null {
  if (!raw) return null
  if (/\bfree\b/i.test(raw)) return 0
  const m = raw.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
  return m ? parseFloat(m[1].replace(/,/g, '')) : null
}

// Next.js streams its RSC data as self.__next_f.push([n,"<chunk>"]) calls, each a
// JSON string literal. Concatenating the decoded chunks reconstructs the payload.
function decodeNextPayload(html: string): string {
  let out = ''
  const re = /self\.__next_f\.push\(\[\d+,/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const open = html.indexOf('"', m.index + m[0].length)
    if (open === -1) continue
    let j = open + 1
    for (; j < html.length; j++) { if (html[j] === '\\') { j++; continue } if (html[j] === '"') break }
    try { out += JSON.parse(html.slice(open, j + 1)) as string } catch { /* skip a malformed chunk */ }
  }
  return out
}

// Return the balanced {...} starting at s[start], ignoring braces inside strings.
function sliceJsonObject(s: string, start: number): string | null {
  let depth = 0
  let inStr = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (c === '\\') { i++; continue } if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1) }
  }
  return null
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

// Parse the PD Guide listing payload into host-sourced ScrapedEvents. Exported so
// it can be unit-tested against a saved payload without a network call.
export function parsePdGuideListing(html: string): ScrapedEvent[] {
  const decoded = decodeNextPayload(html)
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()
  const out: ScrapedEvent[] = []

  let idx = 0
  while ((idx = decoded.indexOf('{"id":"', idx)) !== -1) {
    const slice = sliceJsonObject(decoded, idx)
    idx += 7
    if (!slice) continue
    let o: Record<string, unknown>
    try { o = JSON.parse(slice) } catch { continue }

    const id = asStr(o.id)
    const title = asStr(o.title).trim()
    const start = asStr(o.start_date).slice(0, 10)
    const url = asStr(o.url) // the HOST's own URL — never affiliate_url
    // Keep real events; skip the many React nodes that also start {"id":...}.
    if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^https?:\/\//i.test(url)) continue
    if (o.status && o.status !== 'published') continue
    if (seen.has(id)) continue
    seen.add(id)

    const rawEnd = asStr(o.end_date).slice(0, 10)
    const end = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) ? rawEnd : null
    if ((end ?? start) < today) continue // upcoming only

    const format = asStr(o.format)
    const location = asStr(o.location) || null
    const blurb = (asStr(o.blurb) || asStr(o.description)).replace(/\s+/g, ' ').trim()
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* leave blank */ }
    const description = [host && `From ${host}.`, blurb].filter(Boolean).join(' ').slice(0, 1400) || null

    out.push({
      title: title.slice(0, 300),
      description,
      event_type: asStr(o.event_type) || null,
      location,
      is_virtual: /online/i.test(format) && !/in_person/i.test(format),
      start_date: start,
      end_date: end && end !== start ? end : null,
      url,
      cost: parsePdCost(asStr(o.cost)),
      external_key: `pdguide:${id}`,
    })
  }

  out.sort((a, b) => a.start_date.localeCompare(b.start_date))
  return out.slice(0, PDGUIDE_MAX_EVENTS)
}

async function scrapePdGuide(listingUrl: string): Promise<ScrapeResult> {
  let html: string
  try {
    html = (await fetchText(listingUrl)).text
  } catch (err: unknown) {
    return { events: [], status: 'error', error: `Fetch failed: ${err instanceof Error ? err.message : 'unknown'}` }
  }
  const events = parsePdGuideListing(html)
  if (events.length === 0) {
    return { events: [], status: 'error', error: 'No events parsed from the PD Guide payload (page structure may have changed).' }
  }
  return { events, status: 'ok' }
}

// ── orchestration ────────────────────────────────────────────
export async function scrapeSource(url: string, kind: 'auto' | 'ics' | 'html' | 'pdguide'): Promise<ScrapeResult> {
  if (!(await isAllowedByRobots(url))) {
    return { events: [], status: 'skipped', error: 'Blocked by the site’s robots.txt' }
  }

  // PD Guide gets a dedicated, host-sourced adapter (by explicit kind or host).
  if (kind === 'pdguide' || isPdGuide(url)) return scrapePdGuide(url)

  let text = ''
  let contentType = ''
  try {
    ({ text, contentType } = await fetchText(url))
  } catch (err: unknown) {
    return { events: [], status: 'error', error: `Fetch failed: ${err instanceof Error ? err.message : 'unknown'}` }
  }

  const looksIcs = kind === 'ics'
    || (kind === 'auto' && (/text\/calendar/i.test(contentType) || /\.ics(\?|$)/i.test(url) || text.trimStart().startsWith('BEGIN:VCALENDAR')))

  if (looksIcs) {
    try {
      return { events: parseIcs(text), status: 'ok' }
    } catch (err: unknown) {
      return { events: [], status: 'error', error: `ICS parse failed: ${err instanceof Error ? err.message : 'unknown'}` }
    }
  }

  return extractEventsWithLLM(htmlToText(text), url)
}
