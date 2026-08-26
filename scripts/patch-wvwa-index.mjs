import fs from 'node:fs';
const file='index.html';
let h=fs.readFileSync(file,'utf8');

const utilityText='Western Virginia Water Authority, Washington County Service Authority, Bristol Virginia Utilities Authority, Bedford Regional Water Authority, Henry County Public Service Authority, Montgomery County Public Service Authority and Southwest Virginia public service authorities';

h=h.replace(
  /Virginia eVA, (?:Western Virginia Water Authority, )?NCDOT/,
  `Virginia eVA, ${utilityText}, NCDOT`
);
h=h.replace(
  /Priority state records are sourced from public VDOT CABB, Virginia eVA, (?:Western Virginia Water Authority, )?NCDOT/,
  `Priority state records are sourced from public VDOT CABB, Virginia eVA, ${utilityText}, NCDOT`
);

h=h.replace(
  /var SOURCE_LABEL=\{[^;]+\};/,
  "var SOURCE_LABEL={FED:'Federal / SAM.gov',VDOT:'VDOT CABB',EVA:'Virginia eVA',WVWA:'Western Virginia Water Authority',WCSA:'Washington County Service Authority',BVUA:'Bristol Virginia Utilities Authority',BRWA:'Bedford Regional Water Authority',HCPSA:'Henry County Public Service Authority',MCPSA:'Montgomery County Public Service Authority',WISEPSA:'Wise County Public Service Authority',BUCHANANPSA:'Buchanan County Public Service Authority',SCOTTPSA:'Scott County Public Service Authority',RUSSELLPSA:'Russell County Public Service Authority',TAZPSA:'Tazewell County Public Service Authority',NCDOT:'NCDOT',NCEVP:'NC eVP',TNEDISON:'TN Edison',TNSTREAM:'TN STREAM',TNDOT:'TN TDOT'};"
);
h=h.replace(
  /var sourceOrder=\[[^\]]+\];/,
  "var sourceOrder=['FED','VDOT','EVA','WVWA','WCSA','BVUA','BRWA','HCPSA','MCPSA','WISEPSA','BUCHANANPSA','SCOTTPSA','RUSSELLPSA','TAZPSA','NCDOT','NCEVP','TNEDISON','TNSTREAM','TNDOT'];"
);

fs.writeFileSync(file,h);
console.log('Virginia water and sewer authority source labels and filters added to index.html');
