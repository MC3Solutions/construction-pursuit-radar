(function(){
  var host=document.getElementById('sourceHealth');
  var h=window.MC3_HEALTH;
  if(!host||!h)return;
  var style=document.createElement('style');
  style.textContent='.sourceHealthBar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #dce3ec;font:11px system-ui,sans-serif;color:#526075}.sourceHealthTitle{font-weight:800;color:#344056;margin-right:2px}.sourcePill{display:inline-flex;gap:5px;align-items:center;border:1px solid #d7dee8;border-radius:999px;padding:4px 8px;background:#f8fafc}.sourcePill b{color:#172033}.healthDot{width:7px;height:7px;border-radius:50%;display:inline-block}.healthOK{background:#059669}.healthPARTIAL{background:#d97706}.healthBLOCKED,.healthERROR{background:#dc2626}.healthStale{opacity:.72}.healthStamp{margin-left:auto;color:#7a8496}@media(max-width:800px){.healthStamp{width:100%;margin-left:0}}';
  document.head.appendChild(style);
  var order=['EVA','NCEVP','TNEDISON','TNSTREAM','TNDOT'];
  var html='<div class="sourceHealthBar"><span class="sourceHealthTitle">Source health</span>';
  order.forEach(function(k){var s=h.sources&&h.sources[k];if(!s)return;var cls='health'+s.status;html+='<span class="sourcePill '+(s.stale?'healthStale':'')+'" title="'+escapeHtml(s.message||'')+'"><span class="healthDot '+cls+'"></span><span>'+escapeHtml(s.label)+'</span><b>'+Number(s.count||0)+'</b><span>'+escapeHtml(s.status)+'</span></span>'});
  html+='<span class="healthStamp">Checked '+new Date(h.generatedAt).toLocaleString()+'</span></div>';
  host.innerHTML=html;
  function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
})();
