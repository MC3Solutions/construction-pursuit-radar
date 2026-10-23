import fs from 'node:fs';
import path from 'node:path';

const API_URL = 'https://api.sam.gov/opportunities/v2/search';
const API_KEY = process.env.SAM_GOV_API_KEY;
const DATA_DIR = path.resolve('data');
const JSON_PATH = path.join(DATA_DIR, 'federal-current.json');
const JS_PATH = path.join(DATA_DIR, 'federal-current.js');
const HEALTH_JSON = path.join(DATA_DIR, 'source-health.json');
const HEALTH_JS = path.join(DATA_DIR, 'source-health.js');
const LEGACY = ['federal-1-20260825.js','federal-2-20260825.js','federal-3-20260825.js'].map(f=>path.join(DATA_DIR,f));

const EAST_STATES = new Set(["AL","AZ","AR","CA","CO","CT","DE","FL","GA","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);
const STATE_NAMES = {"Alabama":"AL","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC"};
const CONSTRUCTION_NAICS = ['236115','236116','236117','236118','236210','236220','237110','237120','237130','237310','237990','238110','238120','238130','238140','238150','238160','238170','238190','238210','238220','238290','238310','238320','238330','238340','238350','238390','238910','238990'];
const ALLOWED_TYPES = new Set(['o','p','k','r','Solicitation','Pre-Solicitation','Presolicitation','Combined Synopsis/Solicitation','Sources Sought']);
const TYPE_NAMES = {o:'Solicitation',p:'Pre-Solicitation',k:'Combined Synopsis/Solicitation',r:'Sources Sought',Solicitation:'Solicitation','Pre-Solicitation':'Pre-Solicitation',Presolicitation:'Pre-Solicitation','Combined Synopsis/Solicitation':'Combined Synopsis/Solicitation','Sources Sought':'Sources Sought'};

function mmddyyyy(d){const mm=String(d.getUTCMonth()+1).padStart(2,'0'),dd=String(d.getUTCDate()).padStart(2,'0');return `${mm}/${dd}/${d.getUTCFullYear()}`}
function addDays(d,n){const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function canonicalSol(s){return String(s||'').trim().toUpperCase().replace(/(?:[-_](?:A)?0{2,}\d{1,3})$/i,'').replace(/(?:[-_]AMEND(?:MENT)?[-_]?\d+)$/i,'')}
function cleanTitle(s){return norm(String(s||'').replace(/\(?\s*amend(?:ment)?\s*#?\s*\d+\s*\)?/ig,' ').replace(/\bmodification\s*#?\s*\d+\b/ig,' '))}
function responseDeadline(o){return o.responseDeadLine||o.responseDeadline||o.reponseDeadLine||o.responseDate||null}
function stateCode(pop={}){const raw=pop?.state?.code||pop?.state?.name||pop?.stateCode||pop?.state||'';const up=String(raw).trim().toUpperCase();if(EAST_STATES.has(up))return up;return STATE_NAMES[String(raw).trim()]||null}
function locationText(pop={},state){const city=pop?.city?.name||pop?.city||'',zip=pop?.zip||pop?.zipCode||'',st=pop?.state?.code||pop?.state?.name||pop?.state||state||'';return [city,st,zip].filter(Boolean).join(', ').replace(/,\s*,/g,',')}
function safeDate(s){if(!s)return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d}
function isoish(s){const d=safeDate(s);return d?d.toISOString():(s||null)}
function loadJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function formatMoney(v){if(v==null||v==='')return'';if(typeof v==='number'&&Number.isFinite(v))return '$'+Math.round(v).toLocaleString('en-US');const s=String(v).trim();if(!s)return'';return /^\$/.test(s)||/[a-z]/i.test(s)?s:'$'+s}
function extractRom(o){const direct=o.estimatedPriceRange??o.estimatedValue??o.estimatedAmount??o.constructionMagnitude??o.magnitude??o.estimatedCost??o.projectEstimate;if(direct&&typeof direct==='object'){const lo=direct.min??direct.minimum??direct.low,hi=direct.max??direct.maximum??direct.high;if(lo!=null&&hi!=null)return `${formatMoney(lo)} – ${formatMoney(hi)}`;if(direct.value!=null)return formatMoney(direct.value)}return formatMoney(direct)}
function writeLegacy(arrays){const size=Math.ceil(arrays.length/3)||1;LEGACY.forEach((file,i)=>{const shard=arrays.slice(i*size,(i+1)*size);const code=i===0?`window.MC3_FED_RAW=${JSON.stringify(shard)};\n`:`window.MC3_FED_RAW=(window.MC3_FED_RAW||[]).concat(${JSON.stringify(shard)});\n`;fs.writeFileSync(file,code)})}
function writeHealth(status,count,message,stale=false){const health=loadJson(HEALTH_JSON,{generatedAt:new Date().toISOString(),total:0,sources:{}});health.sources||={};health.sources.FED={label:'Federal / SAM.gov',status,count,checkedAt:new Date().toISOString(),message,stale};health.generatedAt=new Date().toISOString();health.total=Object.values(health.sources).reduce((n,s)=>n+(Number(s.count)||0),0);fs.writeFileSync(HEALTH_JSON,JSON.stringify(health,null,2)+'\n');fs.writeFileSync(HEALTH_JS,'window.MC3_HEALTH='+JSON.stringify(health)+';\n')}
async function getJson(url,attempts=3){let last;for(let i=1;i<=attempts;i++){try{const res=await fetch(url,{headers:{Accept:'application/json','User-Agent':'MC3-Construction-Pursuit-Radar/1.0'}});if(!res.ok){const body=(await res.text()).slice(0,500);throw new Error(`SAM HTTP ${res.status}: ${body}`)}return await res.json()}catch(e){last=e;if(i<attempts)await new Promise(r=>setTimeout(r,1500*i))}}throw last}
async function fetchNaics(naics,dates){const rows=[];let offset=0,total=Infinity;while(offset<total){const params=new URLSearchParams({api_key:API_KEY,postedFrom:dates.postedFrom,postedTo:dates.postedTo,rdlfrom:dates.rdlfrom,rdlto:dates.rdlto,limit:'1000',offset:String(offset)});const json=await getJson(`${API_URL}?${params}`);const batch=json.opportunitiesData||json.data||[];total=Number(json.totalRecords??batch.length);rows.push(...batch);if(!batch.length)break;offset+=batch.length;if(batch.length<1000)break}console.log(`[SAM] Unrestricted agency / NAICS / notice type query: ${rows.length} records`);return rows}
function transform(o){const due=safeDate(responseDeadline(o));if(!due||due<=new Date())return null;if(String(o.active||'Yes').toLowerCase()==='no')return null;const typeRaw=o.type||o.opportunityType||'';/* All notice types are collected for map-side filtering. */const pop=o.placeOfPerformance||o.data?.placeOfPerformance||{};const state=stateCode(pop);/* Keep all locations; do not discard notices solely for geographic reasons. */const noticeId=o.noticeId||o.noticeid||o.id;if(!noticeId)return null;const sol=String(o.solicitationNumber||'').trim(),title=String(o.title||'Untitled federal opportunity').trim(),naics=String(o.naicsCode||o.naics||'').trim(),setAside=o.setAside||o.typeOfSetAsideDescription||'No Set-Aside Used',posted=isoish(o.postedDate||o.publishDate),updated=isoish(o.modifiedDate||o.updatedDate||o.lastModifiedDate||o.postedDate||o.publishDate),loc=locationText(pop,state)||state,lat=Number(pop?.latitude??pop?.lat),lng=Number(pop?.longitude??pop?.lng??pop?.lon),source=`https://sam.gov/opp/${noticeId}/view`,rom=extractRom(o);return{noticeId,sol,title,type:TYPE_NAMES[typeRaw]||typeRaw||'Solicitation',setAside,posted,due:due.toISOString(),updated,loc,state,lat:Number.isFinite(lat)?lat:null,lng:Number.isFinite(lng)?lng:null,naics,source,rom,office:String(o.organizationName||o.fullParentPathName||o.department||o.subTier||o.office||o.officeName||''),key:`${canonicalSol(sol)}|${cleanTitle(title)}|${state}`}}
function prefer(a,b){const rank=x=>({Solicitation:4,'Combined Synopsis/Solicitation':4,'Pre-Solicitation':3,'Sources Sought':2}[x.type]||1);if(rank(b)!==rank(a))return rank(b)>rank(a)?b:a;const bd=safeDate(b.due)?.getTime()||0,ad=safeDate(a.due)?.getTime()||0;if(bd!==ad)return bd>ad?b:a;const bu=safeDate(b.updated)?.getTime()||0,au=safeDate(a.updated)?.getTime()||0;if(bu!==au)return bu>au?b:a;return b}

async function main(){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const previous=loadJson(JSON_PATH,{records:[]});
  if(!API_KEY){if(previous.records?.length)writeLegacy(previous.records);writeHealth('ERROR',previous.records?.length||0,'SAM_GOV_API_KEY is not available to the workflow. Preserving last good federal snapshot.',true);console.error('[SAM] Missing SAM_GOV_API_KEY; preserved last good snapshot.');return}
  const now=new Date(),dates={postedFrom:mmddyyyy(addDays(now,-364)),postedTo:mmddyyyy(now),rdlfrom:mmddyyyy(now),rdlto:mmddyyyy(addDays(now,364))};
  console.log(`[SAM] Fetching all federal opportunities: posted ${dates.postedFrom}..${dates.postedTo}, due ${dates.rdlfrom}..${dates.rdlto}`);
  try{
    const all=await fetchNaics(null,dates);
    const mapped=all.map(transform).filter(Boolean),byKey=new Map();for(const r of mapped)byKey.set(r.key,byKey.has(r.key)?prefer(byKey.get(r.key),r):r);
    const dedup=[...byKey.values()].sort((a,b)=>new Date(a.due)-new Date(b.due));
    const fresh=dedup.map(r=>[r.noticeId,r.sol,r.title,r.type,r.setAside,r.posted,r.due,r.updated,r.loc,r.lat,r.lng,r.naics,r.source,null,r.rom||'',r.office||'']);
    // Retain previously collected opportunities through their response deadline when broad SAM.gov queries omit them.
    const byNotice=new Map(previous.records.filter(a=>a&&a[0]&&safeDate(a[6])>now).map(a=>[a[0],a]));
    for(const a of fresh)byNotice.set(a[0],a);
    const arrays=[...byNotice.values()].sort((a,b)=>new Date(a[6])-new Date(b[6]));
    const retained=arrays.length-fresh.length;
    console.log(`[SAM] Continuity: ${fresh.length} fresh + ${retained} still-active previously captured notices.`);
    const payload={generatedAt:new Date().toISOString(),source:'SAM.gov Opportunities Public API v2',query:dates,total:arrays.length,records:arrays};
    fs.writeFileSync(JSON_PATH,JSON.stringify(payload,null,2)+'\n');fs.writeFileSync(JS_PATH,'window.MC3_FED_RAW='+JSON.stringify(arrays)+';\n');writeLegacy(arrays);
    writeHealth('OK',arrays.length,`Live SAM.gov API: ${all.length} raw federal notices reduced to ${arrays.length} active deduplicated pursuits.`,false);
    console.log(`[SAM] SUCCESS: ${all.length} raw -> ${mapped.length} in-scope future -> ${arrays.length} deduplicated active pursuits.`);
  }catch(e){const count=previous.records?.length||0;if(previous.records?.length)writeLegacy(previous.records);writeHealth('ERROR',count,`SAM.gov API refresh failed: ${e.message}. Preserving last good federal snapshot.`,true);console.error('[SAM] Refresh failed; preserving last good snapshot:',e)}
}
await main();
