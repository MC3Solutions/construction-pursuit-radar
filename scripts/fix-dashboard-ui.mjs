import fs from 'node:fs';

const file='index.html';
let h=fs.readFileSync(file,'utf8');

// Keep the dashboard header intentionally simple. Set-aside counts remain available through filters.
h=h.replace(/<div class="stats">[\s\S]*?<\/div><\/header>/,
  '<div class="stats"><div class="stat"><b id="visibleCount">…</b><span>Visible Pursuits</span></div></div></header>');

// Notice Type and Status use the same multi-choice control as State, Set-Aside, Scope, and Source.
h=h.replace(/<div><label for="type">Notice Type<\/label><select id="type">[\s\S]*?<\/select><\/div>/,
  '<div><label>Notice Type</label><details class="multiFilter"><summary>All notice types</summary><div class="multiMenu" id="type"></div></details></div>');
h=h.replace(/<div><label for="status">Status<\/label><select id="status">[\s\S]*?<\/select><\/div>/,
  '<div><label>Status</label><details class="multiFilter"><summary>All statuses</summary><div class="multiMenu" id="status"></div></details></div>');

// Replace same-day "new" logic with a rolling seven-day release window.
h=h.replace(/function isNew\(o\)\{return String\(o\.p\|\|''\)\.slice\(0,10\)===SNAP\}/,
  "function isReleased7(o){var p=new Date(o.p||0);if(Number.isNaN(p.getTime()))return false;var age=(now-p)/86400000;return age>=0&&age<=7}");
h=h.replace(/isNew\(o\)/g,'isReleased7(o)');

// Keep dot and badge wording aligned with the rolling release state.
h=h.replace(/<span class="badge new">New<\/span>/g,'<span class="badge new">Released ≤ 7 Days</span>');
h=h.replace(/<span class="dot green"><\/span>New<\/div>/g,'<span class="dot green"></span>Released ≤ 7 Days</div>');

// Build Notice Type and Status multi-select choices. Selected statuses are OR'ed together.
h=h.replace(/addOptions\(type,Array\.from\(new Set\(data\.map\(function\(o\)\{return o\.t\}\)\.filter\(Boolean\)\)\)\.sort\(\)\);/,
  "addMultiOptions(type,Array.from(new Set(data.map(function(o){return o.t}).filter(Boolean))).sort(),null,'All notice types');addMultiOptions(status,['DUE','RELEASED7','CHANGED'],function(v){return v==='DUE'?'Due ≤ 7 Days':v==='RELEASED7'?'Released ≤ 7 Days':'Changed Today'},'All statuses');");

// Search every useful displayed field token-by-token so "water roanoke" works even when words live in different fields.
const searchBlock=`function searchMatch(o,term){var tokens=norm(term).split(' ').filter(Boolean);if(!tokens.length)return true;var hay=norm([o.n,o.s,o.l,o.set,o.scope,o.c,o.sourceLabel,o.rom,o.description].join(' '));return tokens.every(function(t){return hay.indexOf(t)>=0})}\nfunction filtered(){var term=q?q.value:'',rows=data.filter(function(o){if(!multiMatch(state,o.state))return false;if(!multiMatch(setaside,o.set))return false;if(!multiMatch(naics,o.c))return false;if(!multiMatch(source,o.source))return false;if(!multiMatch(type,o.t))return false;var sv=selectedValues(status);if(sv.length){var sm=(sv.indexOf('DUE')>=0&&dueSoon(o))||(sv.indexOf('RELEASED7')>=0&&isReleased7(o))||(sv.indexOf('CHANGED')>=0&&isChanged(o));if(!sm)return false}if(!searchMatch(o,term))return false;return true});if(sort&&sort.value==='DUE_DESC')rows.sort(function(a,b){return new Date(b.d)-new Date(a.d)});else if(sort&&sort.value==='UPDATED')rows.sort(function(a,b){return new Date(b.u||0)-new Date(a.u||0)});else if(sort&&sort.value==='POSTED')rows.sort(function(a,b){return new Date(b.p||0)-new Date(a.p||0)});else if(sort&&sort.value==='STATE')rows.sort(function(a,b){return a.state.localeCompare(b.state)||new Date(a.d)-new Date(b.d)});else if(sort&&sort.value==='SOURCE')rows.sort(function(a,b){return a.sourceLabel.localeCompare(b.sourceLabel)||new Date(a.d)-new Date(b.d)});else rows.sort(function(a,b){return new Date(a.d)-new Date(b.d)});return rows}`;
h=h.replace(/function filtered\(\)\{[\s\S]*?\}\nfunction render\(\)/,searchBlock+'\nfunction render()');

// Visible Pursuits is a map KPI, so count only records that can actually render as map pins.
// Explicit null checks matter because Number(null) is 0 in JavaScript.
h=h.replace(/function render\(\)\{[\s\S]*?var activeSources=/,
  "function render(){now=new Date();currentRows=filtered();var mappableRows=currentRows.filter(function(o){return o.x!=null&&o.y!=null&&Number.isFinite(Number(o.x))&&Number.isFinite(Number(o.y))});var vc=$('visibleCount');if(vc)vc.textContent=mappableRows.length;var activeSources=");

// Multi-select containers bind through addMultiOptions; only search and sort need direct listeners here.
h=h.replace(/\[q,type,status,sort\]\.filter\(Boolean\)\.forEach\(function\(el\)\{el\.addEventListener\(el===q\?'input':'change',render\)\}\);if\(q\)\{q\.setAttribute\('autocomplete','off'\)\}render\(\);/,
  "[q,sort].filter(Boolean).forEach(function(el){el.addEventListener(el===q?'input':'change',render)});if(q){q.setAttribute('autocomplete','off')}render();");
h=h.replace(/\[q,type,status,sort\]\.forEach\(function\(el\)\{el\.addEventListener\(el===q\?'input':'change',render\)\}\);render\(\);/,
  "[q,sort].filter(Boolean).forEach(function(el){el.addEventListener(el===q?'input':'change',render)});if(q){q.setAttribute('autocomplete','off')}render();");

// Keep ROM visible only when populated.
h=h.replace(/function popup\(o\)\{return[\s\S]*?\}\nfunction useRadar/,
  "function popup(o){return'<b>'+esc(o.n)+'</b><br>'+esc(o.sourceLabel)+' · '+esc(o.l)+'<br>'+esc(o.set)+(o.rom?'<br><b>ROM:</b> '+esc(o.rom):'')+'<br>Due '+esc(fmtDate(o.d))+'<br><a href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a>'}\nfunction useRadar");
h=h.replace(/function card\(o\)\{[\s\S]*?\}\nfunction searchMatch/,
  "function card(o){var scopePrefix=/^\\d{6}$/.test(String(o.c||''))?'<b>NAICS:</b> ':'<b>Scope:</b> ',romLine=o.rom?'<br><b>ROM:</b> '+esc(o.rom):'';return'<article class=\"card\"><div class=\"project-name\">'+esc(o.n)+'</div><div class=\"badges\">'+badges(o)+'</div><div class=\"meta\">'+esc(o.l)+(o.approx?' <em>(map pin approximate)</em>':'')+'<br>'+scopePrefix+esc(o.c||'')+(o.scope&&o.scope!==o.c?' · '+esc(o.scope):'')+romLine+'<br><b>Due:</b> '+esc(fmtDate(o.d))+' · <b>Solicitation:</b> '+esc(o.s)+'<br><b>Posted:</b> '+esc(String(o.p||'').slice(0,10))+'</div><a class=\"open\" href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a></article>'}\nfunction searchMatch");

fs.writeFileSync(file,h);
console.log('Dashboard UI repaired: Notice Type and Status are multi-select; Released ≤ 7 Days is rolling; green dots age to blue after seven days; one map-aligned KPI remains.');
