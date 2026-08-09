import { findCanonicalPlayer } from './lib/playerMerge.js';

const TEAM_ALIASES={JAC:'JAX',WSH:'WAS',LA:'LAR'};
function normAbbr(v){const a=String(v||'').toUpperCase();return TEAM_ALIASES[a]||a}
function normName(s){return String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}
function money(s){
  const v=String(s||'').replace(/,/g,'').trim();
  if(!v || v==='—' || v==='-') return 0;
  const m=v.match(/\$?([0-9.]+)\s*([MKB])?/i); if(!m) return 0;
  const mult={M:1e6,K:1e3,B:1e9}[String(m[2]||'').toUpperCase()]||1;
  return Math.round(Number(m[1])*mult);
}
function cleanName(s){return String(s||'').replace(/\b(?:UNDERPAID|OVERPAID)\b/gi,'').replace(/\s+/g,' ').trim()}
function textFallback(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}

export function parseStmRoster(html){
  const rows=[]; const seen=new Set();
  const trRe=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi; let tr;
  while((tr=trRe.exec(html))){
    const cells=[]; const tdRe=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi; let td;
    while((td=tdRe.exec(tr[1]))){cells.push(textFallback(td[1]));}
    if(cells.length<7 || /^player$/i.test(cells[0])) continue;
    const name=cleanName(cells[0]),pos=String(cells[1]||'').trim();
    if(!name || !pos || !/\$|—|-/.test(cells[2]||'')) continue;
    const k=normName(name); if(seen.has(k)) continue; seen.add(k);
    rows.push({name,position:pos==='ED'?'EDGE':pos,capHit2026:money(cells[2]),worth2026:money(cells[3]),baseSalary2026:money(cells[4]),deadCapCut2026:money(cells[5]),cutSavings2026:money(cells[6])});
  }
  if(rows.length>=20) return rows;
  const t=textFallback(html); const anchor=t.search(/Player\s+Pos\s+Cap Hit\s+Worth\s+Base\s+Dead \$\s+Cut Savings/i);
  if(anchor<0) return rows;
  const body=t.slice(anchor);
  const re=/([A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){1,5})(?:\s+(?:UNDERPAID|OVERPAID))?\s+([A-Z]{1,4})\s+(\$[0-9.]+[MKB]?|—)\s+(\$[0-9.]+[MKB]?|—)\s+(\$[0-9.]+[MKB]?|—)\s+(\$[0-9.]+[MKB]?|—)\s+(\$[0-9.]+[MKB]?|—)/g;
  let m;
  while((m=re.exec(body))){const name=cleanName(m[1]);if(/^(?:Player|Cut Savings|Dead Money|Cap Scenario)/i.test(name))continue;const k=normName(name);if(seen.has(k))continue;seen.add(k);rows.push({name,position:m[2]==='ED'?'EDGE':m[2],capHit2026:money(m[3]),worth2026:money(m[4]),baseSalary2026:money(m[5]),deadCapCut2026:money(m[6]),cutSavings2026:money(m[7])});}
  return rows;
}

export function parseStmTeamSummary(html){
  const text=textFallback(html);
  const m=text.match(/2026 Salary Cap\s+\$([0-9.]+[MKB]?)\s+\d+(?:st|nd|rd|th)\s+Cap Space\s+\$([0-9.]+[MKB]?)\s+\d+(?:st|nd|rd|th)\s+Active Cap\s+\$([0-9.]+[MKB]?)\s+\d+(?:st|nd|rd|th)\s+Dead Cap\s+\$([0-9.]+[MKB]?)\s+\d+(?:st|nd|rd|th)\s+Top-51/i);
  if(!m) return null;
  return {capSpace:money(m[1]),activeSpend:money(m[2]),deadMoney:money(m[3]),top51Spend:money(m[4])};
}
async function fetchWithTimeout(url,ms=15000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 NFL-Cap-Tracker/4.2','accept':'text/html,application/xhtml+xml'}})}finally{clearTimeout(t)}}
export async function fetchStmTeam(abbr){abbr=normAbbr(abbr);const url=`https://sticktothemodel.com/teams/${abbr}/roster`;const r=await fetchWithTimeout(url,18000);if(!r.ok)throw new Error(`StickToTheModel ${abbr} HTTP ${r.status}`);const html=await r.text();const rows=parseStmRoster(html),summary=parseStmTeamSummary(html);if(rows.length<20)throw new Error(`StickToTheModel ${abbr} parser found only ${rows.length} players`);return {url,rows,summary}}
function mergeTeam(state,abbr,data,now){
  let matched=0,unmatched=0;
  for(const c of data.rows){
    const p=findCanonicalPlayer(state,abbr,c.name);
    if(!p){unmatched++;continue;}
    p.position=p.position||c.position;
    p.capHit2026=c.capHit2026;
    p.worth2026=c.worth2026;
    p.baseSalary2026=c.baseSalary2026;
    p.deadCapCut2026=c.deadCapCut2026;
    p.cutSavings2026=c.cutSavings2026;
    p.contractStatus='verified';
    p.contractSource=[p.contractSource,'StickToTheModel'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' + ');
    p.contractSourceUrl=data.url;p.contractUpdatedAt=now;p.sourceChecks={...(p.sourceChecks||{}),STM:true};matched++;
  }
  const t=state.teams.find(x=>x.abbr===abbr);if(t){t.contractsUpdatedAt=now;t.contractPlayerCount=matched;t.contractSource='StickToTheModel';t.contractUnmatchedCount=unmatched;if(data.summary){Object.assign(t,data.summary);t.capSource='StickToTheModel';t.capUpdatedAt=now;}}
  return {abbr,matched,unmatched,players:data.rows.length,url:data.url};
}
async function mapLimit(items,limit,fn){let i=0;const out=[];async function worker(){while(i<items.length){const idx=i++;try{out[idx]=await fn(items[idx],idx)}catch(e){out[idx]={abbr:items[idx]?.abbr,error:String(e.message||e)}}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;}
export async function syncStmLeague(state){const now=new Date().toISOString();const results=await mapLimit(state.teams,6,async t=>mergeTeam(state,t.abbr,await fetchStmTeam(t.abbr),now));const ok=results.filter(r=>!r.error);const failed=results.filter(r=>r.error);state.lastStmSync=now;state.syncLog=state.syncLog||[];state.syncLog.unshift({timestamp:now,status:ok.length>=30?'ok':'partial',message:`StickToTheModel contract sync: ${ok.length}/32 teams, ${ok.reduce((n,r)=>n+(r.matched||0),0)} matched roster players, ${ok.reduce((n,r)=>n+(r.unmatched||0),0)} unmatched source rows.${failed.length?' Failed: '+failed.map(x=>x.abbr).join(', '):''}`});state.syncLog=state.syncLog.slice(0,300);return {source:'StickToTheModel',teams:ok.length,players:ok.reduce((n,r)=>n+(r.matched||0),0),results,failures:failed};}
