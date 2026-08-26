import fs from 'node:fs';
import path from 'node:path';
import zipcodes from 'zipcodes';

const DATA_DIR = path.resolve('data');
const FED_JSON = path.join(DATA_DIR, 'federal-current.json');
const FED_JS = path.join(DATA_DIR, 'federal-current.js');

const EAST_STATES = new Set(['ME','NH','VT','MA','RI','CT','NY','NJ','PA','DE','MD','DC','VA','WV','NC','SC','GA','FL','OH','MI','IN','KY','TN','AL','MS','WI','IL']);

function load(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function hasCoord(v) {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

function stateFromLocation(loc='') {
  const matches = String(loc).toUpperCase().match(/\b([A-Z]{2})\b/g) || [];
  return matches.find(s => EAST_STATES.has(s)) || null;
}

function zipFromLocation(loc='') {
  const m = String(loc).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

function cityFromLocation(loc='') {
  const first = String(loc).split(',')[0]?.trim();
  if (!first || /^\d+$/.test(first) || first === '0' || EAST_STATES.has(first.toUpperCase())) return null;
  return first;
}

function lookupLocation(loc='') {
  const state = stateFromLocation(loc);
  const zip = zipFromLocation(loc);
  if (zip) {
    const z = zipcodes.lookup(zip);
    if (z && (!state || z.state === state)) return {lat:z.latitude, lng:z.longitude, method:'zip'};
  }
  const city = cityFromLocation(loc);
  if (city && state && typeof zipcodes.lookupByName === 'function') {
    const hits = zipcodes.lookupByName(city, state) || [];
    if (hits.length) {
      const lat = hits.reduce((n,z)=>n+Number(z.latitude||0),0)/hits.length;
      const lng = hits.reduce((n,z)=>n+Number(z.longitude||0),0)/hits.length;
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return {lat,lng,method:'city'};
    }
  }
  return null;
}

function hash(s='') {
  let h = 2166136261;
  for (let i=0;i<s.length;i++) { h ^= s.charCodeAt(i); h = Math.imul(h,16777619); }
  return h >>> 0;
}

function tinySpread(lat,lng,key) {
  const h = hash(key);
  const angle = (h % 360) * Math.PI / 180;
  const ring = 1 + ((h >>> 9) % 5);
  const radius = 0.006 * ring;
  return [lat + Math.sin(angle)*radius, lng + Math.cos(angle)*radius];
}

const payload = load(FED_JSON);
const records = Array.isArray(payload.records) ? payload.records : [];
let already = 0, zipCount = 0, cityCount = 0, unresolved = 0;

for (const r of records) {
  if (hasCoord(r[9]) && hasCoord(r[10])) {
    already++;
    continue;
  }
  const hit = lookupLocation(r[8]);
  if (!hit) {
    r[9] = null;
    r[10] = null;
    unresolved++;
    continue;
  }
  const [lat,lng] = tinySpread(Number(hit.lat), Number(hit.lng), `${r[0]}|${r[1]}|${r[2]}`);
  r[9] = Number(lat.toFixed(6));
  r[10] = Number(lng.toFixed(6));
  r[13] = 1;
  if (hit.method === 'zip') zipCount++; else cityCount++;
}

payload.geocoding = {
  method: 'offline ZIP/city centroid lookup',
  alreadyLocated: already,
  zipLocated: zipCount,
  cityLocated: cityCount,
  unresolved,
  locatedTotal: already + zipCount + cityCount,
  total: records.length,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(FED_JSON, JSON.stringify(payload,null,2)+'\n');
fs.writeFileSync(FED_JS, 'window.MC3_FED_RAW='+JSON.stringify(records)+';\n');
console.log(JSON.stringify(payload.geocoding,null,2));