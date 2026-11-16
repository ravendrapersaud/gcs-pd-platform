// Minimal iCalendar (.ics) builder for emailing calendar invites. Produces a
// METHOD:REQUEST VEVENT that Gmail/Outlook recognize as an invite (RSVP + add
// to calendar). A stable UID means a re-send updates the same event rather than
// creating a duplicate.

export interface IcsEvent {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  location?: string
  organizerName: string
  organizerEmail: string
  attendeeName: string
  attendeeEmail: string
}

// Convert a wall-clock date + time in an IANA timezone to the matching UTC
// Date. Needed because cohort slots store a plain date + local time (no tz),
// but the .ics wants a UTC instant — and the server runs in UTC, so naive
// parsing would be hours off. Handles DST by measuring the zone's offset at
// that instant. Returns null on bad input. Defaults to the school's tz.
export function zonedWallClockToUtc(
  dateISO: string,
  timeHHMM: string,
  tz = 'America/New_York'
): Date | null {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  const [hh, mi] = timeHHMM.split(':').map(Number)
  if ([y, m, d, hh, mi].some((n) => Number.isNaN(n))) return null
  const asUTC = Date.UTC(y, m - 1, d, hh, mi)
  // Offset = how far this zone is from UTC at that instant.
  const inTz = new Date(new Date(asUTC).toLocaleString('en-US', { timeZone: tz }))
  const inUtc = new Date(new Date(asUTC).toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(asUTC - (inTz.getTime() - inUtc.getTime()))
}

// → YYYYMMDDTHHMMSSZ (UTC basic format)
function fmtUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function buildInviteIcs(ev: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GCS PD Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${fmtUtc(new Date())}`,
    `DTSTART:${fmtUtc(ev.start)}`,
    `DTEND:${fmtUtc(ev.end)}`,
    `SUMMARY:${esc(ev.summary)}`,
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    `ORGANIZER;CN=${esc(ev.organizerName)}:mailto:${ev.organizerEmail}`,
    `ATTENDEE;CN=${esc(ev.attendeeName)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${ev.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}
