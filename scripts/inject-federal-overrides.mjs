import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const jsonPath = path.join(DATA, 'priority-current.json');
const jsPath = path.join(DATA, 'priority-current.js');
const RUN = new Date().toISOString();

const overrides = [
  {
    id: 'f6819caa0d0f42879656f3ea88977cdf',
    federalMetaOpportunityId: '69aed2dc32f4c65ada0092d8',
    source: 'FED',
    sourceLabel: 'Federal / SAM.gov',
    state: 'MI',
    s: '36C78626B0005',
    n: 'Fort Custer National Cemetery - Cemetery Expansion and Site Improvements',
    t: 'Solicitation',
    type: 'Solicitation',
    set: 'SDVOSB',
    a: 'Service-Disabled Veteran-Owned Small Business',
    p: '2026-08-19T17:45:13Z',
    d: '2026-09-17T18:00:00Z',
    u: '2026-08-19T17:45:13Z',
    l: 'Fort Custer National Cemetery, 15501 Dickman Rd, Augusta, MI 49012',
    x: 42.3581142,
    y: -85.3342973,
    c: '237990',
    scope: 'Other Heavy / Civil Construction',
    r: 'https://sam.gov/opp/f6819caa0d0f42879656f3ea88977cdf/view',
    firstSeen: '2026-08-26T00:00:00Z',
    lastSeen: RUN,
    change: 'ACTIVE',
    overrideReason: 'Latest active solicitation supersedes expired pre-solicitation record under the same solicitation number.'
  }
];

const payload = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
if (!Array.isArray(payload.records)) throw new Error('priority-current.json has no records array');

const now = new Date();
for (const o of overrides) {
  payload.records = payload.records.filter(r => {
    if (r?.source !== 'FED') return true;
    if (r?.federalMetaOpportunityId && r.federalMetaOpportunityId === o.federalMetaOpportunityId) return false;
    if (String(r?.s || '').toUpperCase() === o.s.toUpperCase()) return false;
    return r?.id !== o.id;
  });
  if (new Date(o.d) > now) payload.records.push(o);
}

payload.records.sort((a, b) => new Date(a.d || 0) - new Date(b.d || 0));
payload.generatedAt = RUN;
await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2) + '\n');
await fs.writeFile(jsPath, `window.MC3_DIRECT=${JSON.stringify(payload.records)};\n`);
console.log(`Applied ${overrides.length} active federal version override(s).`);
