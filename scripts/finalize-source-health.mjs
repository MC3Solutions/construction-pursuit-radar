import fs from 'node:fs';

const healthPath='data/source-health.json';
const healthJsPath='data/source-health.js';
const federalPath='data/federal-current.json';

function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}

const health=read(healthPath,{generatedAt:new Date().toISOString(),total:0,sources:{}});
const fed=read(federalPath,null);
health.sources ||= {};

if(fed && Array.isArray(fed.records)){
  const generated=new Date(fed.generatedAt||0);
  const ageHours=(Date.now()-generated.getTime())/3600000;
  const fresh=Number.isFinite(ageHours)&&ageHours<=26;
  const geo=fed.geocoding||{};
  const geoLocated=(Number(geo.alreadyLocated)||0)+(Number(geo.zipLocated)||0)+(Number(geo.cityLocated)||0);
  const geoNote=geoLocated?` ${geoLocated}/${fed.records.length} federal pins have ZIP/city or source coordinates.`:'';
  health.sources.FED={
    label:'Federal / SAM.gov',
    status:fresh?'OK':'PARTIAL',
    count:fed.records.length,
    checkedAt:fed.generatedAt||new Date().toISOString(),
    message:fresh
      ?`Live SAM.gov Opportunities API snapshot: ${fed.records.length} active deduplicated construction pursuits.${geoNote}`
      :`Federal snapshot is ${Math.round(ageHours)} hours old. Last-good SAM.gov data preserved.${geoNote}`,
    stale:!fresh
  };
}else{
  health.sources.FED={
    label:'Federal / SAM.gov',status:'ERROR',count:0,checkedAt:new Date().toISOString(),
    message:'No usable federal-current dataset is available.',stale:true
  };
}

health.generatedAt=new Date().toISOString();
health.total=Object.values(health.sources).reduce((n,s)=>n+(Number(s.count)||0),0);
fs.writeFileSync(healthPath,JSON.stringify(health,null,2)+'\n');
fs.writeFileSync(healthJsPath,'window.MC3_HEALTH='+JSON.stringify(health)+';\n');
console.log(JSON.stringify(health.sources.FED,null,2));
