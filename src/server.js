import express from 'express';
import { syncEspn } from './espnSync.js';
import { syncAllContracts } from './capSync.js';
import { syncTeamCaps } from './teamCapSync.js';
import { syncMoveNews, fetchAllNews } from './newsSync.js';
import { syncStmLeague } from './stmSync.js';
import { syncSpotracLeague } from './spotracSync.js';
import { syncOtcContracts, enrichOtcPlayer } from './otcSync.js';
import { syncFreeAgents } from './freeAgencySync.js';
import { canonicalizePlayers } from './lib/playerMerge.js';
import { readState, writeState, storageMode, acquireSyncLock, releaseSyncLock } from './lib/stateRepo.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
const hasContractTerms=p=>Boolean(p?.sourceChecks?.Spotrac||p?.sourceChecks?.OTC);
const yearsLeftFromEnd=p=>{const end=Number(p?.contractEnd||p?.expirationYear||0);return end?Math.max(0,end-2026+1):null};

function summarize(s){return{teams:s.teams.length,players:s.players.filter(p=>p.status!=='removed').length,verified:s.players.filter(p=>p.status!=='removed'&&(p.contractStatus==='verified'||p.contractStatus==='confirmed')).length,contractTerms:s.players.filter(p=>p.status!=='removed'&&hasContractTerms(p)).length,freeAgents:(s.freeAgents||[]).length,news:(s.news||[]).length,lastSync:s.lastSync,lastContractSync:s.lastContractSync,lastSpotracSync:s.lastSpotracSync,lastOtcSync:s.lastOtcSync,lastFreeAgentSync:s.lastFreeAgentSync,lastTeamCapSync:s.lastTeamCapSync,lastNewsSync:s.lastNewsSync,lastFullSync:s.lastFullSync,storageMode:storageMode()};}
function contractDiagnostics(s){
 const active=s.players.filter(p=>p.status!=='removed');
 const spotrac=active.filter(p=>p.sourceChecks?.Spotrac);
 const withTerms=active.filter(p=>Number(p.totalValue||0)>0||Number(p.apy||0)>0);
 const withEnd=active.filter(p=>Number(p.contractEnd||p.expirationYear||0)>0);
 const withYearsLeft=active.filter(p=>Number.isFinite(Number(p.yearsLeft)));
 const missingYears=active.filter(p=>hasContractTerms(p)&&!Number(p.contractEnd||p.expirationYear||0));
 const yearsMismatch=active.filter(p=>{const calc=yearsLeftFromEnd(p);return calc!==null&&Number(p.yearsLeft)!==calc});
 const impossible=active.filter(p=>Number(p.apy||0)>Number(p.totalValue||0)&&Number(p.totalValue||0)>0);
 const guaranteeOverValue=active.filter(p=>Number(p.totalGuaranteed||0)>Number(p.totalValue||0)&&Number(p.totalValue||0)>0);
 const duplicates=[];const seen=new Map();for(const p of active){const k=`${p.team}:${String(p.name||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?\b/g,'').replace(/[^a-z0-9]/g,'')}`;if(seen.has(k))duplicates.push({team:p.team,name:p.name,other:seen.get(k)});else seen.set(k,p.name)}
 return{
  ok:missingYears.length===0&&yearsMismatch.length===0&&impossible.length===0&&guaranteeOverValue.length===0&&duplicates.length===0,
  counts:{active:active.length,spotrac:spotrac.length,withTerms:withTerms.length,withEnd:withEnd.length,withYearsLeft:withYearsLeft.length,missingYears:missingYears.length,yearsMismatch:yearsMismatch.length,apyOverValue:impossible.length,guaranteeOverValue:guaranteeOverValue.length,duplicates:duplicates.length},
  samples:{missingYears:missingYears.slice(0,20).map(p=>({team:p.team,name:p.name,source:p.contractSource||''})),yearsMismatch:yearsMismatch.slice(0,20).map(p=>({team:p.team,name:p.name,end:p.contractEnd,stored:p.yearsLeft,expected:yearsLeftFromEnd(p)})),apyOverValue:impossible.slice(0,10).map(p=>({team:p.team,name:p.name,apy:p.apy,totalValue:p.totalValue})),guaranteeOverValue:guaranteeOverValue.slice(0,10).map(p=>({team:p.team,name:p.name,guaranteed:p.totalGuaranteed,totalValue:p.totalValue})),duplicates:duplicates.slice(0,20)}
 };
}
function validateSync(s,result={}){const active=s.players.filter(p=>p.status!=='removed'),withCap=active.filter(p=>Number(p.capHit2026||0)>0).length,withTerms=active.filter(p=>hasContractTerms(p)&&(Number(p.apy||0)>0||Number(p.totalValue||0)>0)).length,withGuarantee=active.filter(p=>Number(p.totalGuaranteed||p.guaranteed2026||0)>0).length,withYearsLeft=active.filter(p=>Number.isFinite(Number(p.yearsLeft))).length,contractSourceOk=Number(result.spotrac?.teams||0)>=25||Number(result.otc?.matched||0)>=300;const checks={rosters:Boolean(result.roster?.validated)&&Number(result.roster?.teamsSynced||0)>=30,capTables:Number(result.stm?.teams||0)>=30&&withCap>=500,contractTerms:contractSourceOk&&withTerms>=300,guarantees:withGuarantee>=150,yearsLeft:withYearsLeft>=300,news:Number(result.news?.count||0)>0&&(s.news||[]).length>0,freeAgents:Number(result.freeAgents?.players||0)>=25,teamTotals:Number(result.teamCaps?.teams||0)>=20};return{ok:Object.values(checks).every(Boolean),checks,counts:{active:active.length,withCap,withTerms,withGuarantee,withYearsLeft,news:(s.news||[]).length,freeAgents:(s.freeAgents||[]).length,duplicatesMerged:Number(result.duplicatesMerged||0)}};}

app.get('/api/health',async(_req,res)=>{try{const s=await readState();res.json({ok:true,storage:storageMode(),summary:summarize(s),validation:s.lastValidation||null,now:new Date().toISOString()})}catch(error){res.status(500).json({ok:false,error:String(error.message||error)})}});
app.get('/api/debug/contracts',async(_req,res)=>{try{const s=await readState();res.json({ok:true,primarySource:'https://www.spotrac.com/nfl/contracts',lastFullSync:s.lastFullSync,lastSpotracSync:s.lastSpotracSync,diagnostics:contractDiagnostics(s),lastValidation:s.lastValidation||null})}catch(error){res.status(500).json({ok:false,error:String(error.message||error)})}});
app.get('/api/meta',async(_req,res)=>res.json({mode:process.env.VERCEL?'website':'local',storage:storageMode(),automaticUpdates:Boolean(process.env.VERCEL||process.env.AUTO_SYNC!=='false'),publicManualSync:true}));
app.get('/api/state',async(_req,res)=>{try{res.json(await readState())}catch(error){res.status(500).json({error:String(error.message||error)})}});
app.get('/api/news',async(_req,res)=>{try{const live=await fetchAllNews();if(live.items.length)return res.json({ok:true,live:true,items:live.items,sources:live.sources})}catch(error){console.error('Live multi-source news fetch failed:',error.message||error)}try{const s=await readState();res.json({ok:true,live:false,items:(s.news||[]).slice(0,300),sources:s.newsSources||{}})}catch(error){res.status(500).json({ok:false,error:String(error.message||error),items:[],sources:{}})}});
app.get('/api/team/:abbr',async(req,res)=>{const s=await readState(),abbr=req.params.abbr.toUpperCase(),team=s.teams.find(t=>t.abbr===abbr);if(!team)return res.status(404).json({error:'Unknown team'});res.json({team,players:s.players.filter(p=>p.team===abbr&&p.status!=='removed'),transactions:s.transactions.filter(t=>t.team===abbr).slice(0,100),news:(s.news||[]).filter(n=>!n.team||n.team===abbr).slice(0,50),summary:summarize(s)})});
app.post('/api/player/details',async(req,res)=>{try{const s=await readState(),team=String(req.body?.team||'').toUpperCase(),name=String(req.body?.name||''),p=s.players.find(x=>x.status!=='removed'&&x.team===team&&x.name===name);if(!p)return res.status(404).json({error:'Player not found'});if(p.espnId||p.sourceChecks?.ESPN||/ESPN/i.test(String(p.source||'')))p.sourceChecks={...(p.sourceChecks||{}),ESPN:true};if(p.otcUrl){await enrichOtcPlayer(p);await writeState(s);}res.json({ok:true,player:p})}catch(error){res.status(502).json({ok:false,error:String(error.message||error)})}});
app.post('/api/contracts',async(req,res)=>{const s=await readState(),{team,name}=req.body,p=s.players.find(x=>x.team===team&&x.name===name&&x.status!=='removed');if(!p)return res.status(404).json({error:'Player not found'});for(const f of ['capHit2026','baseSalary2026','guaranteed2026','totalGuaranteed','totalValue','apy','contractYears','yearsLeft','signedYear','contractEnd','deadCapCut2026','cutSavings2026'])if(req.body[f]!==undefined)p[f]=req.body[f];p.contractStatus='verified';p.contractSource=req.body.contractSource||'manual';p.contractUpdatedAt=new Date().toISOString();await writeState(s);res.json(p)});

async function fullSync(s){
 const result={};
 result.roster=await syncEspn(s).catch(e=>({error:String(e.message||e),teamsSynced:0,fullRosters:0,validated:false,failures:[]}));
 result.duplicatesMerged=canonicalizePlayers(s);
 await writeState(s);
 result.news=await syncMoveNews(s).catch(e=>({error:String(e.message||e),count:0,sources:{}}));await writeState(s);
 result.stm=await syncStmLeague(s).catch(e=>({error:String(e.message||e),teams:0,players:0,failures:[]}));await writeState(s);
 result.spotrac=await syncSpotracLeague(s).catch(e=>({error:String(e.message||e),teams:0,players:0,failures:[]}));await writeState(s);
 result.otc=await syncOtcContracts(s).catch(e=>({error:String(e.message||e),players:0,matched:0}));await writeState(s);
 result.freeAgents=await syncFreeAgents(s).catch(e=>({error:String(e.message||e),players:0}));await writeState(s);
 result.teamCaps=await syncTeamCaps(s).catch(e=>({error:String(e.message||e),teams:0}));await writeState(s);
 result.pfn=await syncAllContracts(s).catch(e=>[{error:String(e.message||e)}]);
 result.duplicatesMerged+=canonicalizePlayers(s);
 // Normalize years-left after all sources finish so late fallbacks cannot leave stale values.
 for(const p of s.players){if(p.status==='removed')continue;const left=yearsLeftFromEnd(p);if(left!==null){p.yearsLeft=left;if(!p.freeAgentYear)p.freeAgentYear=Number(p.contractEnd||p.expirationYear)+1;}}
 await writeState(s);
 s.lastFullSync=new Date().toISOString();result.validation=validateSync(s,result);s.lastValidation=result.validation;s.lastContractDiagnostics=contractDiagnostics(s);s.syncLog=s.syncLog||[];const newsSources=Object.entries(result.news.sources||{}).map(([k,v])=>`${k} ${v.ok?v.count:'ERR'}`).join(', ');s.syncLog.unshift({timestamp:s.lastFullSync,status:result.validation.ok?'ok':'partial',message:`Pipeline: ESPN rosters ${result.roster.teamsSynced||0}/32, STM ${result.stm.teams||0}/32, Spotrac primary ${result.spotrac.players||0} matches, OTC fallback ${result.otc.matched||0} matched, free agents ${result.freeAgents.players||0}, news ${result.news.count||0}${newsSources?` (${newsSources})`:''}, PFN caps ${result.teamCaps.teams||0}/32, duplicate records merged ${result.duplicatesMerged||0}. Years-left ${result.validation.counts.withYearsLeft||0}/${result.validation.counts.active||0}. Validation ${result.validation.ok?'PASS':'PARTIAL'}.`});s.syncLog=s.syncLog.slice(0,300);await writeState(s);return result;
}
async function runLockedSync(){const lock=await acquireSyncLock('full-sync',25);if(!lock.acquired)return{busy:true};try{const s=await readState(),result=await fullSync(s);return{busy:false,result,summary:summarize(s)}}finally{await releaseSyncLock('full-sync',lock.owner)}}
app.post('/api/sync/all',async(_req,res)=>{try{const run=await runLockedSync();if(run.busy)return res.status(409).json({error:'Sync already running'});res.json({ok:true,...run.result,summary:run.summary})}catch(error){res.status(500).json({error:String(error.message||error)})}});
app.post('/api/sync/news',async(_req,res)=>{try{const lock=await acquireSyncLock('news-sync',5);if(!lock.acquired)return res.status(409).json({error:'News sync already running'});try{const s=await readState(),result=await syncMoveNews(s);await writeState(s);res.json({ok:true,...result})}finally{await releaseSyncLock('news-sync',lock.owner)}}catch(error){res.status(500).json({error:String(error.message||error)})}});
app.get('/api/cron/sync',async(req,res)=>{const secret=process.env.CRON_SECRET,secretOk=Boolean(secret)&&req.headers.authorization===`Bearer ${secret}`,nativeVercelCron=String(req.headers['user-agent']||'').toLowerCase().includes('vercel-cron/1.0');if(!secretOk&&!nativeVercelCron)return res.status(401).json({error:'Unauthorized'});try{const run=await runLockedSync();if(run.busy)return res.status(409).json({error:'Sync already running'});res.json({ok:true,...run.result,summary:run.summary})}catch(error){res.status(500).json({error:String(error.message||error)})}});
export default app;
