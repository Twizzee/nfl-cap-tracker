function normName(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}

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

export function canonicalizePlayers(state){
  const groups=new Map();
  for(const p of state.players||[]){
    if(p.status==='removed')continue;
    const key=`${p.team}:${normName(p.name)}`;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  }
  let merged=0;
  const fields=['espnId','position','age','experience','college','jersey','capHit2026','baseSalary2026','guaranteed2026','bonusProration2026','deadCapCut2026','deadCapTrade2026','postJuneDead2026','cutSavings2026','worth2026','totalValue','apy','totalGuaranteed','guaranteedAtSigning','avgGuaranteePerYear','guaranteePercent','signedYear','contractEnd','contractYears','contractType','yearsLeft','freeAgentYear','freeAgentStatus','signingBonus','signingBonusTotal','rosterOtherBonus2026','otcUrl','spotracSourceUrl','contractSourceUrl','yearly','rosterUpdatedAt','contractUpdatedAt'];
  for(const list of groups.values()){
    if(list.length<2)continue;
    list.sort((a,b)=>score(b)-score(a));
    const keep=list[0];
    for(const dup of list.slice(1)){
      for(const f of fields)copyIfMissing(keep,dup,f);
      keep.sourceChecks={...(dup.sourceChecks||{}),...(keep.sourceChecks||{})};
      keep.contractSource=mergeSources(keep.contractSource,dup.contractSource);
      if(!keep.source&&dup.source)keep.source=dup.source;
      dup.status='removed';
      dup.mergedInto=keep.espnId||keep.name;
      merged++;
    }
  }
  return merged;
}

export function findCanonicalPlayer(state,team,name){
  const key=normName(name);
  const matches=(state.players||[]).filter(p=>p.team===team&&p.status!=='removed'&&normName(p.name)===key);
  if(!matches.length)return null;
  matches.sort((a,b)=>score(b)-score(a));
  return matches[0];
}

export { normName };
