import type { PortfolioData } from '@/app/dashboard/portfolio/[id]/page'
import { formatUSD } from '@/lib/funds'

// Self-contained printable employee portfolio — opened in a new window for
// printing or saving to PDF (for employee files and 1-on-1s). No dependency on
// app state; everything comes from the already-fetched PortfolioData.

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
const fmtDate = (d: string) => new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function buildPortfolioHtml(d: PortfolioData): string {
  const p = d.profile
  const name = `${p.first_name} ${p.last_name}`
  const meta = [p.title, p.division, p.department, p.campus ? `Campus ${p.campus}` : null].filter(Boolean).map(esc).join(' &middot; ')
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const goalRows = d.goals.map((g) =>
    `<tr><td>${esc(g.title)}</td><td>${g.goal_type === 'faculty_inquiry' ? 'Inquiry' : 'Goal'}</td><td class="cap">${esc(g.status)}</td><td class="num">${g.progress_pct}%</td></tr>`
  ).join('')

  const obsRows = d.observations.map((o) =>
    `<tr><td>${esc(o.twg_data?.frameworkTitle ?? 'Observation')}</td><td>${o.observer ? esc(`${o.observer.first_name} ${o.observer.last_name}`) : '—'}</td><td class="num">${esc(fmtDate(o.observed_at))}</td></tr>`
  ).join('')

  const shoutHtml = d.shoutouts.map((s) =>
    `<div class="shout"><div class="shout-meta">from ${s.sender ? esc(`${s.sender.first_name} ${s.sender.last_name}`) : '—'} &middot; ${esc(fmtDate(s.created_at))}</div><div class="shout-msg">&ldquo;${esc(s.message)}&rdquo;</div>${s.tags?.length ? `<div class="tags">${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>`
  ).join('')

  const pdRows = d.pd.activities.map((a) =>
    `<tr><td class="num">${esc(fmtDate(a.activity_date))}</td><td>${esc(a.title)}${a.verified ? ' <span class="chip">verified</span>' : ''}</td><td class="num">${a.hours}h</td></tr>`
  ).join('')

  const fundRows = d.funding.map((f) =>
    `<tr><td class="num">${esc(fmtDate(f.created_at))}</td><td>${esc(f.title)}${f.is_overseas_travel ? ' (overseas)' : ''}</td><td class="cap">${esc(f.status)}</td><td class="num">${esc(formatUSD(Number(f.amount)))}</td></tr>`
  ).join('')

  const section = (title: string, count: number, body: string) =>
    `<section><h2>${esc(title)} <span class="count">(${count})</span></h2>${count === 0 ? '<p class="empty">Nothing recorded this year.</p>' : body}</section>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portfolio – ${esc(name)} – ${esc(d.year.label)}</title>
<style>
:root{--ink:#15233A;--muted:#566377;--line:#DCE2EA;--navy:#003882}
*{box-sizing:border-box}
body{font:13px/1.5 "Helvetica Neue",Arial,sans-serif;color:var(--ink);max-width:800px;margin:24px auto;padding:0 24px;background:#fff}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#EEF2F7;border-radius:8px;padding:10px 14px;margin-bottom:18px}
.bar button{font:600 .9rem Arial,sans-serif;background:var(--navy);color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
header{border-bottom:2px solid var(--navy);padding-bottom:12px;margin-bottom:8px}
h1{font:700 1.6rem Georgia,serif;margin:0;color:var(--navy)}
.sub{color:var(--muted);margin:3px 0 0}
.gen{color:var(--muted);font-size:.8rem;margin:6px 0 0}
.summary{display:flex;gap:28px;margin:16px 0 8px}
.summary .n{font:700 1.5rem Georgia,serif;color:var(--navy)}
.summary .l{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
h2{font:600 1.05rem Georgia,serif;margin:20px 0 8px;border-bottom:1px solid var(--navy);padding-bottom:3px}
.count{color:var(--muted);font-weight:400;font-size:.85rem}
.empty{color:var(--muted);font-size:.9em;margin:4px 0}
table{width:100%;border-collapse:collapse;margin:4px 0}
th{text-align:left;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);border-bottom:1px solid var(--navy);padding:4px 6px}
td{border-bottom:1px solid var(--line);padding:5px 6px;vertical-align:top}
td.num{text-align:right;white-space:nowrap;color:var(--muted)}
td.cap{text-transform:capitalize}
.chip{font-size:.7em;background:#e6f4ea;color:#166534;border-radius:10px;padding:1px 6px}
.shout{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:6px 0}
.shout-meta{font-size:.78rem;color:var(--muted)}
.shout-msg{font-style:italic;margin-top:2px}
.tags{margin-top:4px}.tag{display:inline-block;background:#e8ecf3;color:var(--navy);border-radius:10px;padding:1px 8px;font-size:.72rem;margin-right:4px}
section{break-inside:avoid}
@page{size:letter;margin:.6in}
@media print{.bar{display:none}body{margin:0;max-width:none}}
</style></head><body>
<div class="bar"><span>Print this portfolio, or choose <b>Save as PDF</b> in the print window.</span><button onclick="window.print()">Print</button></div>
<header>
  <h1>${esc(name)}</h1>
  <p class="sub">${meta || '—'}${p.employee_type ? ` &middot; ${esc(p.employee_type)}` : ''}</p>
  <p class="gen">Professional portfolio &middot; School year ${esc(d.year.label)} &middot; Generated ${esc(generated)}</p>
</header>
<div class="summary">
  <div><div class="n">${d.pd.hoursTotal} / ${d.pd.target}</div><div class="l">PD hours</div></div>
  <div><div class="n">${d.observations.length}</div><div class="l">Observations</div></div>
  <div><div class="n">${d.shoutouts.length}</div><div class="l">Shout-outs</div></div>
  <div><div class="n">${d.goals.length}</div><div class="l">Goals</div></div>
</div>
${section('Goals', d.goals.length, `<table><thead><tr><th>Goal</th><th>Type</th><th>Status</th><th class="num">Progress</th></tr></thead><tbody>${goalRows}</tbody></table>`)}
${section('Formal observations', d.observations.length, `<table><thead><tr><th>Framework</th><th>Observer</th><th class="num">Date</th></tr></thead><tbody>${obsRows}</tbody></table>`)}
${section('Shout-outs received', d.shoutouts.length, shoutHtml)}
${section('PD activities', d.pd.activities.length, `<table><thead><tr><th class="num">Date</th><th>Activity</th><th class="num">Hours</th></tr></thead><tbody>${pdRows}</tbody></table>`)}
${section('Funding requests', d.funding.length, `<table><thead><tr><th class="num">Date</th><th>Request</th><th>Status</th><th class="num">Amount</th></tr></thead><tbody>${fundRows}</tbody></table>`)}
</body></html>`
}
