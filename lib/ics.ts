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
