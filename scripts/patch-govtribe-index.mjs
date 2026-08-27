import fs from 'node:fs';

const file='index.html';
let h=fs.readFileSync(file,'utf8');

h=h.replace(
  /<div class="notice"><b>Live procurement sources:<\/b>[\s\S]*?<\/div>\n<div id="sourceHealth">/,
  '<div class="notice"><b>Live procurement sources:</b> Federal construction opportunities refresh directly from the SAM.gov Opportunities API. GovTribe is used as a supplemental discovery and enrichment layer: matched federal notices remain SAM.gov records, while verified net-new state/local construction pursuits may appear as GovTribe Supplemental. VDOT CABB, Virginia eVA, Virginia utility authorities, NCDOT, NC eVP, Tennessee Edison, Tennessee STREAM and Tennessee TDOT refresh from their public procurement sources. Expired opportunities are removed automatically and failed sources preserve their last-good snapshot.</div>\n<div id="sourceHealth">'
);

h=h.replace(
  /<footer>[\s\S]*?<\/footer>/,
  '<footer>Federal records are sourced directly from the SAM.gov Opportunities API, with GovTribe used only for supplemental discovery and explicit published estimate/magnitude enrichment. Net-new GovTribe state/local records link to their public procurement source when available. Priority state records also refresh from VDOT CABB, Virginia eVA and utility authorities, NCDOT, NC eVP, TN Edison, TN STREAM and TN TDOT. Map coordinates may be approximate. Always verify solicitation documents and deadlines at the linked procurement source before pursuit decisions.</footer>'
);

h=h.replace(/var SOURCE_LABEL=\{([^}]*)\};/,function(_,body){
  if(body.includes("GOVTRIBE:"))return `var SOURCE_LABEL={${body}};`;
  return `var SOURCE_LABEL={${body},GOVTRIBE:'GovTribe Supplemental'};`;
});

h=h.replace(/var sourceOrder=\[([^\]]*)\];/,function(_,body){
  if(body.includes("'GOVTRIBE'"))return `var sourceOrder=[${body}];`;
  const parts=body.split(',');
  const fed=parts.shift();
  return `var sourceOrder=[${fed},'GOVTRIBE',${parts.join(',')}];`;
});

fs.writeFileSync(file,h);
console.log('GovTribe Supplemental is visible in dashboard source labels, filters and provenance notes.');
