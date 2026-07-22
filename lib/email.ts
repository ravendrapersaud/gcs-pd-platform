import { Resend } from 'resend'
import type { Spotlight, Profile } from '@/lib/types'

// Lazily construct the client: the Resend constructor throws if the
// key is missing, which would crash the BUILD if done at module level.
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function tagBadge(tag: string) {
  return `<span style="display:inline-block;background:#e8ecf3;color:#003882;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;margin:2px 4px 2px 0;">${tag}</span>`
}

function buildSpotlightHtml(
  spotlight: Spotlight,
  recipient: Profile,
  sender: Profile
) {
  const tagsHtml = spotlight.tags.map(tagBadge).join('')
  const recipientName = `${recipient.first_name} ${recipient.last_name}`
  const senderName = `${sender.first_name} ${sender.last_name}`
  const date = new Date(spotlight.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You received a Spotlight!</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#003882;padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:#ffffff;border-radius:50%;margin-bottom:12px;">
                <span style="font-size:22px;font-weight:900;color:#003882;line-height:1;">GCS</span>
              </div>
              <p style="margin:4px 0 0;color:#9eafcc;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Grace Church School</p>
              <p style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700;">⭐ You've been Spotlighted!</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${recipientName},</p>
              <p style="color:#374151;font-size:15px;margin:0 0 24px;">
                <strong>${senderName}</strong> sent you a spotlight on ${date}.
              </p>

              <!-- Quote block -->
              <div style="background:#f8fafc;border-left:4px solid #003882;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
                <p style="color:#003882;font-size:16px;line-height:1.7;margin:0;font-style:italic;">
                  "${spotlight.message}"
                </p>
              </div>

              <!-- Tags -->
              ${spotlight.tags.length > 0 ? `
              <div style="margin-bottom:28px;">
                <p style="color:#6b7280;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Tagged</p>
                <div>${tagsHtml}</div>
              </div>` : ''}

              <!-- CTA -->
              <div style="text-align:center;margin-top:32px;">
                <a href="${APP_URL}/dashboard/spotlights"
                  style="display:inline-block;background:#003882;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
                  View on GCS PD Platform
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                Grace Church School · Professional Development Platform<br/>
                This email was sent because a colleague recognized your work.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendSpotlightEmail(
  spotlight: Spotlight,
  recipient: Profile,
  supervisors: Profile[],
  sender: Profile
) {
  const to = [recipient.email]
  // CC supervisors
  const cc = supervisors.map((s) => s.email).filter(Boolean)

  const resend = getResend()
  if (!resend) {
    console.warn('[sendSpotlightEmail] RESEND_API_KEY not set — skipping email send.')
    return null
  }

  const html = buildSpotlightHtml(spotlight, recipient, sender)
  const subject = `⭐ Spotlight from ${sender.first_name} ${sender.last_name}`

  const { data, error } = await resend.emails.send({
    from: 'GCS PD Platform <noreply@gcschool.org>',
    to,
    cc: cc.length > 0 ? cc : undefined,
    subject,
    html,
  })

  if (error) {
    console.error('[sendSpotlightEmail] Resend error:', error)
    throw new Error(`Failed to send spotlight email: ${error.message}`)
  }

  return data
}
