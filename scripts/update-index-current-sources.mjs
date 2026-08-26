import fs from 'node:fs';

const file='index.html';
let html=fs.readFileSync(file,'utf8');

html=html.replace(
  /<div class="notice"><b>Priority sources:<\/b>[\s\S]*?<\/div>\n<div id="sourceHealth">/,
  '<div class="notice"><b>Live procurement sources:</b> Federal construction opportunities refresh directly from the SAM.gov Opportunities API. Virginia eVA, NC eVP, Tennessee Edison, Tennessee STREAM and Tennessee TDOT refresh from their public procurement sites. Expired opportunities are removed automatically and failed sources preserve their last-good snapshot.</div>\n<div id="sourceHealth">'
);

html=html.replace(
  /<footer>[\s\S]*?<\/footer>\n<script src="data\/federal-1-20260825\.js\?v=2"><\/script>\n<script src="data\/federal-2-20260825\.js\?v=2"><\/script>\n<script src="data\/federal-3-20260825\.js\?v=2"><\/script>/,
  '<footer>Federal records are sourced directly from the SAM.gov Opportunities API. Priority state records are sourced from public Virginia eVA, NC eVP, TN Edison, TN STREAM and TN TDOT procurement pages. Map coordinates may be approximate. Always verify solicitation documents and deadlines at the linked procurement source before pursuit decisions.</footer>\n<script src="data/federal-current.js?v=live"></script>'
);

html=html.replace("var SNAP='2026-08-25';","var SNAP=new Date().toISOString().slice(0,10);");

fs.writeFileSync(file,html);
console.log('index.html now loads federal-current.js and uses current-day NEW/CHANGED logic.');
