import fs from 'node:fs';

const file='index.html';
let h=fs.readFileSync(file,'utf8');

// Keep the dashboard header intentionally simple. Set-aside counts remain available through filters.
h=h.replace(/<div class="stats">[\s\S]*?<\/div><\/header>/,
  '<div class="stats"><div class="stat"><b id="visibleCount">…</b><span>Visible Pursuits</span></div></div></header>');

// Search every useful displayed field token-by-token so "water roanoke" works even when words live in different fields.
const searchBlock=`function searchMatch(o,term){var tokens=norm(term).split(' ').filter(Boolean);if(!tokens.length)return true;var hay=norm([o.n,o.s,o.l,o.set,o.scope,o.c,o.sourceLabel,o.rom,o.description].join(' '));return tokens.every(function(t){return hay.indexOf(t)>=0})}\nfunction filtered(){var term=q?q.value:'',rows=data.filter(function(o){if(!multiMatch(state,o.state))return false;if(!multiMatch(setaside,o.set))return false;if(!multiMatch(naics,o.c))return false;if(!multiMatch(source,o.source))return false;if(type&&type.value!=='ALL'&&o.t!==type.value)return false;if(status&&status.value==='DUE'&&!dueSoon(o))return false;if(status&&status.value==='NEW'&&!isNew(o))return false;if(status&&status.value==='CHANGED'&&!isChanged(o))return false;if(!searchMatch(o,term))return false;return true});if(sort&&sort.value==='DUE_DESC')rows.sort(function(a,b){return new Date(b.d)-new Date(a.d)});else if(sort&&sort.value==='UPDATED')rows.sort(function(a,b){return new Date(b.u||0)-new Date(a.u||0)});else if(sort&&sort.value==='POSTED')rows.sort(function(a,b){return new Date(b.p||0)-new Date(a.p||0)});else if(sort&&sort.value==='STATE')rows.sort(function(a,b){return a.state.localeCompare(b.state)||new Date(a.d)-new Date(b.d)});else if(sort&&sort.value==='SOURCE')rows.sort(function(a,b){return a.sourceLabel.localeCompare(b.sourceLabel)||new Date(a.d)-new Date(b.d)});else rows.sort(function(a,b){return new Date(a.d)-new Date(b.d)});return rows}`;
h=h.replace(/function filtered\(\)\{[\s\S]*?\}\nfunction render\(\)/,searchBlock+'\nfunction render()');

// Render must not depend on KPI elements that may have been intentionally removed.
h=h.replace(/function render\(\)\{[\s\S]*?var activeSources=/,
  "function render(){now=new Date();currentRows=filtered();var vc=$('visibleCount');if(vc)vc.textContent=currentRows.length;var activeSources=");

// Make event binding resilient and explicit; this prevents one missing control from killing keyword search.
h=h.replace(/\[q,type,status,sort\]\.forEach\(function\(el\)\{el\.addEventListener\(el===q\?'input':'change',render\)\}\);render\(\);/,
  "[q,type,status,sort].filter(Boolean).forEach(function(el){el.addEventListener(el===q?'input':'change',render)});if(q){q.setAttribute('autocomplete','off')}render();");

// Keep ROM visible only when populated.
h=h.replace(/function popup\(o\)\{return[\s\S]*?\}\nfunction useRadar/,
  "function popup(o){return'<b>'+esc(o.n)+'</b><br>'+esc(o.sourceLabel)+' · '+esc(o.l)+'<br>'+esc(o.set)+(o.rom?'<br><b>ROM:</b> '+esc(o.rom):'')+'<br>Due '+esc(fmtDate(o.d))+'<br><a href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a>'}\nfunction useRadar");
h=h.replace(/function card\(o\)\{[\s\S]*?\}\nfunction searchMatch/,
  "function card(o){var scopePrefix=/^\\d{6}$/.test(String(o.c||''))?'<b>NAICS:</b> ':'<b>Scope:</b> ',romLine=o.rom?'<br><b>ROM:</b> '+esc(o.rom):'';return'<article class=\"card\"><div class=\"project-name\">'+esc(o.n)+'</div><div class=\"badges\">'+badges(o)+'</div><div class=\"meta\">'+esc(o.l)+(o.approx?' <em>(map pin approximate)</em>':'')+'<br>'+scopePrefix+esc(o.c||'')+(o.scope&&o.scope!==o.c?' · '+esc(o.scope):'')+romLine+'<br><b>Due:</b> '+esc(fmtDate(o.d))+' · <b>Solicitation:</b> '+esc(o.s)+'<br><b>Posted:</b> '+esc(String(o.p||'').slice(0,10))+'</div><a class=\"open\" href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a></article>'}\nfunction searchMatch");

fs.writeFileSync(file,h);
console.log('Dashboard UI repaired: one KPI, resilient tokenized search, conditional ROM display.');
