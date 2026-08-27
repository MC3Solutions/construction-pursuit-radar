import fs from 'node:fs';
const file='index.html';
let h=fs.readFileSync(file,'utf8');
h=h.replace(/<div class="stats">[\s\S]*?<\/div><\/header>/,
  '<div class="stats">'+
  '<div class="stat"><b id="visibleCount">…</b><span>Visible Pursuits</span></div>'+
  '<div class="stat"><b id="due14Count">…</b><span>Due in 14+ Days</span></div>'+
  '<div class="stat"><b id="sdvosbCount">…</b><span>SDVOSB</span></div>'+
  '<div class="stat"><b id="smallBizCount">…</b><span>Total Small Business</span></div>'+
  '</div></header>');
h=h.replace(/function render\(\)\{now=new Date\(\);currentRows=filtered\(\);\$\('visibleCount'\)\.textContent=currentRows\.length;(?:\$\('due14Count'\)[\s\S]*?)?var activeSources=/,
  "function render(){now=new Date();currentRows=filtered();$('visibleCount').textContent=currentRows.length;$('due14Count').textContent=currentRows.filter(function(o){return due14Plus(o)}).length;$('sdvosbCount').textContent=currentRows.filter(function(o){return /^SDVOSB(?: |$)/.test(String(o.set||''))||/Service-Disabled Veteran-Owned Small Business/i.test(String(o.set||''))}).length;$('smallBizCount').textContent=currentRows.filter(function(o){return String(o.set||'')==='Total Small Business'}).length;var activeSources=");
fs.writeFileSync(file,h);
console.log('Required KPI cards restored: Visible Pursuits, Due in 14+ Days, SDVOSB, Total Small Business.');
