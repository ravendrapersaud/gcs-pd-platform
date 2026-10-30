// Printable in-room "paper note sheet", ported from the Teaching with Grace
// Observations tool. A self-contained HTML document the observer prints (or
// saves as PDF) and writes on by hand during a visit: the visit details, the
// pre-observation notes, the chosen focus areas with their look-fors as
// checkboxes, and lined/timestamped note pages. Built from Set up, before the
// visit — so it has no dependency on the live app state.

// Bump when the printed layout changes in a way a future OCR importer would
// need to parse differently. The QR encodes this, so an uploaded sheet declares
// which field map it was printed with. Payload format: `gcs-pd:twg:v<N>:<ref>`.
export const TWG_SHEET_VERSION = 1

export function twgSheetPayload(version: number, ref: string): string {
  return `gcs-pd:twg:v${version}:${ref}`
}

export interface SheetCategory {
  title: string
  color: string
  description: string
  lookfors: string[]
}

export interface NoteSheetArgs {
  frameworkTitle: string
  modeLabel: string
  modeTime: string
  isPopin: boolean
  teacher: string
  observer: string
  course: string
  division: string
  department: string
  dateStr: string
  timeStr: string
  pre: { focus: string; objective: string; unit: string; style: string }
  categories: SheetCategory[]
  /** Machine-readable reference (observation id) embedded for later OCR import. */
  ref?: string
  /** Pre-rendered QR <svg> string encoding twgSheetPayload(version, ref). */
  qrSvg?: string
  /** Template version printed alongside the reference. */
  version?: number
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

export function buildNoteSheetHtml(a: NoteSheetArgs): string {
  const val = (v: string) => (v && v.trim() ? `<span class="v">${esc(v)}</span>` : '<span class="blank"></span>')
  const lines = (n: number) => `<div class="lines">${'<div></div>'.repeat(n)}</div>`
  const box = (label: string, text: string, n: number) =>
    `<div class="box"><div class="lbl">${esc(label)}</div>${text && text.trim() ? `<p>${esc(text.trim())}</p>` : lines(n)}</div>`
  const checks = (items: string[]) =>
    items.length
      ? `<ul class="checks">${items.map((l) => `<li><span class="sq"></span><span>${esc(l)}</span></li>`).join('')}</ul>`
      : ''
  const rows = (n: number) =>
    Array.from({ length: n }, () => `<tr><td></td><td></td><td></td><td class="tg"></td></tr>`).join('')

  const meta: [string, string][] = [
    ['Teacher', a.teacher],
    ['Observer', a.observer],
    ['Course / grade', a.course],
    ['Division', a.division],
    ['Department', a.department],
    ['Date', a.dateStr],
    ['Start time', a.timeStr],
    ['Visit', `${a.modeLabel} · ${a.modeTime}`],
  ]

  const catHTML = (c: SheetCategory) =>
    `<section class="area" style="--c:${esc(c.color)}"><h3><span class="pdot"></span>${esc(c.title)}</h3>` +
    (c.description ? `<p class="focus">${esc(c.description)}</p>` : '') +
    `${checks(c.lookfors)}${lines(2)}</section>`

  const tagsLegend = a.categories.map((c) => c.title).join(' · ')
  const title = `Note sheet – ${a.teacher || 'Observation'}${a.dateStr ? ' – ' + a.dateStr : ''}`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--ink:#15233A;--muted:#566377;--line:#C9D1DC;--rule:#DCE2EA}
*{box-sizing:border-box}
body{font:12.5px/1.45 "Helvetica Neue",Arial,sans-serif;color:var(--ink);max-width:780px;margin:24px auto;padding:0 20px;background:#fff}
h1{font:700 1.45rem Georgia,serif;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
.qr{flex:0 0 auto;text-align:center;line-height:1}
.qr svg{width:86px;height:86px;display:block}
.qr .qcap{font:600 .58rem ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;color:var(--muted);margin-top:3px;text-transform:uppercase}
.refline{font:.68rem/1.3 ui-monospace,Menlo,Consolas,monospace;color:var(--muted);letter-spacing:.02em;margin-top:6px;word-break:break-all}
h2{font:600 1.05rem Georgia,serif;margin:18px 0 8px;padding-bottom:4px;border-bottom:1.5px solid var(--ink)}
h3{font:600 .98rem Georgia,serif;margin:0 0 2px;display:flex;align-items:center;gap:7px;color:var(--c,var(--ink))}
.sub{color:var(--muted);margin:2px 0 12px}
.lbl{font-size:.7rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#EEF2F7;border-radius:8px;padding:10px 14px;margin-bottom:18px}
.bar button{font:600 .9rem Arial,sans-serif;background:#003882;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px}
.meta div{display:flex;gap:8px;align-items:baseline;min-width:0}.meta .lbl{white-space:nowrap}
.v{flex:1;border-bottom:1px solid var(--rule);padding-bottom:1px}.blank{flex:1;border-bottom:1px solid var(--line);min-height:16px}
.box{margin:8px 0}.box p{margin:2px 0;white-space:pre-wrap}
.lines div{height:22px;border-bottom:1px solid var(--rule)}
.pdot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c)}
.area{margin:10px 0 14px;break-inside:avoid}.focus{color:var(--muted);margin:0 0 4px;font-size:.92em}
.checks{list-style:none;margin:4px 0;padding:0;display:flex;flex-direction:column;gap:4px}
.checks li{display:grid;grid-template-columns:16px 1fr;gap:8px}
.sq{width:12px;height:12px;border:1.3px solid var(--ink);border-radius:2px;margin-top:2px}
.key{font-size:.85em;color:var(--muted);margin:0 0 6px}
table.notes{width:100%;border-collapse:collapse}
table.notes th{text-align:left;font-size:.7rem;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);border-bottom:1.5px solid var(--ink);padding:4px 6px}
table.notes td{height:46px;border-bottom:1px solid var(--line);border-right:1px solid var(--rule);vertical-align:top}
table.notes td:last-child{border-right:0}
table.notes col.c1{width:62px}table.notes col.c2{width:46px}table.notes col.c4{width:96px}
.page{break-before:page}
footer{margin-top:14px;color:var(--muted);font-size:.8em}
@page{size:letter;margin:.55in}
@media print{.bar{display:none}body{margin:0;padding:0;max-width:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="bar"><span>Print this sheet, or choose <b>Save as PDF</b> in the print window.</span><button onclick="window.print()">Print</button></div>
<div class="hd"><div>
<h1>${esc(a.frameworkTitle)} · Observation notes</h1>
<p class="sub">${esc(a.modeLabel)} observation${a.teacher ? ' · ' + esc(a.teacher) : ''}${a.dateStr ? ' · ' + esc(a.dateStr) : ''}</p>
</div>${a.qrSvg ? `<div class="qr">${a.qrSvg}<div class="qcap">TWG v${a.version ?? 1}</div></div>` : ''}</div>
<div class="meta">${meta.map(([k, v]) => `<div><span class="lbl">${esc(k)}</span>${val(v)}</div>`).join('')}</div>
${a.isPopin ? '' : `<h2>From the pre-observation conversation</h2>
${box('What the teacher wants feedback on', a.pre.focus, 2)}
${box('Lesson objective', a.pre.objective, 2)}
${box('Where this lesson sits in the unit', a.pre.unit, 1)}
${box('Teaching style and where to look for evidence', a.pre.style, 1)}`}
<h2>${a.isPopin ? 'Focus to notice' : 'Focus areas and look-fors'}</h2>
${a.categories.length ? a.categories.map(catHTML).join('') : '<p class="sub">No focus areas chosen yet.</p>'}
<div class="page"><h2>Timestamped notes</h2>
<p class="key"><b>Who:</b> T = Teacher · S = Students · E = Space${tagsLegend ? ` &nbsp;&nbsp; <b>Tags:</b> ${esc(tagsLegend)}` : ''}</p>
<table class="notes"><colgroup><col class="c1"><col class="c2"><col><col class="c4"></colgroup>
<thead><tr><th>Time</th><th>Who</th><th>What I see and hear</th><th>Tags</th></tr></thead><tbody>${rows(13)}</tbody></table></div>
<div class="page"><h2>Timestamped notes (continued)</h2>
<table class="notes"><colgroup><col class="c1"><col class="c2"><col><col class="c4"></colgroup>
<thead><tr><th>Time</th><th>Who</th><th>What I see and hear</th><th>Tags</th></tr></thead><tbody>${rows(9)}</tbody></table>
<h2>Before you leave the room</h2>
${box('Strengths I noticed', '', 3)}
${box('Growth and support', '', 3)}
${box('Questions for our conversation', '', 2)}
<footer>Type these notes into the Teaching with Grace observation page afterward to tag them and build the summary.${a.ref ? `<div class="refline">Sheet reference (for import — please don’t alter): gcs-pd:twg:v${a.version ?? 1}:${esc(a.ref)}</div>` : ''}</footer></div>
</body></html>`
}
