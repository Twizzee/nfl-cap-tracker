import { readState, writeState } from './lib/stateRepo.js';
import { fetchHistoryYear, fetchDraftYear, fetchTeamYearOverview } from './featureData.js';

const fresh=(stamp,hours=24)=>stamp&&Date.now()-new Date(stamp).getTime()<hours*3600000;

export function attachFeatureRoutes(app){
  app.get('/api/history/:year',async(req,res)=>{try{
    const year=Math.max(2022,Math.min(2026,Number(req.params.year)||2026));
    const s=await readState();s.capHistory=s.capHistory||{};
    if(!s.capHistory[year]||!fresh(s.capHistory[year].updatedAt,72)){s.capHistory[year]=await fetchHistoryYear(year);await writeState(s);}
    res.json({ok:true,...s.capHistory[year]});
  }catch(e){res.status(502).json({ok:false,error:String(e.message||e)})}});

  app.get('/api/history/:team/:year',async(req,res)=>{try{
    const team=String(req.params.team||'').toUpperCase(),year=Math.max(2022,Math.min(2026,Number(req.params.year)||2026));
    const s=await readState();s.capHistory=s.capHistory||{};s.teamYearHistory=s.teamYearHistory||{};
    if(!s.capHistory[year]||!fresh(s.capHistory[year].updatedAt,72)){s.capHistory[year]=await fetchHistoryYear(year);}
    const key=`${team}-${year}`;
    if(!s.teamYearHistory[key]||!fresh(s.teamYearHistory[key].updatedAt,168)){s.teamYearHistory[key]=await fetchTeamYearOverview(team,year);}
    await writeState(s);
    const cap=s.capHistory[year].caps.find(x=>x.team===team)||null,pos=s.capHistory[year].positions.find(x=>x.team===team)||null;
    res.json({ok:true,team,year,cap,positions:pos?.positions||{},topContracts:s.teamYearHistory[key]?.topContracts||[],sourceUrls:[...(s.capHistory[year].sourceUrls||[]),s.teamYearHistory[key]?.sourceUrl].filter(Boolean)});
  }catch(e){res.status(502).json({ok:false,error:String(e.message||e)})}});

  app.get('/api/draft/:year',async(req,res)=>{try{
    const year=Math.max(2022,Math.min(2026,Number(req.params.year)||2026));
    const s=await readState();s.draftContracts=s.draftContracts||{};
    if(!s.draftContracts[year]||!fresh(s.draftContracts[year].updatedAt,48)){s.draftContracts[year]=await fetchDraftYear(year);await writeState(s);}
    res.json({ok:true,...s.draftContracts[year]});
  }catch(e){res.status(502).json({ok:false,error:String(e.message||e)})}});
}
