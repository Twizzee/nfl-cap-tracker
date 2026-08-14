import '/features.js?v=1';
import '/games.js?v=1';
import '/polish.js?v=1';

const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
let items=[],tier='ALL',loading=false,lastFetch=0;

function enableAnalytics(){
 if(q('script[data-caplab-analytics]'))return;
 window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};
 const s=document.createElement('script');s.defer=true;s.src='/_vercel/insights/script.js';s.dataset.caplabAnalytics='1';document.head.appendChild(s);
}
function tierOf(x){return String(x?.tier||'GENERAL').toUpperCase()}
function addText(parent,tag,text,cls){const e=document.createElement(tag);e.textContent=text||'';if(cls)e.className=cls;parent.appendChild(e);return e}
function render(){
 const feed=q('#transactionFeed');if(!feed)return;feed.textContent='';
 const rows=(tier==='ALL'?items:items.filter(x=>tierOf(x)===tier)).slice(0,180);
 if(!rows.length){addText(feed,'div','No current NFL stories returned. Try refresh again in a moment.','empty');return}
 for(const x of rows){
  const row=document.createElement('div');row.className='feed-item';addText(row,'div',tierOf(x),'type news-tier');
  const copy=document.createElement('div');copy.className='feed-copy';addText(copy,'strong',x.headline||'NFL news');addText(copy,'div',[x.type,x.team,x.position,x.source].filter(Boolean).join(' · '),'meta');if(x.description)addText(copy,'div',x.description,'meta move-desc');row.appendChild(copy);
  const side=document.createElement('div');side.className='feed-side';addText(side,'span',x.timestamp?new Date(x.timestamp).toLocaleString():'','meta');if(x.url){const a=document.createElement('a');a.className='news-link';a.href=x.url;a.target='_blank';a.rel='noreferrer';a.textContent='Source ↗';side.appendChild(a)}row.appendChild(side);feed.appendChild(row);
 }
 qa('.news-tier-filter').forEach(b=>b.classList.toggle('active-filter',(b.dataset.tier||'ALL')===tier));
}
async function load(force=false){
 if(loading||(!force&&Date.now()-lastFetch<45000))return;loading=true;const status=q('#lastSyncText');if(status)status.textContent='Checking live sources…';
 try{const r=await fetch(`/api/news?_=${Date.now()}`,{cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error||'News request failed');items=Array.isArray(j.items)?j.items:[];lastFetch=Date.now();render();if(status){const newest=items[0]?.timestamp;status.textContent=`Live sources checked ${new Date().toLocaleTimeString()}${newest?` · newest ${new Date(newest).toLocaleString()}`:''}`}}
 catch(e){if(status)status.textContent=`Live news error: ${e.message||e}`}
 finally{loading=false}
}
function bind(){
 const nav=q('[data-view="transactions"]');if(nav)nav.addEventListener('click',()=>setTimeout(()=>load(true),100));
 document.addEventListener('click',e=>{const b=e.target.closest?.('.news-tier-filter');if(b){tier=b.dataset.tier||'ALL';render()}});
 const panel=q('#transactions .panel-head');if(panel&&!q('#liveNewsRefresh')){const b=document.createElement('button');b.id='liveNewsRefresh';b.className='text-btn';b.textContent='↻ Refresh news';b.onclick=()=>load(true);panel.appendChild(b)}
 setInterval(()=>{if(q('#transactions')?.classList.contains('active'))load(true)},180000);
}
function boot(){enableAnalytics();setTimeout(bind,800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
