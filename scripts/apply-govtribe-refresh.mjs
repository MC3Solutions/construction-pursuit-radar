import fs from 'node:fs';

const SNAP='data/govtribe-current.json';
const PATCH='data/govtribe-refresh-patch.json';
const now=new Date();
const snap=JSON.parse(fs.readFileSync(SNAP,'utf8'));
const patch=JSON.parse(fs.readFileSync(PATCH,'utf8'));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const words=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const enrich=new Map();
for(const e of snap.federalEnrichment||[]){const k=norm(e.solicitation||e.s);if(k&&e.rom)enrich.set(k,e)}
for(const e of patch.federalEnrichment||[]){const k=norm(e.solicitation||e.s);if(k&&e.rom)enrich.set(k,e)}
snap.federalEnrichment=[...enrich.values()];

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
snap.meta.curatedSledRecords=kept.length;
snap.meta.rules='Only active construction pursuits with usable source links are retained. Consulting-only, staffing, goods-only, maintenance-only/on-call noise and duplicates are excluded. ROMs are explicit published estimates/magnitudes only.';
snap.records=kept.sort((a,b)=>new Date(a.d)-new Date(b.d));
fs.writeFileSync(SNAP,JSON.stringify(snap,null,2)+'\n');
console.log(JSON.stringify({generatedAt:snap.generatedAt,rawFederalMatches:snap.meta.rawFederalMatches,rawSledMatches:snap.meta.rawSledMatches,curatedSledRecords:kept.length,added,updated,expiredPruned:(snap.meta.curatedSledRecords||0)-kept.length},null,2));
