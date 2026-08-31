import fs from 'node:fs';
import path from 'node:path';

const DATA=path.resolve('data');
const SNAP=path.join(DATA,'govtribe-current.json');
const PATCH=path.join(DATA,'govtribe-refresh-patch.json');
const FED_JSON=path.join(DATA,'federal-current.json');
const FED_JS=path.join(DATA,'federal-current.js');
const PRIORITY_JSON=path.join(DATA,'priority-current.json');
const PRIORITY_JS=path.join(DATA,'priority-current.js');
const HEALTH_JSON=path.join(DATA,'source-health.json');
const HEALTH_JS=path.join(DATA,'source-health.js');
const RUN=new Date().toISOString(), NOW=new Date();

const load=(f,x)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return x}};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const normWords=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const future=o=>!o.d || new Date(o.d)>NOW;
const romClean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,140);
const publicUrl=o=>/^https?:\/\//i.test(String(o.r||''))?o.r:'';

let snapshot=load(SNAP,{federalEnrichment:[],records:[],meta:{}});
const patch=load(PATCH,null);
if(patch){
  const excludedEnrichment=new Set((patch.excludeFederalEnrichment||[]).map(norm).filter(Boolean));
  const enrich=new Map();
  for(const e of snapshot.federalEnrichment||[]){const k=norm(e.solicitation||e.s||'');if(k&&!excludedEnrichment.has(k)&&romClean(e.rom))enrich.set(k,{...e,rom:romClean(e.rom)})}
  for(const e of patch.federalEnrichment||[]){const k=norm(e.solicitation||e.s||'');if(k&&!excludedEnrichment.has(k)&&romClean(e.rom))enrich.set(k,{...e,rom:romClean(e.rom)})}
  const priorRecords=(snapshot.records||[]).filter(future);
  const bySol=new Map(),byTitle=new Map();
  for(const o of priorRecords){const s=norm(o.s);if(s)bySol.set(s,o);if(normWords(o.n))byTitle.set(`${o.state||''}|${normWords(o.n)}`,o)}
  let deltaAdded=0,deltaUpdated=0;
  for(const raw of patch.records||[]){
    if(!future(raw)||!publicUrl(raw))continue;
    const o={...raw,u:patch.generatedAt||RUN};
    const s=norm(o.s),tk=`${o.state||''}|${normWords(o.n)}`;
    const old=(s&&bySol.get(s))||byTitle.get(tk);
    if(old){Object.assign(old,o);deltaUpdated++;continue}
    priorRecords.push(o);if(s)bySol.set(s,o);if(normWords(o.n))byTitle.set(tk,o);deltaAdded++;
  }
  snapshot={...snapshot,generatedAt:patch.generatedAt||RUN,meta:{...(snapshot.meta||{}),rawFederalMatches:Number(patch.rawFederalMatches||0),rawSledMatches:Number(patch.rawSledMatches||0),curatedSledRecords:priorRecords.length,rules:'Only active construction pursuits with usable source links are retained. Consulting-only, staffing, goods-only, maintenance-only/on-call noise and duplicates are excluded. ROMs are explicit published estimates/magnitudes only; IDIQ/MACC ceilings and contract capacities are excluded.'},federalEnrichment:[...enrich.values()],records:priorRecords.sort((a,b)=>new Date(a.d||'2999-12-31')-new Date(b.d||'2999-12-31'))};
  fs.writeFileSync(SNAP,JSON.stringify(snapshot,null,2)+'\n');
  console.log(JSON.stringify({govTribeDeltaApplied:true,deltaAdded,deltaUpdated,excludedFederalEnrichment:excludedEnrichment.size,curatedSledRecords:priorRecords.length,rawFederalMatches:snapshot.meta.rawFederalMatches,rawSledMatches:snapshot.meta.rawSledMatches},null,2));
}

const fed=load(FED_JSON,{records:[]});
const priority=load(PRIORITY_JSON,{records:[]});
const health=load(HEALTH_JSON,{generatedAt:RUN,total:0,sources:{}});

const enrichBySol=new Map();
for(const e of snapshot.federalEnrichment||[]){
  const k=norm(e.solicitation||e.s||'');
  const rom=romClean(e.rom);
  if(k&&rom) enrichBySol.set(k,{...e,rom});
}

let romAdded=0;
for(const row of fed.records||[]){
  while(row.length<15)row.push('');
  if(row[14])continue;
  const e=enrichBySol.get(norm(row[1]));
  if(!e)continue;
  row[14]=e.rom;
  romAdded++;
}
fed.generatedAt=RUN;
fed.govTribeEnrichment={snapshotGeneratedAt:snapshot.generatedAt||null,romAdded,method:'Explicit published estimate/magnitude from GovTribe opportunity history; SAM remains authoritative for the federal notice. IDIQ/MACC ceilings and contract capacities are excluded.'};
fs.writeFileSync(FED_JSON,JSON.stringify(fed,null,2)+'\n');
fs.writeFileSync(FED_JS,'window.MC3_FED_RAW='+JSON.stringify(fed.records||[])+';\n');

const current=(priority.records||[]).filter(o=>o.source!=='GOVTRIBE');
const fedSols=new Set((fed.records||[]).map(r=>norm(r[1])).filter(Boolean));
const existingSols=new Set(current.map(o=>norm(o.s)).filter(Boolean));
const existingTitles=new Set(current.map(o=>`${o.state||''}|${normWords(o.n)}`).filter(x=>!x.endsWith('|')));
const gt=[];
let duplicateCount=0,expiredCount=0;
for(const raw of snapshot.records||[]){
  const o={...raw,source:'GOVTRIBE',sourceLabel:'GovTribe Supplemental'};
  if(!future(o)){expiredCount++;continue}
  const sol=norm(o.s), titleKey=`${o.state||''}|${normWords(o.n)}`;
  if((sol&&(fedSols.has(sol)||existingSols.has(sol))) || (normWords(o.n)&&existingTitles.has(titleKey))){duplicateCount++;continue}
  o.type=o.type||'State / Local';
  o.set=o.set||'State / Local';
  o.scope=o.scope||o.c||'Construction';
  o.c=o.c||o.scope||'Construction';
  o.u=o.u||snapshot.generatedAt||RUN;
  o.r=publicUrl(o)||String(raw.sourceUrl||raw.govtribeUrl||'');
  o.rom=romClean(o.rom);
  o.approx=o.approx!==false;
  gt.push(o);
  if(sol)existingSols.add(sol);
  if(normWords(o.n))existingTitles.add(titleKey);
}

priority.generatedAt=RUN;
priority.records=[...current,...gt].sort((a,b)=>new Date(a.d||'2999-12-31')-new Date(b.d||'2999-12-31'));
fs.writeFileSync(PRIORITY_JSON,JSON.stringify(priority,null,2)+'\n');
fs.writeFileSync(PRIORITY_JS,'window.MC3_DIRECT='+JSON.stringify(priority.records)+';\n');

const fedRom=(fed.records||[]).filter(r=>r[14]).length;
const priorityRom=priority.records.filter(o=>o.rom).length;
health.sources||={};
health.sources.GOVTRIBE={
  label:'GovTribe Supplemental',status:'OK',count:gt.length,checkedAt:RUN,stale:false,
  message:`GovTribe snapshot contributed ${gt.length} net-new construction pursuit(s), skipped ${duplicateCount} duplicate(s), and filled ${romAdded} missing federal ROM(s). SAM.gov remains authoritative for matched federal notices.`
};
if(health.sources.FED){
  health.sources.FED.checkedAt=RUN;
  health.sources.FED.message=String(health.sources.FED.message||'').replace(/Published ROMs: \d+\./,`Published ROMs: ${fedRom}.`) || `Published ROMs: ${fedRom}.`;
}
health.priorityRom={checkedAt:RUN,populated:priorityRom,message:`${priorityRom} active state/local or GovTribe supplemental pursuit(s) currently contain a published ROM/estimate.`};
health.generatedAt=RUN;
health.total=Object.values(health.sources).reduce((n,s)=>n+(Number(s.count)||0),0);
health.govTribe={snapshotGeneratedAt:snapshot.generatedAt||null,rawFederalMatches:Number(snapshot.meta?.rawFederalMatches||0),rawSledMatches:Number(snapshot.meta?.rawSledMatches||0),netNew:gt.length,duplicatesSkipped:duplicateCount,expiredSkipped:expiredCount,federalRomAdded:romAdded,totalRom:fedRom+priorityRom};
fs.writeFileSync(HEALTH_JSON,JSON.stringify(health,null,2)+'\n');
fs.writeFileSync(HEALTH_JS,'window.MC3_HEALTH='+JSON.stringify(health)+';\n');
console.log(JSON.stringify({govTribeSnapshot:snapshot.generatedAt||null,netNew:gt.length,duplicatesSkipped:duplicateCount,expiredSkipped:expiredCount,federalRomAdded:romAdded,federalRom:fedRom,priorityRom,totalRom:fedRom+priorityRom},null,2));
