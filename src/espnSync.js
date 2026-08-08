const INTERNAL_ALIASES = {WSH:'WAS',LA:'LAR',JAC:'JAX'};

function normAbbr(v){
  const a=String(v||'').toUpperCase();
  return INTERNAL_ALIASES[a]||a;
}
function athleteFrom(item, group){
  const a=item?.athlete || item?.player || item;
  if(!a) return null;
  const pos=a.position?.abbreviation || a.position?.name || item?.position?.abbreviation || item?.position?.name || group?.position?.abbreviation || group?.position || '';
  return {
    espnId:String(a.id ?? item?.id ?? ''),
    name:a.fullName||a.displayName||a.name||item?.displayName||'',
    position:pos,
    age:a.age??item?.age??null,
    experience:a.experience?.years??a.experience??item?.experience?.years??item?.experience??null,
    college:a.college?.name||item?.college?.name||'',
    jersey:a.jersey||item?.jersey||'',
    status:a.status?.type||a.status?.name||item?.status?.type||item?.status?.name||'active'
  };
}
function normalizeRosterPayload(payload){
  const out=[];
  const groups=Array.isArray(payload?.athletes)?payload.athletes:[];
  for(const group of groups){
    if(Array.isArray(group?.items)) for(const item of group.items){const p=athleteFrom(item,group);if(p?.name)out.push(p)}
    else if(Array.isArray(group?.athletes)) for(const item of group.athletes){const p=athleteFrom(item,group);if(p?.name)out.push(p)}
    else {const p=athleteFrom(group,null);if(p?.name)out.push(p)}
  }
  if(!out.length && Array.isArray(payload?.team?.athletes)) for(const item of payload.team.athletes){const p=athleteFrom(item,null);if(p?.name)out.push(p)}
  if(!out.length && Array.isArray(payload?.roster)) for(const item of payload.roster){const p=athleteFrom(item,null);if(p?.name)out.push(p)}
  const uniq=new Map();
  for(const p of out) uniq.set(p.espnId?`id:${p.espnId}`:`n:${p.name.toLowerCase()}`,p);
  return [...uniq.values()];
}
async function fetchWithTimeout(url,ms=12000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  try{return await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/4.1','accept':'application/json'}})}
  finally{clearTimeout(t)}
}

export async function fetchEspnTeamDirectory(){
  const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40';
  const res=await fetchWithTimeout(url,15000);
  if(!res.ok) throw new Error(`ESPN team directory HTTP ${res.status}`);
  const json=await res.json();
  const raw=json?.sports?.[0]?.leagues?.[0]?.teams || json?.teams || [];
  const map=new Map();
  for(const wrapper of raw){
    const t=wrapper?.team||wrapper;
    if(!t) continue;
    const abbr=normAbbr(t.abbreviation||t.shortDisplayName||'');
    if(abbr && t.id) map.set(abbr,{id:String(t.id),abbr,slug:t.slug||'',name:t.displayName||t.name||abbr});
  }
  if(map.size<32) throw new Error(`ESPN directory returned only ${map.size}/32 teams`);
  return map;
}

async function fetchRosterUrl(url,ms=12000){
  const res=await fetchWithTimeout(url,ms);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows=normalizeRosterPayload(await res.json());
  if(!rows.length) throw new Error('empty roster');
  return rows;
}

export async function fetchEspnRoster(team, directoryEntry=null){
  const urls=[];
  if(directoryEntry?.id){
    urls.push(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${directoryEntry.id}/roster`);
    urls.push(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${directoryEntry.id}?enable=roster`);
  }
  const slug=(directoryEntry?.slug || team.espnSlug || team.abbr).toLowerCase();
  urls.push(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${slug}/roster`);
  urls.push(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${slug}?enable=roster`);

  let best=[],lastErr;
  for(const url of [...new Set(urls)]){
    try{
      const rows=await fetchRosterUrl(url,14000);
      if(rows.length>best.length) best=rows;
      if(rows.length>=45) return rows;
    }catch(e){lastErr=e}
  }
  if(best.length) return best;
  throw new Error(`ESPN ${team.abbr} roster failed: ${lastErr?.message||'unknown error'}`);
}

function key(p){return p.espnId?`id:${p.espnId}`:`name:${String(p.name||'').toLowerCase()}`}
function ensureMoneyFields(p){
  for(const f of ['capHit2026','baseSalary2026','guaranteed2026','bonusProration2026','deadCapCut2026','deadCapTrade2026','postJuneDead2026']) if(!Number.isFinite(Number(p[f]))) p[f]=0;
  if(!p.contractStatus)p.contractStatus='unverified';
}
function mergeTeamRoster(state,team,live,now){
  const transactions=[];
  const existing=state.players.filter(p=>p.team===team.abbr&&p.status!=='removed');
  const existingMap=new Map(existing.map(p=>[key(p),p]));
  const liveNameSet=new Set(live.map(p=>String(p.name||'').toLowerCase()));
  const liveIdSet=new Set(live.filter(p=>p.espnId).map(p=>String(p.espnId)));

  for(const lp of live){
    const k=key(lp);
    let p=existingMap.get(k)||existing.find(x=>String(x.name||'').toLowerCase()===String(lp.name||'').toLowerCase());
    if(p){
      Object.assign(p,{espnId:lp.espnId||p.espnId,position:lp.position||p.position,age:lp.age??p.age,experience:lp.experience??p.experience,college:lp.college||p.college,jersey:lp.jersey||p.jersey,status:'active'});
      p.sourceChecks={...(p.sourceChecks||{}),ESPN:true};p.rosterUpdatedAt=now;ensureMoneyFields(p);
    }else{
      p={team:team.abbr,...lp,capHit2026:0,baseSalary2026:0,guaranteed2026:0,bonusProration2026:0,deadCapCut2026:0,deadCapTrade2026:0,postJuneDead2026:0,contractStatus:'unverified',contractSource:'',source:'ESPN roster sync',sourceChecks:{ESPN:true,PFN:false,xEP:false},rosterUpdatedAt:now};
      state.players.push(p);
      transactions.push({id:`${team.abbr}-${lp.espnId||lp.name}-${now}-add`,timestamp:now,team:team.abbr,type:'ROSTER_ADD',player:lp.name,position:lp.position,source:'ESPN roster'});
    }
  }

  if(live.length>=45){
    for(const ep of existing){
      const exists=(ep.espnId&&liveIdSet.has(String(ep.espnId)))||liveNameSet.has(String(ep.name||'').toLowerCase());
      if(!exists){
        ep.status='removed';
        transactions.push({id:`${team.abbr}-${ep.espnId||ep.name}-${now}-remove`,timestamp:now,team:team.abbr,type:'ROSTER_REMOVE',player:ep.name,position:ep.position,source:'ESPN roster'});
      }
    }
  }
  team.rosterUpdatedAt=now;
  team.rosterPlayerCount=live.length;
  team.rosterSource='ESPN';
  team.rosterSyncStatus=live.length>=45?'ok':'partial';
  return transactions;
}

async function mapLimit(items,limit,fn){
  let i=0;const out=[];
  async function worker(){while(i<items.length){const idx=i++;try{out[idx]=await fn(items[idx],idx)}catch(e){out[idx]={error:e}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}

export async function syncEspn(state){
  const now=new Date().toISOString();const transactions=[];const failures=[];
  let directory;
  try{directory=await fetchEspnTeamDirectory()}
  catch(e){directory=new Map();state.syncLog.unshift({timestamp:now,status:'error',message:`ESPN team directory failed: ${e.message}`})}

  const firstPass=await mapLimit(state.teams,8,async team=>{
    const live=await fetchEspnRoster(team,directory.get(team.abbr));
    return {abbr:team.abbr,live};
  });

  for(let i=0;i<firstPass.length;i++){
    const team=state.teams[i];let r=firstPass[i];
    if(r?.error || !r?.live || r.live.length<45){
      try{
        const live=await fetchEspnRoster(team,directory.get(team.abbr));
        if(!r?.live || live.length>r.live.length) r={abbr:team.abbr,live};
      }catch(e){ if(!r?.live) r={error:e}; }
      firstPass[i]=r;
    }
  }

  let teamsSynced=0,fullRosters=0;
  for(let i=0;i<firstPass.length;i++){
    const team=state.teams[i],r=firstPass[i];
    if(r?.error || !r?.live?.length){
      const msg=String(r?.error?.message||r?.error||'no roster returned');
      failures.push({team:team.abbr,error:msg});
      team.rosterSyncStatus='error';team.rosterSyncError=msg;
      state.syncLog.unshift({timestamp:now,team:team.abbr,status:'error',message:msg});
      continue;
    }
    teamsSynced++;
    if(r.live.length>=45) fullRosters++;
    team.rosterSyncError='';
    transactions.push(...mergeTeamRoster(state,team,r.live,now));
  }

  state.transactions.unshift(...transactions);state.transactions=state.transactions.slice(0,1500);state.lastSync=now;
  const valid=fullRosters>=30;
  state.syncLog.unshift({timestamp:now,status:valid?'ok':'partial',message:`ESPN league roster sync: ${teamsSynced}/32 responded, ${fullRosters}/32 returned full rosters, ${transactions.length} changes.`});
  state.syncLog=state.syncLog.slice(0,300);
  return {teamsSynced,fullRosters,validated:valid,transactions,failures};
}
