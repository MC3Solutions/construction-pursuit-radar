import fs from 'node:fs';
const file='index.html';
let h=fs.readFileSync(file,'utf8');
h=h.replace('Virginia eVA, NCDOT','Virginia eVA, Western Virginia Water Authority, NCDOT');
h=h.replace('Virginia eVA, NCDOT, NC eVP','Virginia eVA, Western Virginia Water Authority, NCDOT, NC eVP');
h=h.replace("EVA:'Virginia eVA',NCDOT:","EVA:'Virginia eVA',WVWA:'Western Virginia Water Authority',NCDOT:");
h=h.replace("['FED','VDOT','EVA','NCDOT'","['FED','VDOT','EVA','WVWA','NCDOT'");
fs.writeFileSync(file,h);
console.log('WVWA source label and filter added to index.html');
