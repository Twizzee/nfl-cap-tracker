const TEAM_MAP={ARZ:'ARI',ARI:'ARI',ATL:'ATL',BAL:'BAL',BUF:'BUF',CAR:'CAR',CHI:'CHI',CIN:'CIN',CLE:'CLE',DAL:'DAL',DEN:'DEN',DET:'DET',GB:'GB',HOU:'HOU',IND:'IND',JAX:'JAX',KC:'KC',LV:'LV',LAC:'LAC',LA:'LAR',LAR:'LAR',MIA:'MIA',MIN:'MIN',NE:'NE',NO:'NO',NYG:'NYG',NYJ:'NYJ',PHI:'PHI',PIT:'PIT',SEA:'SEA',SF:'SF',TB:'TB',TEN:'TEN',WAS:'WAS',WSH:'WAS'};
function clean(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function cash(s){if(!s)return 0;const m=String(s).replace(/,/g,'').match(/\$?([0-9.]+)\s*([MKB])?/i);if(!m)return 0;const mult={M:1e6,K:1e3,B:1e9}[String(m[2]||'').toUpperCase()]||1;return Math.round(Number(m[1])*mult)}
function norm(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}
export function parseXep(html){
 const text=clean(html), rows=[];
 const re=/([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){1,4})\s+([A-Z]{2,3}|LA)\s*[·•]\s*([A-Z]{1,4})\s+(\d+)yr\s+(\d+)yr\s+(\d{4})\s+\$([0-9.]+[MKB]?)\s+\$([0-9.]+[MKB]?)\s+\$([0-9.]+[MKB]?)\s+\$([0-9.]+[MKB]?)/g;
 let m; while((m=re.exec(text))){const team=TEAM_MAP[m[2]];if(!team)continue;rows.push({name:m[1].trim(),team,position:m[3],contractYears:+m[4],yearsLeft:+m[5],signedYear:+m[6],contractEnd:(+m[6])+(+m[4])-1,totalValue:cash(m[7]),apy:cash(m[8]),totalGuaranteed:cash(m[9]),capHit2026:cash(m[10])})}
 return rows;
}
async function fetchWithTimeout(url,ms=15000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Lab/4.0','accept':'text/html'}})}finally{clearTimeout(t)}}
export async function fetchXep(){const url='https://xep.ai/nflcontracts/';const r=await fetchWithTimeout(url);if(!r.ok)throw new Error(`xEP HTTP ${r.status}`);const rows=parseXep(await r.text());if(rows.length<100)throw new Error(`xEP parser found only ${rows.length} contracts`);return {url,rows}}
export async function syncXepContracts(state){const now=new Date().toISOString();const {url,rows}=await fetchXep();let matched=0,added=0;for(const c of rows){let p=state.players.find(x=>x.team===c.team&&x.status!=='removed'&&norm(x.name)===norm(c.name));if(!p){p={team:c.team,name:c.name,position:c.position,status:'active',source:'xEP contract sync'};state.players.push(p);added++}Object.assign(p,c);p.contractStatus='verified';p.contractSource=p.contractSource&&p.contractSource!=='PFN'?[p.contractSource,'xEP'].join(' + '):'xEP';p.contractSourceUrl=url;p.contractUpdatedAt=now;p.sourceChecks={...(p.sourceChecks||{}),xEP:true};matched++}
 for(const t of state.teams){const n=rows.filter(r=>r.team===t.abbr).length;if(n){t.contractsUpdatedAt=now;t.xepContractCount=n}}
 state.lastXepSync=now;return {source:'xEP',matched,added,total:rows.length,url}}
