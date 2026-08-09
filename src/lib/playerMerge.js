function normName(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}
function nameTokens(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9' -]/g,' ').split(/\s+/).filter(Boolean)}
function looseNameMatch(a,b){
 const na=normName(a),nb=normName(b);if(!na||!nb)return false;if(na===nb)return true;
 // Handles bad source cells such as "Rodgers Aaron Rodgers" while requiring the real name to be substantial.
 const short=na.length<=nb.length?na:nb,long=na.length>nb.length?na:nb;
 if(short.length>=7&&long.includes(short)&&long.length<=short.length+12)return true;
 const at=nameTokens(a),bt=nameTokens(b);if(at.length<2||bt.length<2)return false;
 const aset=new Set(at),bset=new Set(bt),shared=[...aset].filter(x=>bset.has(x));
 return shared.length>=2&&shared.length===Math.min(aset.size,bset.size);
}

function score(p){
  let n=0;
  if(p?.espnId)n+=100;
  if(p?.sourceChecks?.ESPN)n+=50;
  if(p?.sourceChecks?.STM)n+=20;
  if(p?.sourceChecks?.Spotrac)n+=15;
  if(p?.sourceChecks?.OTC)n+=15;
  if(p?.sourceChecks?.PFN)n+=5;
  if(Number(p?.capHit2026||0)>0)n+=8;
  if(Number(p?.apy||0)>0)n+=5;
  if(Number(p?.totalValue||0)>0)n+=5;
  if(Number(p?.totalGuaranteed||0)>0)n+=5;
  return n;
}

function mergeSources(a,b){return [...new Set([...(String(a||'').split(' + ').filter(Boolean)),...(String(b||'').split(' + ').filter(Boolean))])].join(' + ')}

function copyIfMissing(dst,src,key){
  const d=dst[key],s=src[key];
  const missing=d===undefined||d===null||d===''||(typeof d==='number'&&d===0);
  if(missing&&s!==undefined&&s!==null&&s!=='')dst[key]=s;
}

function mergeRecord(keep,dup){
 const fields=['espnId','position','age','experience','college','jersey','capHit2026','baseSalary2026','guaranteed2026','bonusProration2026','deadCapCut2026','deadCapTrade2026','postJuneDead2026','cutSavings2026','worth2026','totalValue','apy','totalGuaranteed','guaranteedAtSigning','avgGuaranteePerYear','guaranteePercent','signedYear','contractStart','contractEnd','contractYears','contractType','yearsLeft','freeAgentYear','freeAgentStatus','signingBonus','signingBonusTotal','rosterOtherBonus2026','otcUrl','spotracSourceUrl','spotracPlayerUrl','contractSourceUrl','yearly','rosterUpdatedAt','contractUpdatedAt'];
 for(const f of fields)copyIfMissing(keep,dup,f);
 keep.sourceChecks={...(dup.sourceChecks||{}),...(keep.sourceChecks||{})};
 keep.contractSource=mergeSources(keep.contractSource,dup.contractSource);
 if(!keep.source&&dup.source)keep.source=dup.source;
 dup.status='removed';
 dup.mergedInto=keep.espnId||keep.name;
}

export function canonicalizePlayers(state){
  const active=(state.players||[]).filter(p=>p.status!=='removed');
  let merged=0;
  const consumed=new Set();
  for(let i=0;i<active.length;i++){
    const a=active[i];if(consumed.has(a))continue;
    const group=[a];
    for(let j=i+1;j<active.length;j++){
      const b=active[j];if(consumed.has(b)||a.team!==b.team)continue;
      if(looseNameMatch(a.name,b.name)){group.push(b);consumed.add(b);}
    }
    if(group.length<2)continue;
    group.sort((x,y)=>score(y)-score(x));
    const keep=group[0];
    for(const dup of group.slice(1)){mergeRecord(keep,dup);merged++;}
  }
  return merged;
}

export function findCanonicalPlayer(state,team,name){
  const candidates=(state.players||[]).filter(p=>p.team===team&&p.status!=='removed');
  let matches=candidates.filter(p=>normName(p.name)===normName(name));
  if(!matches.length)matches=candidates.filter(p=>looseNameMatch(p.name,name));
  if(!matches.length)return null;
  matches.sort((a,b)=>score(b)-score(a));
  return matches[0];
}

export { normName, looseNameMatch };
