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
  if(/\bextend(?:ed|s|ing)?|extension|contract talks?|negotiat(?:e|es|ed|ing|ions?)|in talks\b/i.test(text)) return 'CONTRACT';
  if(/\bsign(?:ed|s|ing)?|re-sign(?:ed|s|ing)?\b/i.test(text)) return 'SIGNING';
  if(/\bactivated|placed on (?:ir|injured reserve)|practice squad\b/i.test(text)) return 'ROSTER';
  if(/\binjur(?:y|ed|ies)|questionable|doubtful|out for|surgery\b/i.test(text)) return 'INJURY';
  if(/\bretir(?:e|ed|ement)\b/i.test(text)) return 'RETIREMENT';
  if(/\bsuspend(?:ed|s|ing)?|suspension\b/i.test(text)) return 'SUSPENSION';
  return 'NEWS';
}
function tierFor(text='',type='NEWS'){
  const t=String(text||'').toLowerCase();
  if(type==='TRADE'||/blockbuster|record[- ]setting|highest[- ]paid|franchise quarterback|star quarterback|all-pro.*(?:trade|sign|extend|release)|pro bowl.*(?:trade|sign|extend|release)/i.test(t)) return 'MAJOR';
  if(type==='CONTRACT'||type==='RETIREMENT'||type==='SUSPENSION'||/starter|first-round|pro bowl|all-pro|season-ending|torn acl|holdout|hold-in|requests? trade/i.test(t)) return 'IMPORTANT';
  if(type==='SIGNING'||type==='RELEASE'||type==='INJURY') return 'IMPORTANT';
  if(type==='ROSTER'||/practice squad|waiver|claimed|activated|elevated|depth chart/i.test(t)) return 'MINOR';
  return 'GENERAL';
}

export async function fetchEspnNews(limit=160){
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=${Math.max(25,Math.min(200,limit))}`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const res=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/6.4','accept':'application/json'}});
    if(!res.ok) throw new Error(`ESPN news HTTP ${res.status}`);
    const j=await res.json();
    return (Array.isArray(j?.articles)?j.articles:[])
      .filter(a=>a?.id && (a.headline || a.description))
      .map(a=>{
        const text=`${a.headline||''} ${a.description||''}`;
        const type=classify(text);
        return {
          id:`espn-news-${a.id}`,
          timestamp:a.published||a.lastModified||new Date().toISOString(),
          team:teamAbbrFromArticle(a),
          type,
          tier:tierFor(text,type),
          headline:a.headline||'NFL news',
          description:a.description||'',
          source:'ESPN News',
          url:getHref(a)
        };
      });
  } finally { clearTimeout(timer); }
}

export async function fetchEspnMoveNews(limit=160){
  return fetchEspnNews(limit);
}

export async function syncMoveNews(state){
  const now=new Date().toISOString();
  const items=await fetchEspnNews(180);
  const old=new Map((state.news||[]).map(x=>[x.id,x]));
  for(const item of items) old.set(item.id,item);
  state.news=[...old.values()]
    .filter(x=>x?.id && x?.timestamp)
    .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
    .slice(0,500);
  state.lastNewsSync=now;
  return {count:items.length,stored:state.news.length,lastNewsSync:now};
}
