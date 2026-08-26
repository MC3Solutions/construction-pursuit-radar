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
  "function fromArr(a){return{id:a[0],s:a[1],n:a[2],t:a[3],a:a[4],p:a[5],d:a[6],u:a[7],l:a[8],x:a[9],y:a[10],c:a[11],r:a[12]}}",
  "function fromArr(a){return{id:a[0],s:a[1],n:a[2],t:a[3],a:a[4],p:a[5],d:a[6],u:a[7],l:a[8],x:a[9],y:a[10],c:a[11],r:a[12],approx:a[13]===1}}"
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

fs.writeFileSync(file,html);
console.log('index.html now uses current data files, VDOT/NCDOT source labels, one Visible Pursuits KPI, fresh cache tokens, and individual colored pursuit dots.');