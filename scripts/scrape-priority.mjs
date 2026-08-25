import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const DIAG = path.join(ROOT, 'diagnostics');
const NOW = new Date();
const RUN_ISO = NOW.toISOString();
const TODAY = RUN_ISO.slice(0, 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

await fs.mkdir(DATA, { recursive: true });
await fs.mkdir(DIAG, { recursive: true });

const SOURCE_LABEL = {
  EVA: 'Virginia eVA',
  NCEVP: 'NC eVP',
  TNEDISON: 'TN Edison',
  TNSTREAM: 'TN STREAM',
  TNDOT: 'TN TDOT'
};
const STATE_CENTROID = {
  VA: [37.6, -78.6], NC: [35.5, -79.4], TN: [35.8, -86.4]
};
const constructionWords = /\b(construction|construct|renovation|renovate|replacement|replace|repair|rehab|rehabilitation|building|roof|roofing|hvac|mechanical|electrical|plumbing|water|sewer|wastewater|pump station|lift station|utility|utilities|road|roadway|paving|resurface|bridge|culvert|stormwater|drainage|sidewalk|concrete|masonry|demolition|site work|sitework|grading|dredg|levee|facility|facilities|fire alarm|generator|chiller|boiler|tower|hangar|airport|airfield|trail|retaining wall|water main|force main|pipeline|streetscape|lighting|elevator|sprinkler|parking|garage|interior|exterior|improvement|capital project|general contractor|cmar|cm\/gc|design-build)\b/i;
const nonConstructionWords = /\b(vehicle|automobile|printing|software|insurance|medical supplies|food service|catering|janitorial supplies|office supplies|consulting services only|training services|legal services|audit services)\b/i;

function clean(s = '') { return String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function keyText(s = '') { return clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function relevant(text = '') { const t = clean(text); return constructionWords.test(t) && !nonConstructionWords.test(t); }
function hashKey(o) { return `${o.source}|${keyText(o.s || '')}|${keyText(o.n || '')}|${o.state || ''}`; }
function isoOrNull(v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; }

function parseLooseDates(text = '') {
  const out = [];
  const seen = new Set();
  const patterns = [
    /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/g,
    /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/gi,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d{2})(?:\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?)?/gi
  ];
  let m;
  while ((m = patterns[0].exec(text))) {
    const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +(m[4]||17), +(m[5]||0), +(m[6]||0)));
    if (!seen.has(d.toISOString())) { seen.add(d.toISOString()); out.push(d); }
  }
  while ((m = patterns[1].exec(text))) {
    let hour = +(m[4] || 17); const ap = (m[6] || '').toUpperCase();
    if (ap.startsWith('P') && hour < 12) hour += 12; if (ap.startsWith('A') && hour === 12) hour = 0;
    const d = new Date(Date.UTC(+m[3], +m[1]-1, +m[2], hour, +(m[5]||0)));
    if (!seen.has(d.toISOString())) { seen.add(d.toISOString()); out.push(d); }
  }
  const months = {January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
  while ((m = patterns[2].exec(text))) {
    let hour = +(m[4] || 17); const ap = (m[6] || '').toLowerCase();
    if (ap.startsWith('p') && hour < 12) hour += 12; if (ap.startsWith('a') && hour === 12) hour = 0;
    const d = new Date(Date.UTC(+m[3], months[m[1]], +m[2], hour, +(m[5]||0)));
    if (!seen.has(d.toISOString())) { seen.add(d.toISOString()); out.push(d); }
  }
  return out.sort((a,b)=>a-b);
}

function futureDue(text = '') {
  const dates = parseLooseDates(text).filter(d => d.getTime() > NOW.getTime() - 6*60*60*1000);
  if (!dates.length) return null;
  return dates[dates.length - 1].toISOString();
}
function firstDate(text='') { const d=parseLooseDates(text); return d.length ? d[0].toISOString() : null; }
function solicitationFrom(text='') {
  const candidates = text.match(/\b(?:IFB|ITB|RFP|RFQ|RFSQ|RFx|SBC|CN|COVB|PE|BD|BID|Project|Contract|Solicitation|Event|No\.?|#)?\s*[A-Z0-9][A-Z0-9_./-]{4,}\b/gi) || [];
  return clean(candidates.find(x => /\d/.test(x)) || '').replace(/^(No\.?|#)\s*/i,'').slice(0,80);
}
function titleFromRow(cells, text) {
  const candidates = (cells || []).map(clean).filter(x => x.length >= 8 && x.length <= 220 && !/^\d{1,2}[/-]\d/.test(x));
  const preferred = candidates.find(x => constructionWords.test(x));
  return clean(preferred || candidates.sort((a,b)=>b.length-a.length)[0] || text).slice(0,220);
}
function normalizeRecord(o) {
  const state = o.state;
  if ((!o.x || !o.y) && STATE_CENTROID[state]) { o.x=STATE_CENTROID[state][0]; o.y=STATE_CENTROID[state][1]; o.approx=true; }
  o.sourceLabel = o.sourceLabel || SOURCE_LABEL[o.source] || o.source;
  o.type = o.type || 'State / Local';
  o.set = o.set || 'State / Local';
  o.scope = o.scope || 'Construction';
  o.c = o.c || o.scope;
  o.p = o.p || TODAY + 'T12:00:00Z';
  o.u = o.u || RUN_ISO;
  o.l = o.l || `${state}`;
  o.s = clean(o.s || solicitationFrom(o.n) || `${o.source}-${keyText(o.n).slice(0,40)}`);
  o.n = clean(o.n).slice(0,220);
  o.r = o.r || '';
  return o;
}

async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file,'utf8')); } catch { return fallback; } }
async function writeJson(file, obj) { await fs.writeFile(file, JSON.stringify(obj,null,2)+'\n'); }

async function extractTableRows(page) {
  return await page.evaluate(() => [...document.querySelectorAll('table tr')].map(tr => ({
    text: (tr.innerText || '').replace(/\s+/g,' ').trim(),
    cells: [...tr.querySelectorAll('th,td')].map(td => (td.innerText || '').replace(/\s+/g,' ').trim()),
    links: [...tr.querySelectorAll('a[href]')].map(a => ({ text:(a.innerText||'').trim(), href:a.href }))
  })).filter(x => x.text));
}

async function pageSnapshot(page, source) {
  try { await page.screenshot({path:path.join(DIAG,`${source}-${Date.now()}.png`),fullPage:true}); } catch {}
  try { await fs.writeFile(path.join(DIAG,`${source}-${Date.now()}.html`), await page.content()); } catch {}
}

function blockedText(text='') { return /(access denied|forbidden|captcha|verify you are human|bot detection|request rejected|403 forbidden)/i.test(text); }

async function launchBrowser() {
  return await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled','--no-sandbox']});
}
async function newPage(browser) {
  const context = await browser.newContext({userAgent:UA,viewport:{width:1440,height:1000},locale:'en-US',timezoneId:'America/New_York',extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  return {context,page};
}

async function goto(page,url) {
  const resp = await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(1800);
  const body = clean(await page.locator('body').innerText().catch(()=>''));
  const status = resp?.status() || 0;
  if (status===401 || status===403 || blockedText(body.slice(0,2000))) {
    const e = new Error(`BLOCKED ${status}: ${body.slice(0,180)}`); e.blocked=true; throw e;
  }
  return {status,body};
}

async function paginateByNext(page, onPage, maxPages=60) {
  let count=0, lastSig='';
  for (let i=0;i<maxPages;i++) {
    const rows=await extractTableRows(page); const sig=rows.slice(0,3).map(r=>r.text).join('|');
    if (sig && sig===lastSig) break; lastSig=sig; count += await onPage(rows,i);
    const next = page.locator('a,button,input[type=button],input[type=submit]').filter({hasText:/^(next|>|›|»|next page)$/i}).first();
    if (!await next.count()) break;
    const disabled = await next.getAttribute('disabled').catch(()=>null) || await next.getAttribute('aria-disabled').catch(()=>null);
    if (disabled==='true' || disabled==='disabled') break;
    await next.click().catch(()=>{}); await page.waitForTimeout(1200);
  }
  return count;
}

async function scrapeEva(browser) {
  const source='EVA', state='VA', records=[]; const {context,page}=await newPage(browser);
  const urls=[
    'https://mvendor.cgieva.com/Vendor/public/AllOpportunities.jsp?status=Open&category=Construction',
    'https://mvendor.cgieva.com/Vendor/public/AllOpportunities.jsp?status=Open'
  ];
  try {
    let loaded=false,lastErr;
    for (const url of urls) { try { await goto(page,url); loaded=true; break; } catch(e){ lastErr=e; if(!e.blocked) continue; } }
    if(!loaded) throw lastErr || new Error('eVA failed to load');
    const addRows = async rows => {
      let n=0;
      for (const row of rows) {
        if (!relevant(row.text)) continue;
        const due=futureDue(row.text); if(!due) continue;
        const href=(row.links.find(l=>/opportun|solicit|detail|view/i.test(l.href+' '+l.text))||row.links[0])?.href || page.url();
        const title=titleFromRow(row.cells,row.text); if(!title) continue;
        records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:solicitationFrom(row.text),n:title,d:due,p:firstDate(row.text),u:RUN_ISO,l:'Virginia',scope:'Construction',c:'Construction',r:href})); n++;
      }
      return n;
    };
    await paginateByNext(page,addRows,100);
    await pageSnapshot(page,source);
    const unique=dedupe(records);
    return result(source,unique, unique.length ? 'OK':'PARTIAL', unique.length?'Browser enumeration succeeded but eVA table structure may omit some metadata.':'Page loaded but no construction rows could be parsed.');
  } catch(e) {
    await pageSnapshot(page,source); return result(source,[],e.blocked?'BLOCKED':'ERROR',e.message);
  } finally { await context.close(); }
}

async function scrapeNcEvp(browser) {
  const source='NCEVP',state='NC',records=[]; const {context,page}=await newPage(browser);
  try {
    await goto(page,'https://evp.nc.gov/solicitations/');
    const openBox=page.getByText('Open',{exact:true}).first(); if(await openBox.count()) await openBox.click().catch(()=>{});
    const apply=page.getByRole('button',{name:/apply/i}).first(); if(await apply.count()) { await apply.click().catch(()=>{}); await page.waitForTimeout(1800); }
    const seenLinks=new Set();
    const collect=async()=>{
      const links=await page.locator('a[href*="/solicitations/details/"]').evaluateAll(as=>as.map(a=>({href:a.href,text:(a.innerText||'').trim()}))).catch(()=>[]);
      links.forEach(l=>seenLinks.add(l.href));
      return links.length;
    };
    await collect();
    await paginateByNext(page,async()=>{await collect();return 0;},80);
    const urls=[...seenLinks];
    for (const href of urls.slice(0,1200)) {
      const p=await context.newPage(); p.setDefaultTimeout(8000);
      try {
        const {body}=await goto(p,href); if(!relevant(body)) continue;
        const due=futureDue(body); if(!due) continue;
        const h1=clean(await p.locator('h1,h2').first().innerText().catch(()=>''));
        const descMatch=body.match(/Description\s+(.{20,260}?)(?:Attachments|Special Instructions|Solicitation Type|Owner|$)/i);
        const title=clean(descMatch?.[1] || h1 || body.slice(0,180));
        const sol=solicitationFrom(body);
        records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:sol,n:title,d:due,p:firstDate(body),u:RUN_ISO,l:'North Carolina',scope:'Construction',c:'Construction',r:href}));
      } catch {} finally { await p.close(); }
    }
    await pageSnapshot(page,source);
    const unique=dedupe(records);
    return result(source,unique, unique.length?'OK':'PARTIAL',`${urls.length} detail links discovered; ${unique.length} future construction pursuits parsed.`);
  } catch(e) { await pageSnapshot(page,source); return result(source,[],e.blocked?'BLOCKED':'ERROR',e.message); }
  finally { await context.close(); }
}

async function scrapeTnEdison(browser) {
  const source='TNEDISON',state='TN',records=[]; const {context,page}=await newPage(browser);
  try {
    await goto(page,'https://hub.edison.tn.gov/psc/fsprd/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?page=SCP_PUB_BIDLIST_FL');
    const parse=async rows=>{let n=0;for(const row of rows){if(!relevant(row.text))continue;const due=futureDue(row.text);if(!due)continue;const href=(row.links.find(l=>/bid|event|rfp|detail/i.test(l.text+' '+l.href))||row.links[0])?.href||page.url();records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:solicitationFrom(row.text),n:titleFromRow(row.cells,row.text),d:due,p:firstDate(row.text),u:RUN_ISO,l:'Tennessee',scope:'Construction',c:'Construction',r:href}));n++;}return n};
    await paginateByNext(page,parse,80); await pageSnapshot(page,source); const unique=dedupe(records);
    return result(source,unique,unique.length?'OK':'PARTIAL',`${unique.length} future construction rows parsed from Edison public bidding.`);
  } catch(e){await pageSnapshot(page,source);return result(source,[],e.blocked?'BLOCKED':'ERROR',e.message)} finally{await context.close()}
}

async function scrapeTnStream(browser) {
  const source='TNSTREAM',state='TN',records=[]; const {context,page}=await newPage(browser);
  try {
    await goto(page,'https://comptroller.aem.tn.extglb.tn.gov/generalservices/stream/stream/contractors/construction-bid-list.html');
    const chunks=await page.evaluate(()=>{
      const buttons=[...document.querySelectorAll('button')];
      return buttons.map(b=>{let el=b.parentElement;for(let i=0;i<4&&el;i++,el=el.parentElement){const t=(el.innerText||'').replace(/\s+/g,' ').trim();if(/Bid Opening/i.test(t)&&t.length<7000)return{title:(b.innerText||'').trim(),text:t,links:[...el.querySelectorAll('a[href]')].map(a=>a.href)}}return null}).filter(Boolean)
    });
    for(const ch of chunks){const due=futureDue(ch.text);if(!due)continue;const title=clean(ch.title.replace(/^[-–—\s]+/,''));records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:solicitationFrom(title),n:title,d:due,p:TODAY+'T12:00:00Z',u:RUN_ISO,l:locationFromText(ch.text,'Tennessee'),scope:'State Capital Construction',c:'Construction',r:ch.links[0]||page.url()}))}
    const rfpPage=await context.newPage(); try { await goto(rfpPage,'https://www.tn.gov/generalservices/stream/stream/contractors/requests-for-proposal--rfps-.html'); const rows=await extractTableRows(rfpPage); for(const row of rows){if(!relevant(row.text))continue;const due=futureDue(row.text);if(!due)continue;records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:solicitationFrom(row.text),n:titleFromRow(row.cells,row.text),d:due,p:TODAY+'T12:00:00Z',u:RUN_ISO,l:locationFromText(row.text,'Tennessee'),scope:'CM/GC / Construction RFP',c:'Construction',r:(row.links[0]?.href||rfpPage.url())}))} } finally {await rfpPage.close()}
    await pageSnapshot(page,source);const unique=dedupe(records);return result(source,unique,unique.length?'OK':'PARTIAL',`${unique.length} current STREAM bid/RFP pursuits parsed.`)
  } catch(e){await pageSnapshot(page,source);return result(source,[],e.blocked?'BLOCKED':'ERROR',e.message)} finally{await context.close()}
}

async function scrapeTdot(browser) {
  const source='TNDOT',state='TN',records=[]; const {context,page}=await newPage(browser);
  try {
    await goto(page,'https://www.tn.gov/tdot/tdot-construction-division/bid-lettings.html');
    const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>({text:(a.innerText||'').replace(/\s+/g,' ').trim(),href:a.href}))).catch(()=>[]);
    const candidate=links.filter(l=>/letting|proposal|bid/i.test(l.text) && /2026|2027|current|upcoming/i.test(l.text+' '+l.href));
    for(const l of candidate.slice(0,30)){
      const p=await context.newPage();p.setDefaultTimeout(9000);try{const {body}=await goto(p,l.href);if(!relevant(body))continue;const due=futureDue(body);if(!due)continue;records.push(normalizeRecord({source,sourceLabel:SOURCE_LABEL[source],state,s:solicitationFrom(body),n:clean(l.text||titleFromRow([],body)),d:due,p:TODAY+'T12:00:00Z',u:RUN_ISO,l:'Tennessee',scope:'Highway / Bridge Construction',c:'237310',r:l.href}))}catch{}finally{await p.close()}
    }
    await pageSnapshot(page,source);const unique=dedupe(records);return result(source,unique,unique.length?'OK':'PARTIAL',`${unique.length} future TDOT letting records parsed.`)
  } catch(e){await pageSnapshot(page,source);return result(source,[],e.blocked?'BLOCKED':'ERROR',e.message)}finally{await context.close()}
}

function locationFromText(text,fallback){const m=text.match(/([A-Z][A-Za-z .'-]+),\s*([A-Z][A-Za-z .'-]+) County,?\s*Tennessee/i)||text.match(/([A-Z][A-Za-z .'-]+),\s*Tennessee/i);return clean(m?.[0]||fallback)}
function dedupe(rows){const m=new Map();for(const o of rows){const k=hashKey(o);const old=m.get(k);if(!old||new Date(o.u||0)>new Date(old.u||0))m.set(k,o)}return[...m.values()]}
function result(source,records,status,message){return{source,label:SOURCE_LABEL[source],status,message,checkedAt:RUN_ISO,count:records.length,records}}

async function loadSeedFallback(){
  const current=await readJson(path.join(DATA,'priority-current.json'),null);if(current?.records?.length)return current.records;
  try{const txt=await fs.readFile(path.join(DATA,'priority-direct-20260825.js'),'utf8');const sandbox={};new Function('window',txt)(sandbox);return sandbox.MC3_DIRECT||[]}catch{return[]}
}

function compareAndAnnotate(records, previous){
  const old=new Map(previous.map(o=>[hashKey(o),o]));
  return records.map(o=>{const k=hashKey(o),p=old.get(k);o.firstSeen=p?.firstSeen||p?.p||RUN_ISO;o.lastSeen=RUN_ISO;if(!p)o.change='NEW';else if([o.d,o.n,o.r,o.scope].join('|')!==[p.d,p.n,p.r,p.scope].join('|'))o.change='CHANGED';else o.change='ACTIVE';return o})
}

function keepLastGood(results, previous){
  const bySource=new Map();previous.forEach(o=>{if(!bySource.has(o.source))bySource.set(o.source,[]);bySource.get(o.source).push(o)});
  const final=[];
  for(const r of results){if(r.status==='OK'&&r.records.length){final.push(...r.records)}else{const stale=bySource.get(r.source)||[];stale.forEach(o=>{o.stale=true;o.u=o.u||RUN_ISO});final.push(...stale);if(stale.length)r.message+=` Preserved ${stale.length} last-good records.`;r.count=stale.length}}
  return dedupe(final).filter(o=>!o.d||new Date(o.d)>NOW)
}

async function patchIndex(){
  const file=path.join(ROOT,'index.html');let html=await fs.readFile(file,'utf8');
  html=html.replace(/<script src="data\/priority-direct-20260825\.js\?v=1"><\/script>/,'<script src="data/priority-current.js?v=1"></script>');
  if(!html.includes('id="sourceHealth"')) html=html.replace('<section class="filters">','<div id="sourceHealth"></div>\n<section class="filters">');
  if(!html.includes('data/source-health.js')) html=html.replace('</body>','<script src="data/source-health.js?v=1"></script>\n<script src="source-health-ui.js?v=1"></script>\n</body>');
  await fs.writeFile(file,html);
}

const previous=await loadSeedFallback();
const browser=await launchBrowser();
let results=[];
try {
  results.push(await scrapeEva(browser));
  results.push(await scrapeNcEvp(browser));
  results.push(await scrapeTnEdison(browser));
  results.push(await scrapeTnStream(browser));
  results.push(await scrapeTdot(browser));
} finally { await browser.close(); }

let final=keepLastGood(results,previous);
final=compareAndAnnotate(final,previous);
const snapshot={generatedAt:RUN_ISO,records:final};
const health={generatedAt:RUN_ISO,total:final.length,sources:Object.fromEntries(results.map(r=>[r.source,{label:r.label,status:r.status,count:r.count,checkedAt:r.checkedAt,message:r.message,stale:!['OK'].includes(r.status)}]))};
await writeJson(path.join(DATA,'priority-current.json'),snapshot);
await fs.writeFile(path.join(DATA,'priority-current.js'),`window.MC3_DIRECT=${JSON.stringify(final)};\n`);
await writeJson(path.join(DATA,'source-health.json'),health);
await fs.writeFile(path.join(DATA,'source-health.js'),`window.MC3_HEALTH=${JSON.stringify(health)};\n`);
await patchIndex();
console.log(JSON.stringify(health,null,2));
