const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>`${Number(n||0)<0?'-':''}$${(Math.abs(Number(n||0))/1e6).toFixed(1)}M`;
let extraState=null;

function normalizePos(p){p=String(p||'').toUpperCase();return p==='ED'?'EDGE':p}
function projection(player){
  const age=Number(player.age||0);
  const pos=normalizePos(player.position);
  const aav=Number(player.marketValueAAV||player.apy||player.previousApy||0);
  const years=age&&age<=25?4:age&&age<=28?3:age&&age<=31?2:1;
  const premium=['QB','EDGE','WR','CB','LT','RT','OT'].includes(pos);
  const guaranteeRate=premium?.58:.48;
  return {years,aav,total:aav*years,guaranteed:aav*years*guaranteeRate};
}
function impactScore(item){
  const text=`${item.type||''} ${item.headline||''} ${item.description||''}`.toLowerCase();
  let score=0;
  if(/trade|traded|acquire/.test(text))score+=45;
  if(/extension|extended|re-sign|re-signed/.test(text))score+=38;
  if(/signing|signed/.test(text))score+=28;
  if(/release|released|cut|waived/.test(text))score+=22;
  if(/retire|retired/.test(text))score+=20;
  if(/quarterback|\bqb\b/.test(text))score+=12;
  if(/first-round|pro bowl|all-pro|star|starter/.test(text))score+=14;
  const players=(extraState?.players||[]).filter(p=>p.status!=='removed').sort((a,b)=>Number(b.capHit2026||0)-Number(a.capHit2026||0)).slice(0,140);
  const hit=players.find(p=>text.includes(String(p.name||'').toLowerCase()));
  if(hit)score+=Math.min(35,Number(hit.capHit2026||0)/1500000);
  const ageHours=(Date.now()-new Date(item.timestamp||0).getTime())/36e5;
  if(Number.isFinite(ageHours))score+=Math.max(0,18-ageHours/24);
  return score;
}
function newsRows(rows){return rows.map(x=>`<div class="feed-item"><div class="type">${x.type||'NEWS'}</div><div class="feed-copy"><strong>${x.headline||x.player||'NFL news'}</strong><div class="meta">${[x.team,x.position,x.source].filter(Boolean).join(' · ')}</div>${x.description?`<div class="meta move-desc">${x.description}</div>`:''}</div><div class="feed-side"><span class="meta">${x.timestamp?new Date(x.timestamp).toLocaleDateString():''}</span>${x.url?`<a class="news-link" href="${x.url}" target="_blank" rel="noreferrer">Source ↗</a>`:''}</div></div>`).join('')||'<div class="empty">No major NFL news found yet.</div>'}
function majorNews(){return [...(extraState?.transactions||[]),...(extraState?.news||[])].map(x=>({...x,_impact:impactScore(x)})).sort((a,b)=>b._impact-a._impact||new Date(b.timestamp)-new Date(a.timestamp))}
function refreshNews(){
  const dash=$('#recentTransactions'); if(dash){const h=dash.closest('.panel')?.querySelector('h3');if(h)h.textContent='Biggest NFL news';dash.innerHTML=newsRows(majorNews().slice(0,8));}
  const feed=$('#transactionFeed');if(feed&&$('#transactions')?.classList.contains('active')){const h=$('#transactions h3');if(h)h.textContent='Biggest NFL News & Moves';feed.innerHTML=newsRows(majorNews().slice(0,100));}
}
function negotiations(){
  const news=[...(extraState?.news||[]),...(extraState?.transactions||[])];
  const talk=/\b(contract talks?|negotiat(?:e|es|ed|ing|ions?)|extension talks?|working on (?:an? )?extension|discuss(?:ed|ing)? (?:an? )?extension|trying to (?:re-?sign|extend)|seeking (?:an? )?extension|in talks|talking (?:with|about))\b/i;
  const done=/\b(agreed to|has signed|signed a|re-signed|has extended|extension is official|finalized)\b/i;
  const players=(extraState?.players||[]).filter(p=>p.status!=='removed');
  const out=[];
  for(const n of news){const txt=`${n.headline||''} ${n.description||''}`;if(!talk.test(txt)||done.test(txt))continue;const p=players.find(x=>txt.toLowerCase().includes(String(x.name||'').toLowerCase()));if(!p)continue;const key=`${p.team}:${p.name}`;if(out.some(x=>x.key===key))continue;out.push({key,p,n,proj:projection(p)});}
  return out.sort((a,b)=>impactScore(b.n)-impactScore(a.n));
}
function renderNegotiations(){const body=$('#negotiationsTable');if(!body)return;const rows=negotiations();body.innerHTML=rows.map(({p,n,proj})=>`<tr><td><strong>${p.name}</strong></td><td>${p.team||n.team||'—'}</td><td>${normalizePos(p.position)||'—'}</td><td>${money(p.apy||0)}</td><td><strong>${proj.years} yr / ${money(proj.total)}</strong><div class="muted">${money(proj.aav)} APY · ~${money(proj.guaranteed)} guaranteed</div></td><td><span class="status pending">MODEL</span></td><td>${n.url?`<a class="news-link" href="${n.url}" target="_blank" rel="noreferrer">${n.source||'Source'} ↗</a>`:(n.source||'—')}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">No currently sourced active contract negotiations found. This tab only shows talks supported by a current news source.</div></td></tr>'}
function renderFreeAgents(){const body=$('#freeAgentsTable');if(!body)return;const q=($('#faSearch')?.value||'').toLowerCase();let rows=[...(extraState?.freeAgents||[])].filter(p=>!q||`${p.name} ${p.position} ${p.previousTeam} ${p.type}`.toLowerCase().includes(q));rows.sort((a,b)=>Number(b.marketValueAAV||b.previousApy||0)-Number(a.marketValueAAV||a.previousApy||0));body.innerHTML=rows.slice(0,300).map(p=>{const proj=projection(p);return`<tr><td><strong>${p.name}</strong></td><td>${normalizePos(p.position)}</td><td>${p.age??'—'}</td><td>${p.previousTeam||'—'}</td><td>${p.type||'UFA'}</td><td>${money(p.previousApy)}</td><td>${p.marketValueAAV?money(p.marketValueAAV):'—'}</td><td><strong>${proj.aav?`${proj.years} yr / ${money(proj.total)}`:'Insufficient data'}</strong>${proj.aav?`<div class="muted">${money(proj.aav)} APY · ~${money(proj.guaranteed)} guaranteed</div>`:''}</td><td><span class="status pending">MODEL</span></td></tr>`}).join('')||'<tr><td colspan="9"><div class="empty">No free-agent data loaded yet. Run Update entire league once after this deployment.</div></td></tr>'}
function injectUI(){
  const nav=$('aside nav');if(nav&&!$('[data-view="negotiations"]')){
    const exp=$('[data-view="expirations"]');
    exp?.insertAdjacentHTML('afterend','<button class="nav" data-view="freeagents">Free Agents</button><button class="nav" data-view="negotiations">Negotiations</button>');
    const tx=$('[data-view="transactions"]');if(tx)tx.textContent='NFL News';
  }
  const main=$('main');if(main&&!$('#freeagents'))main.insertAdjacentHTML('beforeend',`
<section id="freeagents" class="view"><article class="panel full"><div class="panel-head"><div><div class="eyebrow">OPEN MARKET</div><h3>Available Free Agents</h3></div><input id="faSearch" placeholder="Search free agents…"></div><p class="muted helper">Market value comes from Spotrac when available. Projected contracts are model estimates, not reported offers.</p><div class="table-wrap"><table><thead><tr><th>Player</th><th>Pos</th><th>Age</th><th>Prev Team</th><th>Type</th><th>Prev APY</th><th>Market APY</th><th>Projected Contract</th><th>Data</th></tr></thead><tbody id="freeAgentsTable"></tbody></table></div></article></section>
<section id="negotiations" class="view"><article class="panel full"><div class="panel-head"><div><div class="eyebrow">CONTRACT WATCH</div><h3>Active Negotiations</h3></div></div><p class="muted helper">Only sourced reports of ongoing talks appear here. The projected deal is our model, not a reported offer.</p><div class="table-wrap"><table><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th>Current APY</th><th>Projected Contract</th><th>Projection</th><th>Negotiation Source</th></tr></thead><tbody id="negotiationsTable"></tbody></table></div></article></section>`);
  if(!$('#enhancementStyles'))document.head.insertAdjacentHTML('beforeend','<style id="enhancementStyles">#freeagents .helper,#negotiations .helper{margin:0 0 16px}.status.pending{white-space:nowrap}#freeAgentsTable .muted,#negotiationsTable .muted{font-size:11px;margin-top:3px}</style>');
  $$('aside .nav').forEach(b=>{if(b.dataset.extraBound)return;b.dataset.extraBound='1';b.addEventListener('click',()=>{if(!['freeagents','negotiations'].includes(b.dataset.view))return;$$('.view').forEach(v=>v.classList.toggle('active',v.id===b.dataset.view));$$('aside .nav').forEach(n=>n.classList.toggle('active',n===b));$('#pageTitle').textContent=b.dataset.view==='freeagents'?'Free Agents':'Active Negotiations';b.dataset.view==='freeagents'?renderFreeAgents():renderNegotiations();});});
  $('#faSearch')?.addEventListener('input',renderFreeAgents);
}
async function reload(){try{extraState=await fetch('/api/state').then(r=>r.json());injectUI();renderFreeAgents();renderNegotiations();refreshNews()}catch(e){console.error('Enhancements failed',e)}}
window.addEventListener('load',()=>setTimeout(reload,300));
document.addEventListener('change',e=>{if(e.target?.id==='teamSelect')setTimeout(refreshNews,250)});
document.addEventListener('click',e=>{if(e.target?.closest('#syncBtn'))setTimeout(reload,3000);if(e.target?.closest('[data-view="transactions"]'))setTimeout(refreshNews,100)});
setInterval(()=>{if(extraState)refreshNews()},8000);
