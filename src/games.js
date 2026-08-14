const SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

function team(c={}){
 const t=c.team||{};
 return {
  id:t.id||'',abbr:t.abbreviation||'',name:t.displayName||t.shortDisplayName||'',shortName:t.shortDisplayName||t.name||'',
  logo:t.logo||'',score:Number(c.score||0),homeAway:c.homeAway||'',winner:Boolean(c.winner),
  record:Array.isArray(c.records)?(c.records.find(r=>r.name==='overall')?.summary||c.records[0]?.summary||''):''
 };
}
function seasonLabel(type={}){const n=String(type.name||type.abbreviation||'NFL');return n.toLowerCase().includes('pre')?'NFL Preseason':n.toLowerCase().includes('post')?'NFL Postseason':'NFL Regular Season'}
function statusKind(status={}){const s=status?.type?.state;return s==='in'?'live':s==='post'?'final':'upcoming'}
function game(event={}){
 const comp=event.competitions?.[0]||{}, status=comp.status||{}, state=statusKind(status);
 const home=team((comp.competitors||[]).find(x=>x.homeAway==='home')||{}), away=team((comp.competitors||[]).find(x=>x.homeAway==='away')||{});
 const sit=comp.situation||{};
 const down=sit.down>0&&sit.distance>=0?`${sit.down}${sit.down===1?'st':sit.down===2?'nd':sit.down===3?'rd':'th'} & ${sit.distance}${sit.possessionText?` at ${sit.possessionText}`:''}`:'';
 return {
  id:event.id||comp.id||'',name:event.name||'',shortName:event.shortName||'',date:event.date||comp.date||'',
  seasonType:event.season?.type||0,seasonLabel:seasonLabel(event.season||{}),week:Number(event.week?.number||0),
  state,statusDetail:status?.type?.detail||status?.type?.shortDetail||status?.type?.description||'',
  shortStatus:status?.type?.shortDetail||status?.type?.description||'',displayClock:status.displayClock||'',period:Number(status.period||0),
  home,away,venue:comp.venue?.fullName||'',city:comp.venue?.address?.city||'',broadcasts:(comp.broadcasts||[]).flatMap(b=>b.names||[]),
  possessionTeamId:sit.possession||'',downDistance:down,lastPlay:sit.lastPlay?.text||'',redZone:Boolean(sit.isRedZone),
  link:(event.links||[]).find(x=>(x.rel||[]).includes('summary'))?.href||''
 };
}
async function fetchJson(url,ms=10000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 CapLab/1.0','accept':'application/json','cache-control':'no-cache'}});if(!r.ok)throw Error(`ESPN scoreboard HTTP ${r.status}`);return await r.json()}finally{clearTimeout(timer)}}
export async function fetchNflGames(){
 const j=await fetchJson(`${SCOREBOARD}?_=${Date.now()}`);
 const games=(j.events||[]).map(game).sort((a,b)=>{const rank={live:0,upcoming:1,final:2};return rank[a.state]-rank[b.state]||new Date(a.date)-new Date(b.date)});
 const league=j.leagues?.[0]||{};
 return {source:'ESPN',checkedAt:new Date().toISOString(),season:Number(j.season?.year||league.season?.year||0),seasonType:Number(j.season?.type||league.season?.type?.type||0),seasonName:league.season?.type?.name||'',week:Number(j.week?.number||0),games,counts:{live:games.filter(g=>g.state==='live').length,upcoming:games.filter(g=>g.state==='upcoming').length,final:games.filter(g=>g.state==='final').length}};
}
