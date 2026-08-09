import './redesign.js';
if(!document.querySelector('link[href="/redesign.css"]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/redesign.css';document.head.appendChild(l)}
const $=s=>document.querySelector(s);
const money=n=>`${Number(n||0)<0?'-':''}$${(Math.abs(Number(n||0))/1e6).toFixed(1)}M`;
let busy=false,lastKey='';
function sourceRow(name,desc,on,attr=''){return `<div class="source-row" ${attr}><div><strong>${name}</strong><span>${desc}</span></div><span class="source-state ${on?'on':'off'}">${on?'FOUND':'NOT FOUND'}</span></div>`}
function render(p){
 if(!p||!$('#player')?.classList.contains('active'))return;
 $('#playerTotalValue').textContent=money(p.totalValue);
 $('#playerApy').textContent=money(p.apy);
 $('#playerGuaranteed').textContent=money(p.totalGuaranteed||p.guaranteed2026);
 $('#playerSigningBonus').textContent=money(p.signingBonus||p.signingBonusTotal);
 const end=Number(p.contractEnd||p.expirationYear||0)||null;
 const fa=p.freeAgentStatus?(p.freeAgentYear?`${p.freeAgentYear} / ${String(p.freeAgentStatus).toUpperCase()}`:String(p.freeAgentStatus).toUpperCase()):'UNKNOWN';
 const terms=[
  ['Signed',p.signedYear||'Unknown'],
  ['Contract type',p.contractType||'Unknown'],
  ['Contract length',p.contractYears?`${p.contractYears} years`:'Unknown'],
  ['Years remaining',p.yearsLeft??'Unknown'],
  ['Contract expires',end||'Unknown'],
  ['Free agency',fa],
  ['2026 cap hit',money(p.capHit2026)],
  ['2026 base salary',money(p.baseSalary2026)],
  ['2026 guaranteed salary',money(p.guaranteed2026)],
  ['2026 bonus proration',money(p.bonusProration2026)],
  ['2026 roster/other bonus',money(p.rosterOtherBonus2026)],
  ['Dead cap if cut',money(p.deadCapCut2026)],
  ['Cut savings',money(p.cutSavings2026)],
  ['Signing bonus',money(p.signingBonus||p.signingBonusTotal)],
  ['Guaranteed at signing',money(p.guaranteedAtSigning)],
  ['Total guaranteed',money(p.totalGuaranteed)],
  ['Avg. guarantee / year',money(p.avgGuaranteePerYear)],
  ['Contract guaranteed',Number.isFinite(Number(p.guaranteePercent))?`${Number(p.guaranteePercent).toFixed(1)}%`:'Unknown']
 ];
 const list=$('#playerTerms');if(list)list.innerHTML=terms.map(([k,v])=>`<div><span>${k}</span><strong>${v}</strong></div>`).join('');
 const espnFound=Boolean(p.sourceChecks?.ESPN||p.espnId||/ESPN/i.test(String(p.source||'')));
 const sources=$('#playerSources');if(sources)sources.innerHTML=[
  sourceRow('ESPN','Roster',espnFound),
  sourceRow('StickToTheModel','2026 cap hit / base / dead cap / cut savings',Boolean(p.sourceChecks?.STM)),
  sourceRow('Spotrac','Contract value / APY / guarantees / expiration',Boolean(p.sourceChecks?.Spotrac)),
  sourceRow('PFN','Cap cross-check',Boolean(p.sourceChecks?.PFN)),
  sourceRow('Over The Cap','Contract structure / yearly salaries / bonuses / guarantees',Boolean(p.sourceChecks?.OTC),'data-otc-source="1"')
 ].join('');
 const yearly=Array.isArray(p.yearly)?p.yearly.filter(y=>Number(y.year)>=2026).sort((a,b)=>a.year-b.year):[];
 const body=$('#yearlyTable');
 if(body&&yearly.length)body.innerHTML=yearly.map(y=>`<tr><td>${y.year}</td><td>${money(y.baseSalary)}</td><td>${money(y.capHit)}</td><td>${money(y.guaranteedSalary)}</td><td>${money(y.bonusProration)}</td><td>${money(y.rosterOtherBonus)}</td><td><span class="status confirmed">SOURCED</span></td></tr>`).join('');
 const note=$('#yearlyNote');if(note&&yearly.length)note.textContent='Detailed structure from Over The Cap';
}
async function enrichCurrent(){
 if(busy||!$('#player')?.classList.contains('active'))return;
 const name=$('#playerPageName')?.textContent?.trim();if(!name||name==='Player')return;
 busy=true;
 try{
  const s=await fetch('/api/state',{cache:'no-store'}).then(r=>r.json());
  const meta=$('#playerPageMeta')?.textContent||'';
  let p=(s.players||[]).find(x=>x.status!=='removed'&&x.name===name&&(s.teams||[]).some(t=>t.abbr===x.team&&meta.includes(t.name)));
  if(!p)p=(s.players||[]).find(x=>x.status!=='removed'&&x.name===name);
  if(!p)return;
  const key=`${p.team}:${p.name}:${p.contractUpdatedAt||''}`;
  if(key===lastKey&&Array.isArray(p.yearly)&&p.yearly.length){render(p);return;}
  const r=await fetch('/api/player/details',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({team:p.team,name:p.name})});
  const j=await r.json();
  if(r.ok&&j.player){lastKey=`${j.player.team}:${j.player.name}:${j.player.contractUpdatedAt||''}`;render(j.player)}else render(p);
 }catch(e){console.error('Detailed contract enrichment failed',e)}finally{busy=false;}
}
window.addEventListener('load',()=>setTimeout(enrichCurrent,800));
document.addEventListener('click',e=>{if(e.target?.closest('tr[data-name],.leader-row'))setTimeout(enrichCurrent,250);});
const observer=new MutationObserver(()=>{if($('#player')?.classList.contains('active'))setTimeout(enrichCurrent,100)});
window.addEventListener('load',()=>{const p=$('#player');if(p)observer.observe(p,{attributes:true,attributeFilter:['class']});});
