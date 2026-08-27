import fs from 'node:fs';
import path from 'node:path';

const DATA=path.resolve('data');
const JSON_PATH=path.join(DATA,'federal-current.json');
const JS_PATH=path.join(DATA,'federal-current.js');
const HEALTH_JSON=path.join(DATA,'source-health.json');
const HEALTH_JS=path.join(DATA,'source-health.js');
const NOW=new Date();
const EAST=new Set(['ME','NH','VT','MA','RI','CT','NY','NJ','PA','DE','MD','DC','VA','WV','NC','SC','GA','FL','OH','MI','IN','KY','TN','AL','MS','WI','IL']);

const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const canonicalSol=s=>String(s||'').trim().toUpperCase()
  .replace(/(?:[-_]?A(?:MEND(?:MENT)?)?[-_]?0*\d+)$/i,'')
  .replace(/(?:[-_]?0{3,}\d{1,3})$/i,'')
  .replace(/(?:[-_]?(?:REV|MOD)[-_]?0*\d+)$/i,'');
const cleanTitle=s=>norm(String(s||'')
  .replace(/\b(?:amend(?:ment)?|modification|revised?|update)\s*#?\s*\d*\b/ig,' ')
  .replace(/^\s*(?:naics\s*\d+\s*)?(?:psc\s*[a-z0-9]+\s*)?(?:cons\s*[:\-])?/ig,' '));
const safeDate=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?null:d};
const stateOf=loc=>{const m=String(loc||'').match(/(?:,|\b)\s*(ME|NH|VT|MA|RI|CT|NY|NJ|PA|DE|MD|DC|VA|WV|NC|SC|GA|FL|OH|MI|IN|KY|TN|AL|MS|WI|IL)(?:\s|,|\d|$)/i);return m?m[1].toUpperCase():''};
const tokens=s=>new Set(cleanTitle(s).split(' ').filter(x=>x.length>2));
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(A.size,B.size)}
function rankType(t=''){t=String(t);if(/Solicitation/i.test(t)&&!/Pre/i.test(t))return 5;if(/Combined/i.test(t))return 5;if(/Pre-Solicitation|Presolicitation/i.test(t))return 4;if(/Sources Sought/i.test(t))return 3;return 1}
function prefer(a,b){const af=safeDate(a[6]),bf=safeDate(b[6]);const aFuture=af&&af>NOW,bFuture=bf&&bf>NOW;if(aFuture!==bFuture)return bFuture?b:a;const ar=rankType(a[3]),br=rankType(b[3]);if(ar!==br)return br>ar?b:a;const au=safeDate(a[7])?.getTime()||0,bu=safeDate(b[7])?.getTime()||0;if(au!==bu)return bu>au?b:a;const ap=safeDate(a[5])?.getTime()||0,bp=safeDate(b[5])?.getTime()||0;return bp>=ap?b:a}
function related(a,b){const sa=canonicalSol(a[1]),sb=canonicalSol(b[1]);if(!sa||sa!==sb)return false;const sta=stateOf(a[8]),stb=stateOf(b[8]);if(sta&&stb&&sta!==stb)return false;return similarity(a[2],b[2])>=0.42 || cleanTitle(a[2])===cleanTitle(b[2]) || (!sta||!stb);
}
function load(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}

const payload=load(JSON_PATH,null);
if(!payload?.records?.length){console.log('[FED-HARDEN] No federal records to process.');process.exit(0)}
const rows=payload.records.filter(a=>{const d=safeDate(a[6]);if(!d||d<=NOW)return false;const st=stateOf(a[8]);return !st||EAST.has(st)});
const groups=[];
for(const row of rows){let g=groups.find(g=>related(g.best,row));if(!g){groups.push({best:row,members:[row]});continue}g.members.push(row);g.best=prefer(g.best,row)}
const dedup=groups.map(g=>g.best).sort((a,b)=>new Date(a[6])-new Date(b[6]));
payload.records=dedup;payload.total=dedup.length;payload.generatedAt=new Date().toISOString();payload.grouping='Canonical solicitation family + normalized title/location; latest active Solicitation preferred over pre-solicitation/amendment echoes.';
fs.writeFileSync(JSON_PATH,JSON.stringify(payload,null,2)+'\n');
fs.writeFileSync(JS_PATH,'window.MC3_FED_RAW='+JSON.stringify(dedup)+';\n');
const legacy=['federal-1-20260825.js','federal-2-20260825.js','federal-3-20260825.js'];const size=Math.ceil(dedup.length/3)||1;legacy.forEach((f,i)=>{const shard=dedup.slice(i*size,(i+1)*size);fs.writeFileSync(path.join(DATA,f),i===0?'window.MC3_FED_RAW='+JSON.stringify(shard)+';\n':'window.MC3_FED_RAW=(window.MC3_FED_RAW||[]).concat('+JSON.stringify(shard)+');\n')});
const health=load(HEALTH_JSON,{generatedAt:new Date().toISOString(),sources:{}});health.sources||={};const prior=health.sources.FED||{};health.sources.FED={...prior,label:'Federal / SAM.gov',status:prior.status||'OK',count:dedup.length,checkedAt:new Date().toISOString(),message:`${prior.message||'Live SAM.gov refresh.'} Hardened ${rows.length} future federal records into ${dedup.length} underlying pursuits; active Solicitation records outrank pre-solicitations and amendment echoes.`,stale:!!prior.stale};health.generatedAt=new Date().toISOString();
fs.writeFileSync(HEALTH_JSON,JSON.stringify(health,null,2)+'\n');fs.writeFileSync(HEALTH_JS,'window.MC3_HEALTH='+JSON.stringify(health)+';\n');
console.log(`[FED-HARDEN] ${rows.length} future records -> ${dedup.length} pursuit families.`);
