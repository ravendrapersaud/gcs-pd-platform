// A distraction-free "writing window" for live observation notes. The capture
// page opens this document in a separate browser window (window.open). It is
// deliberately dumb: all state lives in the capture page, which pushes a `ctx`
// message over a BroadcastChannel; this window renders it and posts back an
// `add` message when the observer writes a note. The capture page owns the
// timer, tagging and persistence, so the two stay perfectly in sync.

export const TWG_WRITER_CHANNEL = 'twg-writer'

// Self-contained HTML document for the pop-out window. No external assets.
export function writerDocHtml(channel: string = TWG_WRITER_CHANNEL): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Observation notes</title>
<style>
:root{--bg:#f3f5f8;--surface:#fff;--ink:#15233a;--muted:#566377;--line:#d5dce6;--navy:#003882}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;display:flex;flex-direction:column}
header{padding:12px 16px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}
header .who{font-weight:600}
header .clock{font-variant-numeric:tabular-nums;opacity:.85;font-size:.9rem}
main{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px;max-width:760px;width:100%;margin:0 auto}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface);flex-wrap:wrap}
.seg button{border:0;background:none;padding:7px 14px;font:inherit;color:var(--muted);cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--navy);color:#fff}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:4px 11px;font:inherit;font-size:.85rem;cursor:pointer}
.chip[aria-pressed="true"]{color:#fff}
textarea{flex:1;min-height:160px;resize:none;border:1px solid var(--line);border-radius:10px;padding:14px;font:inherit;font-size:1.05rem;line-height:1.55;background:var(--surface);color:inherit}
textarea:focus{outline:2px solid color-mix(in srgb,var(--navy) 45%,transparent);border-color:var(--navy)}
.row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.add{background:var(--navy);color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}
.add:hover{filter:brightness(1.08)}
.hint{color:var(--muted);font-size:.8rem}
.list{list-style:none;margin:0;padding:0;overflow-y:auto;max-height:34vh;display:flex;flex-direction:column;gap:8px}
.note{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.note .top{display:flex;gap:8px;align-items:center;font-size:.78rem;color:var(--muted);margin-bottom:3px}
.note .top .t{font-variant-numeric:tabular-nums}
.note .tg{display:inline-block;border-radius:999px;padding:1px 8px;font-size:.72rem;color:#fff}
.empty{color:var(--muted);text-align:center;padding:18px;font-size:.9rem}
.lbl{font-size:.72rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
@media (prefers-color-scheme:dark){
  :root{--bg:#0e151f;--surface:#16202d;--ink:#e5ebf2;--muted:#9ba8b9;--line:#2a3748;--navy:#2b66ae}
  header{background:#0a1019}
}
</style></head><body>
<header><span class="who" id="teacher">Observation notes</span><span class="clock" id="clock"></span></header>
<main>
  <div><span class="lbl">Who</span><div class="seg" id="who"></div></div>
  <div><span class="lbl">Tags</span><div class="tags" id="tags"></div></div>
  <textarea id="ta" placeholder="Type what you see and hear…" autofocus></textarea>
  <div class="row">
    <span class="hint">⌘/Ctrl + Enter to add</span>
    <button class="add" id="add">Add note</button>
  </div>
  <div><span class="lbl">Added this visit</span><ul class="list" id="list"></ul></div>
</main>
<script>
(function(){
  var ch = new BroadcastChannel(${JSON.stringify(channel)});
  var ctx = { whoOrder:['T','S','E',''], whoLabels:{T:'Teacher',S:'Students',E:'Space','':'Note'}, tags:[], notes:[], teacher:'', clock:'' };
  var who = 'T';
  var sel = {};
  var $ = function(id){ return document.getElementById(id); };

  function renderWho(){
    var w = $('who'); w.innerHTML='';
    ctx.whoOrder.forEach(function(k){
      var b=document.createElement('button');
      b.textContent = ctx.whoLabels[k] || 'Note';
      b.setAttribute('aria-pressed', String(k===who));
      b.onclick=function(){ who=k; renderWho(); $('ta').focus(); };
      w.appendChild(b);
    });
  }
  function renderTags(){
    var t=$('tags'); t.innerHTML='';
    if(!ctx.tags.length){ t.innerHTML='<span class="hint">No tags set up yet.</span>'; return; }
    ctx.tags.forEach(function(tag){
      var b=document.createElement('button');
      b.className='chip'; b.textContent=tag.label;
      var on=!!sel[tag.id];
      b.setAttribute('aria-pressed', String(on));
      if(on){ b.style.background=tag.color; b.style.borderColor=tag.color; }
      b.onclick=function(){ if(sel[tag.id]) delete sel[tag.id]; else sel[tag.id]=true; renderTags(); $('ta').focus(); };
      t.appendChild(b);
    });
  }
  function renderNotes(){
    var l=$('list'); l.innerHTML='';
    if(!ctx.notes.length){ l.innerHTML='<li class="empty">Your notes will appear here as you add them.</li>'; return; }
    ctx.notes.slice().reverse().forEach(function(n){
      var li=document.createElement('li'); li.className='note';
      var top=document.createElement('div'); top.className='top';
      top.innerHTML='<span class="t">'+n.t+'</span><span>'+(ctx.whoLabels[n.who]||'')+'</span>';
      (n.tagLabels||[]).forEach(function(tl){
        var s=document.createElement('span'); s.className='tg'; s.textContent=tl.label; s.style.background=tl.color; top.appendChild(s);
      });
      var p=document.createElement('div'); p.textContent=n.text;
      li.appendChild(top); li.appendChild(p); l.appendChild(li);
    });
  }
  function renderHead(){ $('teacher').textContent = ctx.teacher ? ('Notes · '+ctx.teacher) : 'Observation notes'; $('clock').textContent = ctx.clock||''; }
  function renderAll(){ renderWho(); renderTags(); renderNotes(); renderHead(); }

  ch.onmessage=function(e){
    var d=e.data; if(!d) return;
    if(d.type==='ctx'){
      ctx=d;
      if(ctx.whoOrder.indexOf(who)===-1) who='T';
      var valid={}; ctx.tags.forEach(function(t){ valid[t.id]=true; });
      Object.keys(sel).forEach(function(id){ if(!valid[id]) delete sel[id]; });
      renderAll();
    }
  };
  function add(){
    var ta=$('ta'); var text=ta.value.trim(); if(!text) return;
    ch.postMessage({ type:'add', who:who, text:text, tags:Object.keys(sel) });
    ta.value=''; ta.focus();
  }
  $('add').onclick=add;
  $('ta').addEventListener('keydown', function(e){ if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ e.preventDefault(); add(); } });
  window.addEventListener('beforeunload', function(){ try{ ch.postMessage({type:'bye'}); ch.close(); }catch(_){} });
  renderAll();
  ch.postMessage({ type:'hello' });
  setTimeout(function(){ $('ta').focus(); }, 60);
})();
</script>
</body></html>`
}
