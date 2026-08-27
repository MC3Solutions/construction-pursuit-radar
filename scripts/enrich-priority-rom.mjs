import fs from 'node:fs/promises';
import path from 'node:path';

const DATA=path.resolve('data'), JSON_PATH=path.join(DATA,'priority-current.json'), JS_PATH=path.join(DATA,'priority-current.js'), CACHE_PATH=path.join(DATA,'priority-rom-cache.json'), HEALTH_PATH=path.join(DATA,'source-health.json'), HEALTH_JS=path.join(DATA,'source-health.js');
const RUN=new Date().toISOString();
const clean=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&ndash;|&#8211;/gi,'–').replace(/&mdash;|&#8212;/gi,'—').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
const money=s=>clean(s).replace(/\$\s+/g,'$');
async function load(f,x){try{return JSON.parse(await fs.readFile(f,'utf8'))}catch{return x}}
function romFrom(text=''){
  const s=clean(text);if(!s)return'';
  const amount='\\$\\s*[0-9][0-9,]*(?:\\.[0-9]+)?(?:\\s*(?:million|thousand|billion|[mkb]))?';
  const labels="(?:magnitude(?: of construction)?|construction magnitude|estimated(?: construction| project)? (?:cost|value|amount|price)|engineer(?:'s)? estimate|government estimate|project estimate|cost range|price range|construction range|project range|estimated price range|budget(?: amount)?)";
  const tests=[
    new RegExp(labels+'\\s*(?:is|of|:|=|-)?\\s*(?:between\\s*)?('+amount+'\\s*(?:to|through|and|[-–—])\\s*'+amount+')','i'),
    new RegExp(labels+'\\s*(?:is|of|:|=|-)?\\s*('+amount+')','i'),
    new RegExp(labels+'[^.$]{0,100}(?:between|from)\\s*('+amount+')\\s*(?:and|to|through|[-–—])\\s*('+amount+')','i'),
    new RegExp('('+amount+')\\s*(?:to|through|and|[-–—])\\s*('+amount+')[^.$]{0,100}'+labels,'i')
  ];
  for(const re of tests){const m=s.match(re);if(!m)continue;const vals=m.slice(1).filter(x=>x&&/\$/.test(x));if(vals.length>=2)return money(vals[0])+' – '+money(vals[1]);if(vals.length===1)return money(vals[0])}
  return'';
}
async function fetchText(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);try{const r=await fetch(url,{signal:ctl.signal,redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',Accept:'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text()}finally{clearTimeout(timer)}}
async function mapLimit(items,limit,fn){let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(i<items.length){const n=i++;await fn(items[n],n)}}))}

const payload=await load(JSON_PATH,{records:[]}),rows=payload.records||[],cache=await load(CACHE_PATH,{version:1,records:{}});cache.records||={};
const work=[];for(const o of rows){if(o.rom)continue;if(!/^https?:/i.test(String(o.r||'')))continue;const stamp=[o.r,o.d,o.n].join('|'),c=cache.records[o.r];if(c&&c.stamp===stamp){if(c.rom)o.rom=c.rom;continue}work.push({o,stamp})}
let fetched=0,failed=0;await mapLimit(work,8,async item=>{try{const text=await fetchText(item.o.r),rom=romFrom(text);if(rom)item.o.rom=rom;cache.records[item.o.r]={stamp:item.stamp,rom,checkedAt:RUN};fetched++}catch(e){cache.records[item.o.r]={stamp:item.stamp,rom:'',checkedAt:RUN,error:String(e.message||e).slice(0,100)};failed++}});
for(const k of Object.keys(cache.records))if(!rows.some(o=>o.r===k))delete cache.records[k];cache.generatedAt=RUN;await fs.writeFile(CACHE_PATH,JSON.stringify(cache,null,2)+'\n');payload.generatedAt=RUN;payload.records=rows;await fs.writeFile(JSON_PATH,JSON.stringify(payload,null,2)+'\n');await fs.writeFile(JS_PATH,`window.MC3_DIRECT=${JSON.stringify(rows)};\n`);
const populated=rows.filter(o=>o.rom).length,health=await load(HEALTH_PATH,{generatedAt:RUN,sources:{}});health.generatedAt=RUN;health.priorityRom={checkedAt:RUN,populated,message:`${populated} active state/local pursuit(s) currently contain a published ROM/estimate parsed from a source page or listing.`};await fs.writeFile(HEALTH_PATH,JSON.stringify(health,null,2)+'\n');await fs.writeFile(HEALTH_JS,`window.MC3_HEALTH=${JSON.stringify(health)};\n`);
console.log(JSON.stringify({records:rows.length,populated,fetched,failed},null,2));
