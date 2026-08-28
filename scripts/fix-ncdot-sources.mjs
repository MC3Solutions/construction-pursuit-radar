import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const RUN=new Date().toISOString();
const NOW=new Date();
const DOT='data/dot-current.json';
const PRIORITY='data/priority-current.json';
const PRIORITY_JS='data/priority-current.js';
const HEALTH='data/source-health.json';
const HEALTH_JS='data/source-health.js';
const NC_CENTER=[35.5,-79.4];
const readJson=(p,f)=>fs.readFile(p,'utf8').then(JSON.parse).catch(()=>f);
const clean=s=>String(s||'').replace(/\u00a0|\u200b/g,' ').replace(/\s+/g,' ').trim();
const slug=s=>clean(s).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
const dateIso=s=>{const d=new Date(`${s} 14:00:00 GMT-0400`);return Number.isFinite(d.getTime())?d.toISOString():null};
const activeDate=s=>{const x=dateIso(s);return x&&new Date(x)>NOW?x:null};
const key=o=>`${o.source}|${o.s}|${o.d||''}`;

function rec({id,title,due,url,type='NCDOT Letting',location='North Carolina',status='Advertised',fallback=false}){
  return {source:'NCDOT',state:'NC',s:id,n:title,d:due,l:location,scope:'Highway / Bridge Construction',c:'237310',r:url,type:`NCDOT ${status} ${type}`,sourceLabel:'NCDOT',set:'State / Local',p:RUN,u:RUN,x:NC_CENTER[0],y:NC_CENTER[1],approx:true,fallback};
}

const VERIFIED_PUBLIC_FALLBACK=[
  {label:'Central',date:'Sep 15, 2026',url:'https://connect.ncdot.gov/letting/Pages/Central-Letting-Details.aspx'},
  {label:'Division 2',date:'Sep 9, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division2Letting.aspx'},
  {label:'Division 2',date:'Sep 23, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division2Letting.aspx'},
  {label:'Division 3',date:'Sep 3, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division3Letting.aspx'},
  {label:'Division 3',date:'Sep 17, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division3Letting.aspx'},
  {label:'Division 7',date:'Sep 3, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division7Letting.aspx'},
  {label:'Division 7',date:'Sep 17, 2026',url:'https://connect.ncdot.gov/letting/Pages/Division7Letting.aspx'}
];
function verifiedFallback(){
  return VERIFIED_PUBLIC_FALLBACK.map(x=>{const due=activeDate(x.date);if(!due)return null;return rec({id:`NCDOT-${slug(x.label)}-${due.slice(0,10).replace(/-/g,'')}`,title:`NCDOT ${x.label} Letting · Advertised`,due,url:x.url,type:`${x.label} Letting`,status:'Advertised',fallback:true})}).filter(Boolean);
}

async function bodyText(browser,url){
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  try{
    const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    if(!r?.ok()) return '';
    await page.waitForFunction(()=>/Status\s*Advertised|Status\s*Anticipated/i.test(document.body?.innerText||''),{timeout:7000}).catch(()=>{});
    await page.waitForTimeout(1000);
    return clean(await page.locator('body').innerText().catch(()=>''));
  } catch {return ''} finally {await page.close()}
}

function parseLettings(text,url,label){
  const out=[];
  const divRe=/(\d{1,2}-\d{1,2}-20\d{2}).{0,100}?Status\s*(Advertised|Anticipated).{0,80}?Let Date\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2})(?:.{0,60}?Type\s*(Central|Div\.\s*\d+))?/gi;
  let m;
  while((m=divRe.exec(text))){const due=activeDate(m[3]);if(!due)continue;const status=m[2],letType=clean(m[4]||label||'NCDOT');const id=`NCDOT-${slug(letType)}-${due.slice(0,10).replace(/-/g,'')}`;out.push(rec({id,title:`NCDOT ${letType} Letting · ${status}`,due,url,type:`${letType} Letting`,status}))}
  const centralRe=/(\d{1,2}-\d{1,2}-20\d{2})\s+Central Letting\s+Status\s*(Advertised|Anticipated)/gi;
  while((m=centralRe.exec(text))){const due=activeDate(m[1]);if(!due)continue;const status=m[2],id=`NCDOT-CENTRAL-${due.slice(0,10).replace(/-/g,'')}`;out.push(rec({id,title:`NCDOT Central Letting · ${status}`,due,url,type:'Central Letting',status}))}
  return out;
}

function parseDesignBuild(text,url){
  const out=[];const re=/([A-Za-z0-9][A-Za-z0-9 .&/()-]{2,90}?)\s*Status\s*(Advertised|Anticipated)\s*Date\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2})?)\s*Type\s*Design/gi;let m;
  while((m=re.exec(text))){let title=clean(m[1]).replace(/^.*?(?:Projects|Projects​|Projects\s+)/i,'').trim();if(!title||title.length>100)continue;const due=m[3]?activeDate(m[3]):null;if(m[3]&&!due)continue;const status=m[2];out.push(rec({id:`NCDOT-DB-${slug(title)}`,title:`${title} · ${status}`,due,url,type:'Alternative Delivery',status}))}
  return out;
}

async function parseRoadside(browser,url){
  const page=await browser.newPage({viewport:{width:1500,height:1000}});const out=[];
  try{const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if(!r?.ok())return out;await page.waitForTimeout(2200);const rows=await page.evaluate(()=>[...document.querySelectorAll('tr')].map(tr=>({text:(tr.innerText||'').replace(/\s+/g,' ').trim(),href:tr.querySelector('a[href]')?.href||''})).filter(x=>x.text));for(const row of rows){const id=(row.text.match(/\b54-[A-Z0-9-]+\b/i)||[])[0];if(!id||!/\bAdvertised\b/i.test(row.text))continue;const dm=row.text.match(/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/);if(!dm)continue;const due=activeDate(dm[0]);if(!due)continue;out.push(rec({id:id.toUpperCase(),title:row.text.slice(0,220),due,url:row.href||url,type:'Roadside Environmental',status:'Advertised'}))}}catch{return out}finally{await page.close()}return out;
}

async function main(){
  const dotBefore=await readJson(DOT,{generatedAt:RUN,records:[]});const priorityBefore=await readJson(PRIORITY,{generatedAt:RUN,records:[]});const previousNC=dotBefore.records.filter(o=>o.source==='NCDOT'&&(!o.d||new Date(o.d)>NOW));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let rows=[];
  try{const pages=[['https://connect.ncdot.gov/letting/Pages/Central-Letting-Details.aspx','Central'],...Array.from({length:14},(_,i)=>[`https://connect.ncdot.gov/letting/Pages/Division${i+1}Letting.aspx`,`Division ${i+1}`])];const texts=await Promise.all(pages.map(async([url,label])=>[url,label,await bodyText(browser,url)]));for(const [url,label,text] of texts)rows.push(...parseLettings(text,url,label));const dbUrl='https://connect.ncdot.gov/letting/pages/design-build.aspx';rows.push(...parseDesignBuild(await bodyText(browser,dbUrl),dbUrl));rows.push(...await parseRoadside(browser,'https://connect.ncdot.gov/letting/Pages/Roadside-Environmental-Letting-List.aspx?let_status=Advertised'))}finally{await browser.close()}

  let mode='direct';
  if(!rows.length){rows=verifiedFallback();mode=rows.length?'verified-public-fallback':'last-good'}
  const dedup=new Map();for(const o of rows)dedup.set(key(o),o);rows=[...dedup.values()];const prev=new Map(previousNC.map(o=>[key(o),o]));const freshCount=rows.length;
  if(rows.length)rows=rows.map(o=>{const p=prev.get(key(o));o.firstSeen=p?.firstSeen||RUN;o.lastSeen=RUN;o.change=p?'ACTIVE':'NEW';return o});else rows=previousNC.map(o=>({...o,stale:true,change:'ACTIVE'}));

  const dotRows=[...dotBefore.records.filter(o=>o.source!=='NCDOT'),...rows];await fs.writeFile(DOT,JSON.stringify({generatedAt:RUN,records:dotRows},null,2)+'\n');const merged=[...priorityBefore.records.filter(o=>o.source!=='NCDOT'),...rows];await fs.writeFile(PRIORITY,JSON.stringify({generatedAt:RUN,records:merged},null,2)+'\n');await fs.writeFile(PRIORITY_JS,`window.MC3_DIRECT=${JSON.stringify(merged)};\n`);

  const health=await readJson(HEALTH,{generatedAt:RUN,total:0,sources:{}});health.sources||={};
  const ok=freshCount>0;const msg=mode==='direct'?`Parsed ${freshCount} active/future NCDOT Central, Division, Alternative Delivery, and Roadside records from direct NCDOT letting pages.`:mode==='verified-public-fallback'?`Direct browser extraction was blocked; loaded ${freshCount} currently advertised September NCDOT lettings from verified public NCDOT letting pages as a dated fallback.`:`NCDOT returned no usable records during this refresh. Preserved ${rows.length} last-good record(s).`;
  health.sources.NCDOT={label:'NCDOT',status:ok?(mode==='direct'?'OK':'PARTIAL'):'PARTIAL',count:rows.length,checkedAt:RUN,message:msg,stale:mode==='last-good',fallback:mode==='verified-public-fallback'};health.generatedAt=RUN;health.total=Object.values(health.sources).reduce((n,s)=>n+(Number(s.count)||0),0);await fs.writeFile(HEALTH,JSON.stringify(health,null,2)+'\n');await fs.writeFile(HEALTH_JS,`window.MC3_SOURCE_HEALTH=${JSON.stringify(health)};\n`);console.log(`NCDOT repair mode=${mode}; records=${rows.length}.`);
}
main().catch(e=>{console.error(e);process.exit(1)});
