const TEAM_NAMES={Cardinals:'ARI',Falcons:'ATL',Ravens:'BAL',Bills:'BUF',Panthers:'CAR',Bears:'CHI',Bengals:'CIN',Browns:'CLE',Cowboys:'DAL',Broncos:'DEN',Lions:'DET',Packers:'GB',Texans:'HOU',Colts:'IND',Jaguars:'JAX',Chiefs:'KC',Raiders:'LV',Chargers:'LAC',Rams:'LAR',Dolphins:'MIA',Vikings:'MIN',Patriots:'NE',Saints:'NO',Giants:'NYG',Jets:'NYJ',Eagles:'PHI',Steelers:'PIT',Seahawks:'SEA','49ers':'SF',Buccaneers:'TB',Titans:'TEN',Commanders:'WAS'};
function clean(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
function norm(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}
function cash(s){const m=String(s||'').replace(/,/g,'').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);return m?Math.round(Number(m[1])):0}
function pct(s){const m=String(s||'').match(/([0-9]+(?:\.[0-9]+)?)\s*%/);return m?Number(m[1]):null}
function cells(row){const out=[];const re=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;let m;while((m=re.exec(row)))out.push(clean(m[1]));return out}
function hrefFromFirstCell(row){const m=row.match(/<t[dh]\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i);if(!m)return'';return m[1].startsWith('http')?m[1]:`https://overthecap.com${m[1]}`}
export function parseOtcContracts(html){
 const rows=[];const tr=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;let m;
 while((m=tr.exec(html))){const c=cells(m[1]);if(c.length<7)continue;const name=c[0],position=c[1],team=TEAM_NAMES[c[2]]||'';if(!team||!name||/^player$/i.test(name))continue;const totalValue=cash(c[3]),apy=cash(c[4]),totalGuaranteed=cash(c[5]),avgGuaranteePerYear=cash(c[6]),guaranteePercent=pct(c[7]||'');if(!totalValue&&!apy&&!totalGuaranteed)continue;rows.push({name,position,team,totalValue,apy,totalGuaranteed,avgGuaranteePerYear,guaranteePercent,otcUrl:hrefFromFirstCell(m[1])});}
 return rows;
}
async function fetchHtml(url,ms=18000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/7.0','accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw new Error(`OTC HTTP ${r.status}`);return await r.text()}finally{clearTimeout(t)}}
export async function syncOtcContracts(state){
 const url='https://overthecap.com/contracts';const html=await fetchHtml(url);const rows=parseOtcContracts(html);if(rows.length<400)throw new Error(`OTC contract parser found only ${rows.length} players`);const now=new Date().toISOString();let matched=0;
 for(const c of rows){const p=state.players.find(x=>x.status!=='removed'&&x.team===c.team&&norm(x.name)===norm(c.name));if(!p)continue;p.totalValue=c.totalValue||p.totalValue||0;p.apy=c.apy||p.apy||0;p.totalGuaranteed=c.totalGuaranteed||p.totalGuaranteed||0;p.avgGuaranteePerYear=c.avgGuaranteePerYear||p.avgGuaranteePerYear||0;if(c.guaranteePercent!==null)p.guaranteePercent=c.guaranteePercent;p.otcUrl=c.otcUrl||p.otcUrl;p.sourceChecks={...(p.sourceChecks||{}),OTC:true};p.contractSource=[p.contractSource,'OverTheCap'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' + ');p.contractUpdatedAt=now;matched++;}
 state.lastOtcSync=now;return{source:'OverTheCap contracts',players:rows.length,matched,url};
}
