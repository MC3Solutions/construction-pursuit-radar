import fs from 'node:fs';
import path from 'node:path';

const DATA=path.resolve('data');
const JSON_PATH=path.join(DATA,'federal-current.json'), JS_PATH=path.join(DATA,'federal-current.js');
const CACHE_PATH=path.join(DATA,'federal-rom-cache.json'), HEALTH_PATH=path.join(DATA,'source-health.json'), HEALTH_JS=path.join(DATA,'source-health.js');
const API_KEY=process.env.SAM_GOV_API_KEY||'';
const BASE='https://api.sam.gov/prod/opportunities/v1/noticedesc';
const RUN=new Date().toISOString();
const load=(f,x)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return x}};
const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&ndash;|&#8211;/gi,'–').replace(/&mdash;|&#8212;/gi,'—').replace(/\s+/g,' ').trim();
const money=s=>clean(s).replace(/\$\s+/g,'$').replace(/\s+([,.])/g,'$1');
function romFrom(text=''){
  const s=clean(text);if(!s)return'';
  const amount='\\$\\s*[0-9][0-9,]*(?:\\.[0-9]+)?(?:\\s*(?:million|thousand|billion|[mkb]))?';
  const range=`(${amount}\\s*(?:to|through|and|[-–—])\\s*${amount})`;
  const labels="(?:magnitude(?: of construction)?|construction magnitude|estimated(?: construction| project)? (?:cost|value|amount|price)|engineer(?:'s)? estimate|government estimate|project estimate|cost range|price range|construction range|project range|estimated price range)";
  for(const re of [
    new RegExp(labels+'\\s*(?:is|of|:|=|-)?\\s*(?:between\\s*)?'+range,'i'),
    new RegExp(labels+'\\s*(?:is|of|:|=|-)?\\s*('+amount+')','i'),
    new RegExp('('+amount+')\\s*(?:to|through|and|[-–—])\\s*('+amount+')[^.$]{0,90}'+labels,'i'),
    new RegExp(labels+'[^.$]{0,90}(between|from)\\s*('+amount+')\\s*(?:and|to|through|[-–—])\\s*('+amount+')','i'),
    new RegExp(labels+'[^.$]{0,60}(?:greater than|over|more than)\\s*('+amount+')','i'),
    new RegExp(labels+'[^.$]{0,60}(?:less than|under|not to exceed)\\s*('+amount+')','i')
  ]){
    const m=s.match(re);if(!m)continue;
    if(/greater than|over|more than/i.test(m[0]))return 'Over '+money(m[m.length-1]);
    if(/less than|under|not to exceed/i.test(m[0]))return 'Under '+money(m[m.length-1]);
    const vals=m.slice(1).filter(x=>x&&/\$/.test(x));if(vals.length>=2)return money(vals[0])+' – '+money(vals[1]);if(vals.length===1)return money(vals[0]);
  }
  return'';
}
function strings(v,out=[]){if(typeof v==='string')out.push(v);else if(Array.isArray(v))v.forEach(x=>strings(x,out));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))if(/description|body|content|text/i.test(k))strings(x,out);return out}
async function description(noticeId){const u=new URL(BASE);u.searchParams.set('noticeid',noticeId);u.searchParams.set('api_key',API_KEY);const res=await fetch(u,{headers:{Accept:'application/json,text/plain,*/*','User-Agent':'MC3-Construction-Pursuit-Radar/1.0'}});if(!res.ok)throw new Error(`HTTP ${res.status}`);const body=await res.text();try{return strings(JSON.parse(body)).join(' ')}catch{return body}}
async function mapLimit(items,limit,fn){let i=0;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const idx=i++;await fn(items[idx],idx)}});await Promise.all(workers)}
function writeAll(payload){const rows=payload.records||[];fs.writeFileSync(JSON_PATH,JSON.stringify(payload,null,2)+'\n');fs.writeFileSync(JS_PATH,'window.MC3_FED_RAW='+JSON.stringify(rows)+';\n');const legacy=['federal-1-20260825.js','federal-2-20260825.js','federal-3-20260825.js'],size=Math.ceil(rows.length/3)||1;legacy.forEach((f,i)=>{const shard=rows.slice(i*size,(i+1)*size);fs.writeFileSync(path.join(DATA,f),i===0?'window.MC3_FED_RAW='+JSON.stringify(shard)+';\n':'window.MC3_FED_RAW=(window.MC3_FED_RAW||[]).concat('+JSON.stringify(shard)+');\n')})}

const payload=load(JSON_PATH,{records:[]}),rows=payload.records||[],cache=load(CACHE_PATH,{version:1,records:{}});cache.records||={};
if(!API_KEY||!rows.length){console.log('[FED-ROM] API key or federal rows unavailable; no enrichment performed.');process.exit(0)}
let fetched=0,failed=0,cached=0;const work=[];
for(const row of rows){while(row.length<15)row.push('');const id=row[0],updated=row[7]||row[5]||'';if(row[14]){cache.records[id]={updated,rom:row[14],checkedAt:RUN};continue}const c=cache.records[id];if(c&&c.updated===updated){row[14]=c.rom||'';cached++;continue}work.push({row,id,updated})}
await mapLimit(work,8,async item=>{try{const text=await description(item.id);const rom=romFrom(text);item.row[14]=rom;cache.records[item.id]={updated:item.updated,rom,checkedAt:RUN};fetched++}catch(e){cache.records[item.id]={updated:item.updated,rom:'',checkedAt:RUN,error:String(e.message||e).slice(0,120)};failed++}});
for(const id of Object.keys(cache.records))if(!rows.some(r=>r[0]===id))delete cache.records[id];
cache.generatedAt=RUN;fs.writeFileSync(CACHE_PATH,JSON.stringify(cache,null,2)+'\n');payload.generatedAt=RUN;payload.romEnrichment='SAM.gov notice-description parser; displayed only when an estimate/magnitude is explicitly published.';writeAll(payload);
const populated=rows.filter(r=>r[14]).length,health=load(HEALTH_PATH,{generatedAt:RUN,sources:{}});health.sources||={};const fed=health.sources.FED||{};health.sources.FED={...fed,message:String(fed.message||'Live SAM.gov refresh.').replace(/ Published ROMs: \d+\./,'')+` Published ROMs: ${populated}.`,checkedAt:RUN};health.generatedAt=RUN;fs.writeFileSync(HEALTH_PATH,JSON.stringify(health,null,2)+'\n');fs.writeFileSync(HEALTH_JS,'window.MC3_HEALTH='+JSON.stringify(health)+';\n');
console.log(JSON.stringify({records:rows.length,populated,fetched,cached,failed},null,2));
