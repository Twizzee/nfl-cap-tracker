function cleanText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
function cash(s){const m=String(s||'').replace(/,/g,'').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);return m?Math.round(Number(m[1])):0}
function pos(v){const p=String(v||'').trim().toUpperCase();return p==='ED'?'EDGE':p}
function cellsFromRow(rowHtml){const out=[];const re=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;let m;while((m=re.exec(rowHtml)))out.push(cleanText(m[1]));return out}
function teamFrom(v){const m=String(v||'').toUpperCase().match(/\b(ARI|ATL|BAL|BUF|CAR|CHI|CIN|CLE|DAL|DEN|DET|GB|HOU|IND|JAX|KC|LV|LAC|LAR|MIA|MIN|NE|NO|NYG|NYJ|PHI|PIT|SEA|SF|TB|TEN|WAS|WSH)\b/);return m?(m[1]==='WSH'?'WAS':m[1]):''}
function isFaType(v){return /^(UFA|RFA|ERFA|SFA|TENDER|FRANCHISE|TRANSITION)$/i.test(String(v||'').trim())}

export function parseAvailableFreeAgents(html,sourceUrl=''){
  const rows=[];const seen=new Set();const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;let tr;
  while((tr=trRe.exec(html))){
    const c=cellsFromRow(tr[1]);if(c.length<7)continue;
    // Find the FA type cell first, then map the known Spotrac available-player columns relative to it.
    const typeIndex=c.findIndex(isFaType);if(typeIndex<0)continue;
    const type=String(c[typeIndex]).trim().toUpperCase();
    const marketValueAAV=cash(c[typeIndex+1]||'');
    const previousApy=cash(c[typeIndex-1]||'');
    const previousTeam=teamFrom(c[typeIndex-2]||'');
    const yoe=Number.parseInt(c[typeIndex-3],10);
    const age=Number.parseFloat(c[typeIndex-4]);
    const position=pos(c[typeIndex-5]);
    const name=String(c[typeIndex-6]||'').trim();
    if(!name||/^player/i.test(name)||!position||position.length>6)continue;
    const key=name.toLowerCase();if(seen.has(key))continue;seen.add(key);
    rows.push({name,position,age:Number.isFinite(age)?age:null,yoe:Number.isFinite(yoe)?yoe:null,previousTeam,previousApy,type,marketValueAAV,source:'Spotrac',sourceUrl});
  }
  return rows;
}

async function fetchWithTimeout(url,ms=18000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/6.3','accept':'text/html,application/xhtml+xml'}})}finally{clearTimeout(t)}}
async function fetchType(type){
  const url=`https://www.spotrac.com/nfl/free-agents/available/_/year/2026/type/${type.toLowerCase()}`;
  const r=await fetchWithTimeout(url);if(!r.ok)throw new Error(`Spotrac free agents ${type} HTTP ${r.status}`);
  return {url,rows:parseAvailableFreeAgents(await r.text(),url)};
}
export async function syncFreeAgents(state){
  const results=await Promise.allSettled(['UFA','RFA','ERFA'].map(fetchType));
  const merged=new Map();const sources=[];const failures=[];
  for(let i=0;i<results.length;i++){
    const type=['UFA','RFA','ERFA'][i],r=results[i];
    if(r.status==='rejected'){failures.push(`${type}: ${String(r.reason?.message||r.reason)}`);continue;}
    sources.push(r.value.url);for(const p of r.value.rows)merged.set(`${p.type}:${p.name.toLowerCase()}`,p);
  }
  const rows=[...merged.values()];
  if(rows.length<25)throw new Error(`Spotrac free-agent parser found only ${rows.length} available players${failures.length?` (${failures.join('; ')})`:''}`);
  const now=new Date().toISOString();state.freeAgents=rows;state.lastFreeAgentSync=now;
  return{source:'Spotrac available free agents',players:rows.length,sources,failures,lastFreeAgentSync:now};
}
