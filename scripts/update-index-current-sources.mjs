import fs from 'node:fs';

const file='index.html';
let html=fs.readFileSync(file,'utf8');
const cacheToken=new Date().toISOString().replace(/\D/g,'').slice(0,12);

html=html.replace(
  /<div class="notice"><b>[^<]*sources:<\/b>[\s\S]*?<\/div>\n<div id="sourceHealth">/,
  '<div class="notice"><b>Live procurement sources:</b> Federal construction opportunities refresh directly from the SAM.gov Opportunities API. VDOT CABB, Virginia eVA, NCDOT, NC eVP, Tennessee Edison, Tennessee STREAM and Tennessee TDOT refresh from their public procurement sites. Expired opportunities are removed automatically and failed sources preserve their last-good snapshot.</div>\n<div id="sourceHealth">'
);

html=html.replace(
  /<footer>[\s\S]*?<\/footer>/,
  '<footer>Federal records are sourced directly from the SAM.gov Opportunities API. Priority state records are sourced from public VDOT CABB, Virginia eVA, NCDOT, NC eVP, TN Edison, TN STREAM and TN TDOT procurement pages. Map coordinates may be approximate. Always verify solicitation documents and deadlines at the linked procurement source before pursuit decisions.</footer>'
);

html=html.replace(/data\/federal-current\.js\?v=[^"']+/,'data/federal-current.js?v='+cacheToken);
html=html.replace(/data\/priority-current\.js\?v=[^"']+/,'data/priority-current.js?v='+cacheToken);
html=html.replace("var SNAP='2026-08-25';","var SNAP=new Date().toISOString().slice(0,10);");
html=html.replace(
  /function fromArr\(a\)\{return\{id:a\[0\],s:a\[1\],n:a\[2\],t:a\[3\],a:a\[4\],p:a\[5\],d:a\[6\],u:a\[7\],l:a\[8\],x:a\[9\],y:a\[10\],c:a\[11\],r:a\[12\](?:,approx:a\[13\]===1)?(?:,rom:a\[14\])?\}\}/,
  "function fromArr(a){return{id:a[0],s:a[1],n:a[2],t:a[3],a:a[4],p:a[5],d:a[6],u:a[7],l:a[8],x:a[9],y:a[10],c:a[11],r:a[12],approx:a[13]===1,rom:a[14]||''}}"
);

html=html.replace(
  /var SOURCE_LABEL=\{[^;]+\};/,
  "var SOURCE_LABEL={FED:'Federal / SAM.gov',VDOT:'VDOT CABB',EVA:'Virginia eVA',NCDOT:'NCDOT',NCEVP:'NC eVP',TNEDISON:'TN Edison',TNSTREAM:'TN STREAM',TNDOT:'TN TDOT'};"
);
html=html.replace(
  /var sourceOrder=\[[^\]]+\];/,
  "var sourceOrder=['FED','VDOT','EVA','NCDOT','NCEVP','TNEDISON','TNSTREAM','TNDOT'];"
);

// Keep only the overall visible-pursuit KPI in the header.
html=html.replace(
  /<div class="stats">[\s\S]*?<\/div><\/header>/,
  '<div class="stats"><div class="stat"><b id="visibleCount">…</b><span>Visible pursuits</span></div></div></header>'
);
html=html.replace(
  /\$\('visibleCount'\)\.textContent=currentRows\.length;\$\('due14Count'\)[\s\S]*?;var activeSources=/,
  "$('visibleCount').textContent=currentRows.length;var activeSources="
);

html=html.replace(
  'Federal pins use SAM place-of-performance ZIP/city centroids when precise coordinates are unavailable; numbered circles group overlapping pursuits until you zoom in.',
  'Federal pins use SAM place-of-performance ZIP/city centroids when precise coordinates are unavailable; individual colored dots remain visible across the map.'
);
html=html.replace(
  'Federal pins use SAM place-of-performance ZIP/city centroids when precise coordinates are unavailable; state centroids are the final fallback.',
  'Federal pins use SAM place-of-performance ZIP/city centroids when precise coordinates are unavailable; individual colored dots remain visible across the map.'
);

// Remove marker-cluster assets and styles. Corrected coordinates now provide useful individual-dot separation.
html=html.replace(/\n?<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet\.markercluster@1\.5\.3\/dist\/MarkerCluster\.css">/g,'');
html=html.replace(/\n?<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/leaflet\.markercluster@1\.5\.3\/dist\/leaflet\.markercluster\.js"><\/script>/g,'');
html=html.replace(/\.pursuit-marker\{[^}]*\}\.mc3-cluster\{[^}]*\}\n?/g,'');

const clusterInit="try{if(window.L&&!window.MC3_MAP_FAIL){map=L.map('map',{zoomControl:true}).setView([38.2,-81.5],5);var tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'});tiles.on('tileerror',function(){tileErrors++;if(tileErrors>8)useRadar()});tiles.addTo(map);layer=(L.markerClusterGroup?L.markerClusterGroup({showCoverageOnHover:false,spiderfyOnMaxZoom:true,disableClusteringAtZoom:10,maxClusterRadius:40,chunkedLoading:true,iconCreateFunction:function(cluster){return L.divIcon({html:'<div class=\"mc3-cluster\">'+cluster.getChildCount()+'</div>',className:'',iconSize:[36,36],iconAnchor:[18,18]})}}):L.layerGroup()).addTo(map)}else useRadar()}catch(e){useRadar()}";
const dotInit="try{if(window.L&&!window.MC3_MAP_FAIL){map=L.map('map',{zoomControl:true}).setView([38.2,-81.5],5);var tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'});tiles.on('tileerror',function(){tileErrors++;if(tileErrors>8)useRadar()});tiles.addTo(map);layer=L.layerGroup().addTo(map)}else useRadar()}catch(e){useRadar()}";
html=html.replace(clusterInit,dotInit);

const clusteredRender="function markerIcon(o){return L.divIcon({className:'',html:'<div class=\"pursuit-marker\" style=\"background:'+color(o)+'\"></div>',iconSize:[14,14],iconAnchor:[7,7],popupAnchor:[0,-7]})}\nfunction renderMap(rows){if(radarMode){renderRadar(rows);return}if(!map||!layer)return;layer.clearLayers();var bounds=[];rows.forEach(function(o){if(o.x==null||o.y==null)return;L.marker([o.x,o.y],{icon:markerIcon(o),riseOnHover:true}).bindPopup(popup(o)).addTo(layer);bounds.push([o.x,o.y])});if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25],maxZoom:7});else if(bounds.length===1)map.setView(bounds[0],8)}";
const dotRender="function renderMap(rows){if(radarMode){renderRadar(rows);return}if(!map||!layer)return;layer.clearLayers();var bounds=[];rows.forEach(function(o){if(o.x==null||o.y==null)return;L.circleMarker([o.x,o.y],{radius:5.5,weight:1.5,color:'#fff',fillColor:color(o),fillOpacity:.95}).bindPopup(popup(o)).addTo(layer);bounds.push([o.x,o.y])});if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25],maxZoom:7});else if(bounds.length===1)map.setView(bounds[0],8)}";
html=html.replace(clusteredRender,dotRender);

// Fan out records that share the same coordinates. Without this, refreshed pursuits from
// both SAM.gov and state/local sources can be present in the data but hidden directly under
// another dot at the same ZIP/city/state centroid.
const spreadRender="function markerHash(s){var h=2166136261,t=String(s||'');for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}\nfunction markerPoint(o,counts){var lat=Number(o.x),lng=Number(o.y),key=lat.toFixed(5)+'|'+lng.toFixed(5);if((counts[key]||0)>1){var h=markerHash([o.id,o.s,o.n,o.source].join('|')),angle=(h%360)*Math.PI/180,ring=1+((h>>>9)%5),radius=.007*ring;lat+=Math.sin(angle)*radius;lng+=Math.cos(angle)*radius}return[lat,lng]}\nfunction renderMap(rows){if(radarMode){renderRadar(rows);return}if(!map||!layer)return;layer.clearLayers();var bounds=[],counts={};rows.forEach(function(o){if(o.x==null||o.y==null)return;var lat=Number(o.x),lng=Number(o.y);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;var k=lat.toFixed(5)+'|'+lng.toFixed(5);counts[k]=(counts[k]||0)+1});rows.forEach(function(o){if(o.x==null||o.y==null)return;var lat=Number(o.x),lng=Number(o.y);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;var pt=markerPoint(o,counts);L.circleMarker(pt,{radius:5.5,weight:1.5,color:'#fff',fillColor:color(o),fillOpacity:.95}).bindPopup(popup(o)).addTo(layer);bounds.push(pt)});if(bounds.length>1)map.fitBounds(bounds,{padding:[25,25],maxZoom:7});else if(bounds.length===1)map.setView(bounds[0],8)}";
html=html.replace(dotRender,spreadRender);

// Display ROM / estimated construction value only when the source actually provides one.
html=html.replace(/function popup\(o\)\{return[\s\S]*?\}\nfunction useRadar/, "function popup(o){return'<b>'+esc(o.n)+'</b><br>'+esc(o.sourceLabel)+' · '+esc(o.l)+'<br>'+esc(o.set)+(o.rom?'<br><b>ROM:</b> '+esc(o.rom):'')+'<br>Due '+esc(fmtDate(o.d))+'<br><a href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a>'}\nfunction useRadar");
html=html.replace(/function card\(o\)\{[\s\S]*?\}\nfunction filtered/, "function card(o){var scopePrefix=/^\\d{6}$/.test(String(o.c||''))?'<b>NAICS:</b> ':'<b>Scope:</b> ',romLine=o.rom?'<br><b>ROM:</b> '+esc(o.rom):'';return'<article class=\"card\"><div class=\"project-name\">'+esc(o.n)+'</div><div class=\"badges\">'+badges(o)+'</div><div class=\"meta\">'+esc(o.l)+(o.approx?' <em>(map pin approximate)</em>':'')+'<br>'+scopePrefix+esc(o.c||'')+(o.scope&&o.scope!==o.c?' · '+esc(o.scope):'')+romLine+'<br><b>Due:</b> '+esc(fmtDate(o.d))+' · <b>Solicitation:</b> '+esc(o.s)+'<br><b>Posted:</b> '+esc(String(o.p||'').slice(0,10))+'</div><a class=\"open\" href=\"'+esc(o.r)+'\" target=\"_blank\" rel=\"noopener\">Open source ↗</a></article>'}\nfunction filtered");

fs.writeFileSync(file,html);
console.log('index.html now uses current data files, current source labels, one Visible Pursuits KPI, individual pursuit dots with deterministic overlap spreading, and conditional ROM display.');