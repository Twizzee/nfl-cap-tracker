const MOVE_WORDS = /\b(sign(?:ed|s|ing)?|re-sign(?:ed|s|ing)?|release(?:d|s|ing)?|cut|cuts|waive(?:d|s|ing)?|claim(?:ed|s|ing)?|trade(?:d|s|ing)?|acquire(?:d|s|ing)?|extend(?:ed|s|ing)?|extension|placed on (?:ir|injured reserve)|activated|practice squad)\b/i;

function getHref(a){
  return a?.links?.web?.href || a?.links?.api?.self?.href || '';
}
function teamAbbrFromArticle(a){
  const cats=Array.isArray(a?.categories)?a.categories:[];
  for(const c of cats){
    const abbr=c?.team?.abbreviation || c?.team?.shortDisplayName;
    if(abbr && /^[A-Z]{2,3}$/.test(abbr)) return abbr==='WSH'?'WAS':abbr;
  }
  return '';
}
function classify(text=''){
  if(/\btrade(?:d|s|ing)?|acquire(?:d|s|ing)?\b/i.test(text)) return 'TRADE';
  if(/\bwaive(?:d|s|ing)?|release(?:d|s|ing)?|\bcut(?:s)?\b/i.test(text)) return 'RELEASE';
  if(/\bextend(?:ed|s|ing)?|extension\b/i.test(text)) return 'EXTENSION';
  if(/\bsign(?:ed|s|ing)?|re-sign(?:ed|s|ing)?\b/i.test(text)) return 'SIGNING';
  if(/\bactivated|placed on (?:ir|injured reserve)|practice squad\b/i.test(text)) return 'ROSTER';
  return 'NEWS';
}

export async function fetchEspnMoveNews(limit=100){
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=${Math.max(25,Math.min(200,limit))}`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Lab/3.0','accept':'application/json'}});
    if(!res.ok) throw new Error(`ESPN news HTTP ${res.status}`);
    const j=await res.json();
    return (Array.isArray(j?.articles)?j.articles:[])
      .filter(a=>MOVE_WORDS.test(`${a.headline||''} ${a.description||''}`))
      .map(a=>({
        id:`espn-news-${a.id}`,
        timestamp:a.published||a.lastModified||new Date().toISOString(),
        team:teamAbbrFromArticle(a),
        type:classify(`${a.headline||''} ${a.description||''}`),
        headline:a.headline||'NFL roster news',
        description:a.description||'',
        source:'ESPN News',
        url:getHref(a)
      }));
  } finally { clearTimeout(timer); }
}

export async function syncMoveNews(state){
  const now=new Date().toISOString();
  const items=await fetchEspnMoveNews(120);
  const old=new Map((state.news||[]).map(x=>[x.id,x]));
  for(const item of items) old.set(item.id,item);
  state.news=[...old.values()].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,250);
  state.lastNewsSync=now;
  return {count:items.length,lastNewsSync:now};
}
