import fs from 'node:fs';

const SNAP='data/govtribe-current.json';
const PATCH='data/govtribe-refresh-patch.json';
const now=new Date();
const snap=JSON.parse(fs.readFileSync(SNAP,'utf8'));
const patch=JSON.parse(fs.readFileSync(PATCH,'utf8'));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const excludedEnrichment=new Set((patch.excludeFederalEnrichment||[]).map(norm).filter(Boolean));
const enrich=new Map();
for(const e of snap.federalEnrichment||[]){
  const k=norm(e.solicitation||e.s);
  if(k&&e.rom&&!excludedEnrichment.has(k))enrich.set(k,e);
}
for(const e of patch.federalEnrichment||[]){
  const k=norm(e.solicitation||e.s);
  if(k&&e.rom&&!excludedEnrichment.has(k))enrich.set(k,e);
}
snap.federalEnrichment=[...enrich.values()];

const previousCurated=Number(snap.meta?.curatedSledRecords||0);
const kept=(snap.records||[]).filter(o=>o.d && new Date(o.d)>now);
const bySol=new Map(), byTitle=new Map();
for(const o of kept){const s=norm(o.s);if(s)bySol.set(s,o);byTitle.set(`${o.state||''}|${words(o.n)}`,o)}
let added=0, updated=0;
for(const raw of patch.records||[]){
  if(!raw.d||new Date(raw.d)<=now||!/^https?:\/\//i.test(String(raw.r||'')))continue;
  const o={...raw,u:patch.generatedAt||new Date().toISOString()};
  const s=norm(o.s), tk=`${o.state||''}|${words(o.n)}`;
  const old=(s&&bySol.get(s))||byTitle.get(tk);
  if(old){Object.assign(old,o);updated++;continue}
  kept.push(o);if(s)bySol.set(s,o);byTitle.set(tk,o);added++;
}

snap.generatedAt=patch.generatedAt||new Date().toISOString();
snap.meta=snap.meta||{};
snap.meta.rawFederalMatches=Number(patch.rawFederalMatches||0);
snap.meta.rawSledMatches=Number(patch.rawSledMatches||0);
if(patch.rawSearchCounts)snap.meta.rawSearchCounts=patch.rawSearchCounts;
if(patch.searchProfile)snap.meta.searchProfile=patch.searchProfile;
snap.meta.curatedSledRecords=kept.length;
snap.meta.rules='Only active construction pursuits with usable source links are retained. Consulting-only, staffing, goods-only, maintenance-only/on-call, prequalification-only, sale/property, printing/noise and duplicates are excluded. GovTribe is supplemental to authoritative SAM.gov and priority state sources. ROMs are explicit published project estimates/magnitudes only; IDIQ/MACC/SATOC ceilings are never project ROMs.';
snap.records=kept.sort((a,b)=>new Date(a.d)-new Date(b.d));
fs.writeFileSync(SNAP,JSON.stringify(snap,null,2)+'\n');
console.log(JSON.stringify({generatedAt:snap.generatedAt,rawFederalMatches:snap.meta.rawFederalMatches,rawSledMatches:snap.meta.rawSledMatches,rawSearchCounts:snap.meta.rawSearchCounts||null,curatedSledRecords:kept.length,added,updated,expiredPruned:Math.max(0,previousCurated-kept.length+added)},null,2));
