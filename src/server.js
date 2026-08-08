import express from 'express';
import { syncEspn } from './espnSync.js';
import { syncAllContracts } from './capSync.js';
import { syncTeamCaps } from './teamCapSync.js';
import { syncMoveNews, fetchAllNews } from './newsSync.js';
import { syncStmLeague } from './stmSync.js';
import { syncSpotracLeague } from './spotracSync.js';
import { syncFreeAgents } from './freeAgencySync.js';
import { readState, writeState, storageMode, acquireSyncLock, releaseSyncLock } from './lib/stateRepo.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

function summarize(s) {
  return {
    teams: s.teams.length,
    players: s.players.filter(p => p.status !== 'removed').length,
    verified: s.players.filter(p => p.status !== 'removed' && (p.contractStatus === 'verified' || p.contractStatus === 'confirmed')).length,
    contractTerms: s.players.filter(p => p.status !== 'removed' && p.sourceChecks?.Spotrac).length,
    freeAgents: (s.freeAgents || []).length,
    news: (s.news || []).length,
    lastSync: s.lastSync,
    lastContractSync: s.lastContractSync,
    lastSpotracSync: s.lastSpotracSync,
    lastFreeAgentSync: s.lastFreeAgentSync,
    lastTeamCapSync: s.lastTeamCapSync,
    lastNewsSync: s.lastNewsSync,
    lastFullSync: s.lastFullSync,
    storageMode: storageMode()
  };
}

function validateSync(s,result={}){
  const active=s.players.filter(p=>p.status!=='removed');
  const withCap=active.filter(p=>Number(p.capHit2026||0)>0).length;
  const withTerms=active.filter(p=>p.sourceChecks?.Spotrac && (Number(p.apy||0)>0 || Number(p.totalValue||0)>0)).length;
  const withGuaranteeSource=active.filter(p=>p.sourceChecks?.Spotrac).length;
  const checks={
    rosters:Boolean(result.roster?.validated) && Number(result.roster?.teamsSynced||0)>=30,
    capTables:Number(result.stm?.teams||0)>=30 && withCap>=500,
    contractTerms:Number(result.spotrac?.teams||0)>=25 && withTerms>=300,
    guarantees:Number(result.spotrac?.teams||0)>=25 && withGuaranteeSource>=300,
    news:Number(result.news?.count||0)>0 && (s.news||[]).length>0,
    freeAgents:Number(result.freeAgents?.players||0)>=25,
    teamTotals:Number(result.teamCaps?.teams||0)>=20
  };
  return {ok:Object.values(checks).every(Boolean),checks,counts:{active:active.length,withCap,withTerms,withGuaranteeSource,news:(s.news||[]).length,freeAgents:(s.freeAgents||[]).length}};
}

app.get('/api/health', async (_req, res) => {
  try {
    const s = await readState();
    res.json({ ok: true, storage: storageMode(), summary: summarize(s), validation:s.lastValidation||null, now: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
});

app.get('/api/meta', async (_req, res) => {
  res.json({
    mode: process.env.VERCEL ? 'website' : 'local',
    storage: storageMode(),
    automaticUpdates: Boolean(process.env.VERCEL || process.env.AUTO_SYNC !== 'false'),
    publicManualSync: true
  });
});

app.get('/api/state', async (_req, res) => {
  try { res.json(await readState()); }
  catch (error) { res.status(500).json({ error: String(error.message || error) }); }
});

app.get('/api/news', async (_req,res)=>{
  try {
    const live=await fetchAllNews();
    if(live.items.length) return res.json({ok:true,live:true,items:live.items,sources:live.sources});
  } catch (error) {
    console.error('Live multi-source news fetch failed:',error.message||error);
  }
  try {
    const s=await readState();
    res.json({ok:true,live:false,items:(s.news||[]).slice(0,300),sources:s.newsSources||{}});
  } catch (error) {
    res.status(500).json({ok:false,error:String(error.message||error),items:[],sources:{}});
  }
});

app.get('/api/team/:abbr', async (req, res) => {
  const s = await readState();
  const abbr = req.params.abbr.toUpperCase();
  const team = s.teams.find(t => t.abbr === abbr);
  if (!team) return res.status(404).json({ error: 'Unknown team' });
  res.json({
    team,
    players: s.players.filter(p => p.team === abbr && p.status !== 'removed'),
    transactions: s.transactions.filter(t => t.team === abbr).slice(0, 100),
    news: (s.news || []).filter(n => !n.team || n.team === abbr).slice(0, 50),
    summary: summarize(s)
  });
});

app.post('/api/contracts', async (req, res) => {
  const s = await readState();
  const { team, name } = req.body;
  const p = s.players.find(x => x.team === team && x.name === name && x.status !== 'removed');
  if (!p) return res.status(404).json({ error: 'Player not found' });
  for (const f of ['capHit2026','baseSalary2026','guaranteed2026','totalGuaranteed','totalValue','apy','contractYears','yearsLeft','signedYear','contractEnd','deadCapCut2026','cutSavings2026']) {
    if (req.body[f] !== undefined) p[f] = req.body[f];
  }
  p.contractStatus = 'verified';
  p.contractSource = req.body.contractSource || 'manual';
  p.contractUpdatedAt = new Date().toISOString();
  await writeState(s);
  res.json(p);
});

async function fullSync(s) {
  const result = {};
  result.roster = await syncEspn(s).catch(e => ({ error: String(e.message || e), teamsSynced: 0, fullRosters: 0, validated: false, failures: [] }));
  await writeState(s);
  result.news = await syncMoveNews(s).catch(e => ({ error: String(e.message || e), count:0, sources:{} }));
  await writeState(s);
  result.stm = await syncStmLeague(s).catch(e => ({ error: String(e.message || e), teams: 0, players: 0, failures: [] }));
  await writeState(s);
  result.spotrac = await syncSpotracLeague(s).catch(e => ({ error: String(e.message || e), teams: 0, players: 0, failures: [] }));
  await writeState(s);
  result.freeAgents = await syncFreeAgents(s).catch(e => ({ error: String(e.message || e), players: 0 }));
  await writeState(s);
  result.teamCaps = await syncTeamCaps(s).catch(e => ({ error: String(e.message || e), teams: 0 }));
  await writeState(s);
  result.pfn = await syncAllContracts(s).catch(e => [{ error: String(e.message || e) }]);
  await writeState(s);
  s.lastFullSync = new Date().toISOString();
  result.validation=validateSync(s,result);
  s.lastValidation=result.validation;
  s.syncLog = s.syncLog || [];
  const newsSources=Object.entries(result.news.sources||{}).map(([k,v])=>`${k} ${v.ok?v.count:'ERR'}`).join(', ');
  s.syncLog.unshift({
    timestamp: s.lastFullSync,
    status: result.validation.ok ? 'ok' : 'partial',
    message: `Pipeline: ESPN rosters ${result.roster.teamsSynced || 0}/32, STM ${result.stm.teams || 0}/32, Spotrac ${result.spotrac.teams || 0}/32, free agents ${result.freeAgents.players || 0}, news ${result.news.count || 0}${newsSources?` (${newsSources})`:''}, PFN caps ${result.teamCaps.teams || 0}/32. Validation ${result.validation.ok?'PASS':'PARTIAL'}.`
  });
  s.syncLog = s.syncLog.slice(0, 300);
  await writeState(s);
  return result;
}

async function runLockedSync() {
  const lock = await acquireSyncLock('full-sync', 25);
  if (!lock.acquired) return { busy: true };
  try {
    const s = await readState();
    const result = await fullSync(s);
    return { busy: false, result, summary: summarize(s) };
  } finally {
    await releaseSyncLock('full-sync', lock.owner);
  }
}

app.post('/api/sync/all', async (_req, res) => {
  try {
    const run = await runLockedSync();
    if (run.busy) return res.status(409).json({ error: 'Sync already running' });
    res.json({ ok: true, ...run.result, summary: run.summary });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/sync/news', async (_req, res) => {
  try {
    const lock = await acquireSyncLock('news-sync', 5);
    if (!lock.acquired) return res.status(409).json({ error: 'News sync already running' });
    try {
      const s = await readState();
      const result = await syncMoveNews(s);
      await writeState(s);
      res.json({ ok: true, ...result });
    } finally {
      await releaseSyncLock('news-sync', lock.owner);
    }
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get('/api/cron/sync', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const secretOk=Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
  const nativeVercelCron=String(req.headers['user-agent']||'').toLowerCase().includes('vercel-cron/1.0');
  if (!secretOk && !nativeVercelCron) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const run = await runLockedSync();
    if (run.busy) return res.status(409).json({ error: 'Sync already running' });
    res.json({ ok: true, ...run.result, summary: run.summary });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

export default app;
