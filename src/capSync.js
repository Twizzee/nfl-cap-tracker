const PFN_SLUGS = {
 ARI:'arizona-cardinals',ATL:'atlanta-falcons',BAL:'baltimore-ravens',BUF:'buffalo-bills',CAR:'carolina-panthers',CHI:'chicago-bears',CIN:'cincinnati-bengals',CLE:'cleveland-browns',DAL:'dallas-cowboys',DEN:'denver-broncos',DET:'detroit-lions',GB:'green-bay-packers',HOU:'houston-texans',IND:'indianapolis-colts',JAX:'jacksonville-jaguars',KC:'kansas-city-chiefs',LV:'las-vegas-raiders',LAC:'los-angeles-chargers',LAR:'los-angeles-rams',MIA:'miami-dolphins',MIN:'minnesota-vikings',NE:'new-england-patriots',NO:'new-orleans-saints',NYG:'new-york-giants',NYJ:'new-york-jets',PHI:'philadelphia-eagles',PIT:'pittsburgh-steelers',SF:'san-francisco-49ers',SEA:'seattle-seahawks',TB:'tampa-bay-buccaneers',TEN:'tennessee-titans',WAS:'washington-commanders'
};
function cleanText(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();}
function dollars(n){return Math.round(Number(n)*1e6)}
function normalizeName(s){return s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'');}
export function parsePfnContracts(html){
 const text=cleanText(html); const anchor=text.indexOf('Player Cap Hit Base Salary Guaranteed');
 if(anchor<0) throw new Error('PFN contract table not found');
 const body=text.slice(anchor+'Player Cap Hit Base Salary Guaranteed'.length);
 const re=/([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){1,4})\s+\$\s*([0-9.]+)\s*M\s+\$\s*([0-9.]+)\s*M\s+\$\s*([0-9.]+)\s*M/g;
 const rows=[]; let m;
 while((m=re.exec(body))){
   const name=m[1].trim(); if(/Potential Savings|Salary Cap|Active Roster/i.test(name)) continue;
   rows.push({name,capHit2026:dollars(m[2]),baseSalary2026:dollars(m[3]),guaranteed2026:dollars(m[4])});
 }
 return rows;
}
export async function fetchPfnContracts(abbr){
 const slug=PFN_SLUGS[abbr]; if(!slug) throw new Error(`No PFN slug for ${abbr}`);
 const url=`https://www.profootballnetwork.com/nfl-hq/teams/${slug}/salary-cap`;
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000); let res; try{res=await fetch(url,{signal:controller.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Lab/3.1','accept':'text/html'}});} finally{clearTimeout(timer);}
 if(!res.ok) throw new Error(`PFN ${abbr} HTTP ${res.status}`);
 return {url,rows:parsePfnContracts(await res.text())};
}
export async function syncContractsForTeam(state,abbr){
 const now=new Date().toISOString(); const {url,rows}=await fetchPfnContracts(abbr); let matched=0,added=0;
 const teamPlayers=state.players.filter(p=>p.team===abbr&&p.status!=='removed');
 for(const c of rows){
   let p=teamPlayers.find(x=>normalizeName(x.name)===normalizeName(c.name));
   if(!p){p={team:abbr,name:c.name,position:'',age:null,experience:null,college:'',status:'active',source:'PFN cap sync'};state.players.push(p);teamPlayers.push(p);added++;}
   Object.assign(p,c);
   p.contractStatus='verified'; p.contractSource='PFN'; p.contractSourceUrl=url; p.contractUpdatedAt=now;
   p.sourceChecks={...(p.sourceChecks||{}),PFN:true,ESPN:Boolean(p.espnId)||Boolean(p.sourceChecks?.ESPN)};
   matched++;
 }
 const team=state.teams.find(t=>t.abbr===abbr); if(team){team.contractsUpdatedAt=now;team.contractPlayerCount=rows.length;}
 return {abbr,matched,added,source:'PFN',url};
}
async function mapLimit(items,limit,fn){let i=0;const out=[];async function worker(){while(i<items.length){const idx=i++;try{out[idx]=await fn(items[idx],idx)}catch(e){out[idx]={abbr:items[idx].abbr,error:String(e.message||e)}}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;}
export async function syncAllContracts(state){const results=await mapLimit(state.teams,5,t=>syncContractsForTeam(state,t.abbr));state.lastContractSync=new Date().toISOString();return results;}
