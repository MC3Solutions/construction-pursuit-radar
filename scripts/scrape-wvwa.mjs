import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=process.cwd(), DATA=path.join(ROOT,'data');
const RUN=new Date().toISOString(), NOW=new Date();
const SOURCE='WVWA', LABEL='Western Virginia Water Authority';
const LIST_URL='https://www.westernvawater.org/doing-business-with-us/invitations-to-bid';
const BASE='https://www.westernvawater.org';

const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const safeDate=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?null:d};
const dateFrom=(text,label)=>{const m=text.match(new RegExp(label+'\\s*:?\\s*(\\d{1,2}/\\d{1,2}/20\\d{2})(?:\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM))?','i'));if(!m)return null;let h=+(m[2]||17),ap=(m[4]||'').toUpperCase();if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;const [mm,dd,yy]=m[1].split('/').map(Number);return new Date(Date.UTC(yy,mm-1,dd,h,+(m[3]||0))).toISOString()};
const romFrom=text=>{const patterns=[/(?:engineer(?:'s)? estimate|estimated construction cost|construction estimate|project estimate|estimated cost|budget)\s*[:\-]?\s*(\$[\d,.]+(?:\s*(?:to|\-|–)\s*\$[\d,.]+)?(?:\s*(?:million|thousand))?)/i,/\bconstruction\s+magnitude\s*[:\-]?\s*([^.;]{0,80}\$[\d,.]+[^.;]{0,80})/i];for(const re of patterns){const m=text.match(re);if(m)return clean(m[1]).slice(0,120)}return''};
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'MC3-Construction-Pursuit-Radar/1.0',Accept:'text/html'}});if(!r.ok)throw new Error(`WVWA HTTP ${r.status}`);return r.text()}
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return fallback}}
function recKey(o){return `${o.source}|${norm(o.s)}|${norm(o.n)}|${o.state}`}

async function main(){
  await fs.mkdir(DATA,{recursive:true});
  const priorityPath=path.join(DATA,'priority-current.json'), healthPath=path.join(DATA,'source-health.json');
  const previous=await readJson(priorityPath,{records:[]}), old=previous.records||[];
  let fresh=[];let status='OK',message='';
  try{
    const listHtml=await get(LIST_URL), links=[];
    for(const m of listHtml.matchAll(/href=["']([^"']*\/Home\/Components\/RFP\/RFP\/\d+\/233[^"']*)["']/gi)){
      const href=m[1].startsWith('http')?m[1]:BASE+m[1];if(!links.includes(href))links.push(href);
    }
    for(const href of links){
      try{
        const html=await get(href), text=clean(html);
        const close=dateFrom(text,'Close Date');if(!close||safeDate(close)<=NOW)continue;
        const start=dateFrom(text,'Start Date')||RUN;
        let title=(text.match(/(?:INVITATION TO BID|REQUEST FOR PROPOSALS?|REQUEST FOR QUALIFICATIONS?)\s*:?\s*([^|]{8,220}?)(?=Department:|Category:|Start Date:|Close Date:)/i)||[])[1];
        title=clean(title||text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'Western Virginia Water Authority opportunity').replace(/\s*\|\s*.*$/,'').slice(0,220);
        const sol=(text.match(/\b(?:WVWA|WQ)-[A-Z0-9]+-\d{2}-\d{2}\b/i)||text.match(/\b(?:WVWA|WQ)-[A-Z0-9-]{4,}\b/i)||[])[0]||`WVWA-${href.match(/\/RFP\/(\d+)\//)?.[1]||norm(title).slice(0,20)}`;
        const scope=/waterline|water distribution|water main|sewer|wastewater|force main|pump station/i.test(title)?'Water / Sewer Infrastructure':'Water Authority Construction';
        fresh.push({source:SOURCE,sourceLabel:LABEL,state:'VA',s:sol,n:title,t:'Invitation to Bid',set:'State / Local',scope,c:scope,p:start,d:close,u:RUN,l:'Roanoke, VA',x:37.27097,y:-79.94143,approx:true,r:href,rom:romFrom(text)});
      }catch(e){console.warn('[WVWA] detail failed',href,e.message)}
    }
    const dedup=new Map();for(const o of fresh)dedup.set(recKey(o),o);fresh=[...dedup.values()];
    message=`${fresh.length} active construction invitations parsed from the WVWA public bid portal.`;
    if(!fresh.length)status='PARTIAL';
  }catch(e){status='ERROR';message=`WVWA refresh failed: ${e.message}`}

  const stale=old.filter(o=>o.source===SOURCE&&(!o.d||safeDate(o.d)>NOW));
  if(status!=='OK'&&stale.length){fresh=stale.map(o=>({...o,stale:true,u:RUN}));message+=` Preserved ${fresh.length} last-good WVWA records.`}
  const oldMap=new Map(old.filter(o=>o.source===SOURCE).map(o=>[recKey(o),o]));
  fresh=fresh.map(o=>{const p=oldMap.get(recKey(o));o.firstSeen=p?.firstSeen||p?.p||RUN;o.lastSeen=RUN;o.change=!p?'NEW':([o.d,o.n,o.r,o.scope,o.rom].join('|')!==[p.d,p.n,p.r,p.scope,p.rom].join('|')?'CHANGED':'ACTIVE');return o});
  const merged=old.filter(o=>o.source!==SOURCE).concat(fresh).filter(o=>!o.d||safeDate(o.d)>NOW);
  await fs.writeFile(priorityPath,JSON.stringify({generatedAt:RUN,records:merged},null,2)+'\n');
  await fs.writeFile(path.join(DATA,'priority-current.js'),`window.MC3_DIRECT=${JSON.stringify(merged)};\n`);

  const health=await readJson(healthPath,{generatedAt:RUN,total:0,sources:{}});health.sources||={};health.sources[SOURCE]={label:LABEL,status,count:fresh.length,checkedAt:RUN,message,stale:status!=='OK'};health.generatedAt=RUN;health.total=Object.values(health.sources).reduce((n,s)=>n+(Number(s.count)||0),0);
  await fs.writeFile(healthPath,JSON.stringify(health,null,2)+'\n');
  await fs.writeFile(path.join(DATA,'source-health.js'),`window.MC3_HEALTH=${JSON.stringify(health)};\n`);
  console.log(`[WVWA] ${status}: ${message}`);
}

await main();
