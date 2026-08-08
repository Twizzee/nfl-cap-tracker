const TEAM_SLUGS={
 ARI:'arizona-cardinals',ATL:'atlanta-falcons',BAL:'baltimore-ravens',BUF:'buffalo-bills',CAR:'carolina-panthers',CHI:'chicago-bears',CIN:'cincinnati-bengals',CLE:'cleveland-browns',DAL:'dallas-cowboys',DEN:'denver-broncos',DET:'detroit-lions',GB:'green-bay-packers',HOU:'houston-texans',IND:'indianapolis-colts',JAX:'jacksonville-jaguars',KC:'kansas-city-chiefs',LV:'las-vegas-raiders',LAC:'los-angeles-chargers',LAR:'los-angeles-rams',MIA:'miami-dolphins',MIN:'minnesota-vikings',NE:'new-england-patriots',NO:'new-orleans-saints',NYG:'new-york-giants',NYJ:'new-york-jets',PHI:'philadelphia-eagles',PIT:'pittsburgh-steelers',SF:'san-francisco-49ers',SEA:'seattle-seahawks',TB:'tampa-bay-buccaneers',TEN:'tennessee-titans',WAS:'washington-commanders'
};

function cleanText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;|&#8211;/gi,'-').replace(/\s+/g,' ').trim()}
function norm(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}
function cash(s){const m=String(s||'').replace(/,/g,'').match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);return m?Math.round(Number(m[1])):0}
function integer(s){const m=String(s||'').match(/^\s*(\d{1,4})\s*$/);return m?Number(m[1]):null}
function cellsFromRow(rowHtml){const out=[];const re=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;let m;while((m=re.exec(rowHtml)))out.push(cleanText(m[1]));return out}

export function parseSpotracContracts(html){
 const rows=[];const seen=new Set();const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;let tr;
 while((tr=trRe.exec(html))){
   const cells=cellsFromRow(tr[1]);
   if(cells.length<8)continue;
   const name=(cells[0]||'').replace(/\s+/g,' ').trim();
   const position=(cells[1]||'').trim();
   if(!name||/^player/i.test(name)||!position||position.length>6)continue;
   const moneyCells=cells.map((v,i)=>({v,i,n:cash(v)})).filter(x=>/\$/.test(x.v));
   if(moneyCells.length<3)continue;
   const nums=cells.map((v,i)=>({v,i,n:integer(v)})).filter(x=>x.n!==null);
   const years=nums.filter(x=>x.n>=2000&&x.n<=2100).map(x=>x.n);
   const short=nums.filter(x=>x.n>=1&&x.n<=10).map(x=>x.n);
   const totalValue=moneyCells[moneyCells.length-4]?.n||0;
   const apy=moneyCells[moneyCells.length-3]?.n||0;
   const guaranteedAtSigning=moneyCells[moneyCells.length-2]?.n||0;
   const practicalGuarantee=moneyCells[moneyCells.length-1]?.n||0;
   if(!totalValue&&!apy&&!practicalGuarantee&&!guaranteedAtSigning)continue;
   const key=norm(name);if(!key||seen.has(key))continue;seen.add(key);
   const signedYear=years.length?years[0]:null;
   const contractEnd=years.length?years[years.length-1]:null;
   let contractYears=short.length?short[short.length-1]:null;
   if((!contractYears||contractYears>10)&&signedYear&&contractEnd)contractYears=Math.max(1,contractEnd-signedYear);
   rows.push({name,position,totalValue,apy,guaranteedAtSigning,totalGuaranteed:practicalGuarantee||guaranteedAtSigning,signedYear,contractEnd,contractYears,spotracPracticalGuarantee:practicalGuarantee});
 }
 if(rows.length>=20)return rows;

 // Fallback for simplified/server-rendered table text.
 const text=cleanText(html);
 const body=text.slice(Math.max(0,text.search(/Player\s*\(\d+\).*?Practical Guarantee/i)));
 const re=/([A-Z][A-Za-z'’.\-]*(?:\s+[A-Z][A-Za-z'’.\-]*){1,4})\s+([A-Z]{1,4})\s+(\d{4})\s+.*?\s+(\d{4})\s+(\d{4})\s+(\d+)\s+\$([0-9,]+)\s+\$([0-9,]+)\s+(?:\$([0-9,]+))?\s*(?:\$([0-9,]+))?/g;
 let m;while((m=re.exec(body))){const key=norm(m[1]);if(seen.has(key))continue;seen.add(key);rows.push({name:m[1].trim(),position:m[2],signedYear:Number(m[4]),contractEnd:Number(m[5]),contractYears:Number(m[6]),totalValue:cash('$'+m[7]),apy:cash('$'+m[8]),guaranteedAtSigning:cash(m[9]?'$'+m[9]:''),totalGuaranteed:cash(m[10]?'$'+m[10]:(m[9]?'$'+m[9]:''))});}
 return rows;
}

async function fetchWithTimeout(url,ms=18000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/6.1','accept':'text/html,application/xhtml+xml'}})}finally{clearTimeout(t)}}

export async function fetchSpotracTeam(abbr){const slug=TEAM_SLUGS[abbr];if(!slug)throw new Error(`No Spotrac slug for ${abbr}`);const url=`https://www.spotrac.com/nfl/${slug}/contracts`;const r=await fetchWithTimeout(url);if(!r.ok)throw new Error(`Spotrac ${abbr} HTTP ${r.status}`);const rows=parseSpotracContracts(await r.text());if(rows.length<15)throw new Error(`Spotrac ${abbr} parser found only ${rows.length} contracts`);return{url,rows}}

function mergeTeam(state,abbr,data,now){let matched=0,added=0;const teamPlayers=state.players.filter(p=>p.team===abbr&&p.status!=='removed');for(const c of data.rows){let p=teamPlayers.find(x=>norm(x.name)===norm(c.name));if(!p){p={team:abbr,name:c.name,position:c.position,status:'active',source:'Spotrac contract sync'};state.players.push(p);teamPlayers.push(p);added++;}p.totalValue=c.totalValue||p.totalValue||0;p.apy=c.apy||p.apy||0;p.totalGuaranteed=c.totalGuaranteed||p.totalGuaranteed||0;p.guaranteedAtSigning=c.guaranteedAtSigning||p.guaranteedAtSigning||0;p.signedYear=c.signedYear||p.signedYear;p.contractEnd=c.contractEnd||p.contractEnd;p.contractYears=c.contractYears||p.contractYears;if(c.contractEnd)p.yearsLeft=Math.max(0,c.contractEnd-2026+1);p.contractStatus='verified';p.contractSource=[p.contractSource,'Spotrac'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' + ');p.contractUpdatedAt=now;p.spotracSourceUrl=data.url;p.sourceChecks={...(p.sourceChecks||{}),Spotrac:true};matched++;}const t=state.teams.find(x=>x.abbr===abbr);if(t){t.contractsUpdatedAt=now;t.spotracContractCount=data.rows.length;}return{abbr,matched,added,players:data.rows.length,url:data.url}}
async function mapLimit(items,limit,fn){let i=0;const out=[];async function worker(){while(i<items.length){const idx=i++;try{out[idx]=await fn(items[idx],idx)}catch(e){out[idx]={abbr:items[idx]?.abbr,error:String(e.message||e)}}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out}
export async function syncSpotracLeague(state){const now=new Date().toISOString();const results=await mapLimit(state.teams,4,async t=>mergeTeam(state,t.abbr,await fetchSpotracTeam(t.abbr),now));const ok=results.filter(r=>!r.error),failed=results.filter(r=>r.error);state.lastSpotracSync=now;state.syncLog=state.syncLog||[];state.syncLog.unshift({timestamp:now,status:ok.length>=30?'ok':'partial',message:`Spotrac contract sync: ${ok.length}/32 teams, ${ok.reduce((n,r)=>n+(r.players||0),0)} contracts.${failed.length?' Failed: '+failed.map(x=>x.abbr).join(', '):''}`});state.syncLog=state.syncLog.slice(0,300);return{source:'Spotrac',teams:ok.length,players:ok.reduce((n,r)=>n+(r.players||0),0),results,failures:failed}}
