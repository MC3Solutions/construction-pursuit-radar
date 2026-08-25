import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd(), DATA=path.join(ROOT,'data'), DIAG=path.join(ROOT,'diagnostics');
const NOW=new Date(), RUN=NOW.toISOString();
const LABEL={EVA:'Virginia eVA',TNSTREAM:'TN STREAM',TNDOT:'TN TDOT'};
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const key=o=>`${o.source}|${norm(o.s)}|${norm(o.n)}|${o.state}`;
const isFuture=s=>s&&new Date(s)>NOW;

function dateFromClosing(text){
  const m=clean(text).match(/Closing On:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if(!m)return null;
  let y=+m[3]; if(y<100)y+=2000; let h=+m[4]; const ap=m[6].toUpperCase(); if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;
  return new Date(Date.UTC(y,+m[1]-1,+m[2],h+4,+m[5])).toISOString();
}
function dateLoose(text){
  const all=[];
  for(const m of clean(text).matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/gi)){
    let h=+m[4];if(m[6].toUpperCase()==='PM'&&h<12)h+=12;if(m[6].toUpperCase()==='AM'&&h===12)h=0;all.push(new Date(Date.UTC(+m[3],+m[1]-1,+m[2],h+5,+m[5])));
  }
  return all.filter(d=>d>NOW).sort((a,b)=>a-b).at(-1)?.toISOString()||null;
}
function solType(s=''){return clean(s).split(/\s+/)[0]||'State / Local'}
function dedupe(rows){const m=new Map();for(const o of rows){const k=key(o);if(!m.has(k))m.set(k,o)}return [...m.values()]}
async function readJson(f,x){try{return JSON.parse(await fs.readFile(f,'utf8'))}catch{return x}}
async function snapshot(page,name){try{await page.screenshot({path:path.join(DIAG,`${name}-repair-${Date.now()}.png`),fullPage:true})}catch{}try{await fs.writeFile(path.join(DIAG,`${name}-repair-${Date.now()}.html`),await page.content())}catch{}}
async function makeContext(browser){const c=await browser.newContext({ignoreHTTPSErrors:true,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',viewport:{width:1440,height:1000},timezoneId:'America/New_York'});return c}

async function scrapeEva(browser){
  const c=await makeContext(browser), p=await c.newPage();p.setDefaultTimeout(12000);
  const url='https://mvendor.cgieva.com/Vendor/public/AllOpportunities.jsp?status=Open&category=Construction';
  try{
    const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:35000});await p.waitForTimeout(1600);
    const body=clean(await p.locator('body').innerText());
    if([401,403].includes(r?.status())||/forbidden|access denied|captcha|verify you are human/i.test(body.slice(0,1500))) throw new Error(`eVA blocked browser access (${r?.status()||'unknown'})`);
    const expected=+(body.match(/Found\s+(\d+)\s+results/i)?.[1]||0);
    let stable=0,prev=0;
    for(let i=0;i<35;i++){
      const count=await p.locator('#solr-search-results div.card.text-center').count();
      if(expected&&count>=expected)break;
      const loader=p.locator('#solr-search-results li.fetch-by-cursor').last();
      if(await loader.count()) await loader.scrollIntoViewIfNeeded().catch(()=>{});
      await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await p.waitForTimeout(900);
      const next=await p.locator('#solr-search-results div.card.text-center').count();
      stable=next===prev?stable+1:0;prev=next;
      if(stable>=4)break;
    }
    const raw=await p.locator('#solr-search-results div.card.text-center').evaluateAll((cards,url)=>cards.map(card=>{
      const txt=(card.innerText||'').replace(/\s+/g,' ').trim();
      const title=(card.querySelector('.card-header h5.card-title')?.textContent||'').replace(/\s+/g,' ').trim();
      const solicitation=(card.querySelector('.card-body h6.card-title')?.textContent||'').replace(/\s+/g,' ').trim();
      const loc=(card.querySelector('p.card-text.text-muted')?.textContent||'Virginia').replace(/\s+/g,' ').trim();
      const desc=(card.querySelector('p#longdescription')?.textContent||'').replace(/\s+/g,' ').trim();
      const badges=[...card.querySelectorAll('.evaoutlinedbadge')].map(x=>(x.textContent||x.getAttribute('title')||'').trim()).filter(Boolean);
      return{title,solicitation,loc,desc,badges,txt,url};
    }),url);
    const rows=[];
    for(const x of raw){const d=dateFromClosing(x.txt);if(!isFuture(d)||!x.title)continue;rows.push({source:'EVA',sourceLabel:LABEL.EVA,s:x.solicitation||x.title,n:x.title,type:solType(x.solicitation),t:solType(x.solicitation),set:'State / Local',p:RUN,d,u:RUN,state:'VA',l:x.loc||'Virginia',c:'Construction',scope:x.badges.includes('Construction')?'Construction':(x.badges.at(-1)||'Construction'),r:url,x:37.6,y:-78.6,approx:true,description:x.desc});}
    await snapshot(p,'EVA');
    const out=dedupe(rows);const status=expected&&out.length>=expected?'OK':out.length?'PARTIAL':'ERROR';
    return{status,expected,records:out,message:`eVA reported ${expected||'unknown'} open Construction results; loaded ${raw.length} cards and parsed ${out.length} future pursuits.`};
  }catch(e){await snapshot(p,'EVA');return{status:'ERROR',expected:0,records:[],message:e.message}}finally{await c.close()}
}

async function scrapeStream(browser){
  const c=await makeContext(browser),p=await c.newPage();p.setDefaultTimeout(12000);
  const url='https://comptroller.aem.tn.extglb.tn.gov/generalservices/stream/stream/contractors/construction-bid-list.html';
  try{
    await p.goto(url,{waitUntil:'domcontentloaded',timeout:35000});await p.waitForTimeout(1200);
    const chunks=await p.evaluate(()=>{
      const out=[];for(const b of document.querySelectorAll('button')){let e=b.parentElement;for(let i=0;i<6&&e;i++,e=e.parentElement){const t=(e.innerText||'').replace(/\s+/g,' ').trim();if(/Bid Opening/i.test(t)&&t.length<10000){out.push({title:(b.innerText||'').replace(/\s+/g,' ').trim(),text:t,href:e.querySelector('a[href]')?.href||location.href});break}}}return out;
    });
    const rows=[];for(const x of chunks){const d=dateLoose(x.text);if(!isFuture(d)||!x.title)continue;rows.push({source:'TNSTREAM',sourceLabel:LABEL.TNSTREAM,s:x.title,n:x.title,type:'IFB',t:'IFB',set:'State / Local',p:RUN,d,u:RUN,state:'TN',l:'Tennessee',c:'Construction',scope:'State Capital Construction',r:x.href,x:35.8,y:-86.4,approx:true});}
    await snapshot(p,'TNSTREAM');const out=dedupe(rows);return{status:out.length?'OK':'PARTIAL',records:out,message:`Parsed ${out.length} future STREAM construction bid-list projects.`};
  }catch(e){await snapshot(p,'TNSTREAM');return{status:'ERROR',records:[],message:e.message}}finally{await c.close()}
}

async function scrapeTdot(browser){
  const c=await makeContext(browser),p=await c.newPage();p.setDefaultTimeout(10000);
  const urls=['https://www.tn.gov/tdot/tdot-construction-division/bid-lettings/e-plans-room.html','https://www.tn.gov/tdot/tdot-construction-division/bid-lettings/information-on-bidding.html'];
  try{
    let loaded=false,body='',used='';
    for(const u of urls){try{await p.goto(u,{waitUntil:'domcontentloaded',timeout:25000});await p.waitForTimeout(700);body=clean(await p.locator('body').innerText());used=u;loaded=true;break}catch{}}
    if(!loaded)throw new Error('TDOT public bidding pages could not be reached from the runner.');
    await snapshot(p,'TNDOT');
    const future=[];
    const links=await p.locator('a[href]').evaluateAll(as=>as.map(a=>({text:(a.innerText||'').replace(/\s+/g,' ').trim(),href:a.href})));
    for(const l of links){const m=l.text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\s+Letting/i);if(!m)continue;const d=new Date(`${m[1]} ${m[2]}, ${m[3]} 10:00:00 GMT-0500`);if(d>NOW)future.push({source:'TNDOT',sourceLabel:LABEL.TNDOT,s:l.text,n:l.text,type:'Highway Letting',t:'Highway Letting',set:'State / Local',p:RUN,d:d.toISOString(),u:RUN,state:'TN',l:'Tennessee',c:'237310',scope:'Highway / Bridge Construction',r:l.href,x:35.8,y:-86.4,approx:true});}
    return{status:'OK',records:dedupe(future),message:`TDOT bidding page reachable (${used}); ${future.length} future advertised letting link(s) found.`};
  }catch(e){await snapshot(p,'TNDOT');return{status:'ERROR',records:[],message:e.message}}finally{await c.close()}
}

function annotate(newRows,oldRows){const old=new Map(oldRows.map(o=>[key(o),o]));return newRows.map(o=>{const p=old.get(key(o));o.firstSeen=p?.firstSeen||p?.p||RUN;o.lastSeen=RUN;o.change=!p?'NEW':([o.d,o.n,o.r,o.scope].join('|')!==[p.d,p.n,p.r,p.scope].join('|')?'CHANGED':'ACTIVE');return o})}

const current=await readJson(path.join(DATA,'priority-current.json'),{records:[]});
const health=await readJson(path.join(DATA,'source-health.json'),{generatedAt:RUN,total:0,sources:{}});
const old=current.records||[];
const browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled','--no-sandbox']});
let eva,stream,tdot;try{[eva,stream,tdot]=await Promise.all([scrapeEva(browser),scrapeStream(browser),scrapeTdot(browser)])}finally{await browser.close()}
let rows=[...old];
for(const [src,res,label] of [['EVA',eva,LABEL.EVA],['TNSTREAM',stream,LABEL.TNSTREAM],['TNDOT',tdot,LABEL.TNDOT]]){
  const prior=rows.filter(o=>o.source===src);rows=rows.filter(o=>o.source!==src);
  if((res.status==='OK'||res.status==='PARTIAL')&&(res.records.length||src==='TNDOT')){
    rows.push(...annotate(res.records,prior));
    health.sources[src]={label,status:res.status,count:res.records.length,checkedAt:RUN,message:res.message,stale:res.status!=='OK'};
  }else{
    prior.forEach(o=>o.stale=true);rows.push(...prior);
    health.sources[src]={label,status:res.status,count:prior.length,checkedAt:RUN,message:`${res.message}${prior.length?` Preserved ${prior.length} last-good records.`:''}`,stale:true};
  }
}
rows=dedupe(rows).filter(o=>!o.d||new Date(o.d)>NOW);health.generatedAt=RUN;health.total=rows.length;
await fs.writeFile(path.join(DATA,'priority-current.json'),JSON.stringify({generatedAt:RUN,records:rows},null,2)+'\n');
await fs.writeFile(path.join(DATA,'priority-current.js'),`window.MC3_DIRECT=${JSON.stringify(rows)};\n`);
await fs.writeFile(path.join(DATA,'source-health.json'),JSON.stringify(health,null,2)+'\n');
await fs.writeFile(path.join(DATA,'source-health.js'),`window.MC3_HEALTH=${JSON.stringify(health)};\n`);
console.log(JSON.stringify({eva:{status:eva.status,expected:eva.expected,count:eva.records.length,message:eva.message},stream:{status:stream.status,count:stream.records.length,message:stream.message},tdot:{status:tdot.status,count:tdot.records.length,message:tdot.message}},null,2));
