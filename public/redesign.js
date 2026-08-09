const qs = (s, root = document) => root.querySelector(s);
const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));
const MONEY = n => `${Number(n || 0) < 0 ? '-' : ''}$${(Math.abs(Number(n || 0)) / 1e6).toFixed(1)}M`;
const SEASON = 2026;
const CAP = 301200000;
const PREV_CAP = 279200000;
const GROUPS = {
  QB:['QB'], RB:['RB','FB'], WR:['WR'], TE:['TE'],
  OL:['OL','OT','T','LT','RT','OG','G','LG','RG','C'],
  EDGE:['EDGE','ED','DE'], DL:['DL','DT','NT','IDL'],
  LB:['LB','ILB','OLB'], DB:['CB','DB','S','FS','SS'], ST:['K','P','PK','LS']
};
let state = null;
let syncing = false;

function groupFor(pos){
  const p = String(pos || '').toUpperCase();
  for (const [group, values] of Object.entries(GROUPS)) if (values.includes(p)) return group;
  return 'OTHER';
}

function setBrand(){
  const brand = qs('.brand');
  if (brand) brand.innerHTML = '<span class="logo">⌬</span><div><strong>Cap<span class="accent">Lab</span></strong><small>NFL salary cap intelligence</small></div>';
}

function setSidebar(){
  const nav = qs('.sidebar nav');
  const dash = qs('[data-view="dashboard"]');
  if (nav && dash && !qs('[data-view="teams"]')) dash.insertAdjacentHTML('afterend','<button class="nav" data-view="teams">Teams</button>');
  const labels = {roster:'Contracts', league:'Rankings', positions:'Positions', transactions:'Transactions', health:'Data Health'};
  for (const [view, text] of Object.entries(labels)) {
    const el = qs(`[data-view="${view}"]`);
    if (el) el.textContent = text;
  }
  const card = qs('.sync-card');
  if (card) {
    card.innerHTML = `
      <div class="salary-card-label">Salary Cap (2026) <span>ⓘ</span></div>
      <strong class="salary-card-value">$301.2M</strong>
      <span class="salary-card-sub">Official League Cap</span>
      <div class="salary-card-change"><span>Cap Change</span><strong>+${MONEY(CAP - PREV_CAP)}</strong><small>vs 2025</small></div>
      <div class="sidebar-refresh"><span id="syncStatus">Loading latest data…</span><button id="syncBtn" class="refresh-btn" title="Refresh league data">↻</button></div>`;
  }
}

function setTopbar(){
  if (qs('.app-topbar')) return;
  const main = qs('main');
  if (!main) return;
  main.insertAdjacentHTML('afterbegin', `
    <div class="app-topbar">
      <div class="global-search-shell"><input id="caplabSearch" placeholder="Search players, teams, contracts…"><span class="search-shortcut">⌘ K</span></div>
      <div class="topbar-spacer"></div>
      <div class="season-chip">2026 Season⌄</div>
      <div class="topbar-profile"><span class="profile-avatar">CL</span><div class="profile-copy"><strong>CapLab</strong><span>Cap Intelligence</span></div></div>
    </div>`);
  const input = qs('#caplabSearch');
  if (input) input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const query = input.value.trim();
    if (!query) return;
    const playersNav = qs('[data-view="players"]');
    if (playersNav) playersNav.click();
    setTimeout(() => {
      const search = qs('#globalPlayerSearch');
      if (!search) return;
      search.value = query;
      search.dispatchEvent(new Event('input', {bubbles:true}));
      search.focus();
    }, 60);
  });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (input) input.focus();
    }
  });
}

function makeTeamsView(){
  const oldDashboard = qs('#dashboard');
  if (!oldDashboard || qs('#teams')) return;
  const teams = document.createElement('section');
  teams.id = 'teams';
  teams.className = 'view';
  teams.innerHTML = '<div class="teams-breadcrumb">Teams <span>›</span> <strong id="teamCrumb">Team Overview</strong></div>';
  while (oldDashboard.firstChild) teams.appendChild(oldDashboard.firstChild);
  oldDashboard.insertAdjacentElement('afterend', teams);
  oldDashboard.innerHTML = `
    <div class="league-heading">
      <div><h2>League Dashboard</h2><p>Real-time NFL salary cap overview and league-wide insights.</p></div>
      <span class="league-updated" id="leagueUpdated">Loading…</span>
    </div>
    <div id="leagueDashboardBody"></div>`;
  const hero = qs('.hero', teams);
  if (hero && !qs('#teamBadge', hero)) {
    const left = hero.firstElementChild;
    if (left) {
      const original = left.innerHTML;
      left.classList.add('team-hero-left');
      left.innerHTML = `<div class="team-badge" id="teamBadge">NFL</div><div class="team-hero-copy">${original}</div>`;
    }
  }
}

function showView(id){
  qsa('.view').forEach(v => v.classList.toggle('active', v.id === id));
  qsa('.nav').forEach(n => n.classList.toggle('active', n.dataset.view === id));
  const header = qs('main > header');
  if (header) header.classList.toggle('league-header-hidden', id === 'dashboard');
  const title = qs('#pageTitle');
  if (title) title.textContent = id === 'dashboard' ? 'League Dashboard' : id === 'teams' ? 'Team Overview' : title.textContent;
  if (id === 'dashboard') renderLeague();
  if (id === 'teams') updateTeamChrome();
}

function updateTeamChrome(){
  const select = qs('#teamSelect');
  const abbr = select ? select.value : '';
  const teamName = qs('#teamName');
  const name = teamName ? teamName.textContent : (abbr || 'Team Overview');
  const crumb = qs('#teamCrumb');
  if (crumb) crumb.textContent = name;
  const badge = qs('#teamBadge');
  if (badge) badge.textContent = abbr || 'NFL';
}

function expirationCount(team){
  return (state && state.players ? state.players : []).filter(p => p.status !== 'removed' && p.team === team && Number(p.contractEnd || p.expirationYear || 0) === SEASON).length;
}

function leagueNews(){
  const transactions = state && state.transactions ? state.transactions : [];
  const news = state && state.news ? state.news : [];
  const all = [...transactions, ...news].filter(x => x && (x.headline || x.player)).sort((a,b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const seen = new Set();
  return all.filter(x => {
    const key = String(x.headline || x.player || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,5);
}

function renderLeague(){
  const body = qs('#leagueDashboardBody');
  if (!body || !state) return;
  const teams = [...(state.teams || [])];
  const players = (state.players || []).filter(p => p.status !== 'removed');
  const capSpace = teams.reduce((s,t) => s + Number(t.capSpace || 0), 0);
  const dead = teams.reduce((s,t) => s + Number(t.deadMoney || 0), 0);
  const active = teams.reduce((s,t) => s + Number(t.activeSpend || 0), 0);
  const apys = players.map(p => Number(p.apy || 0)).filter(Boolean);
  const avgApy = apys.length ? apys.reduce((a,b)=>a+b,0) / apys.length : 0;
  const ranked = [...teams].sort((a,b) => Number(b.capSpace || 0) - Number(a.capSpace || 0));
  const pos = Object.keys(GROUPS).map(g => {
    const amount = players.filter(p => groupFor(p.position) === g).reduce((s,p) => s + Number(p.capHit2026 || 0), 0);
    return {g, amount};
  }).filter(x => x.amount > 0).sort((a,b)=>b.amount-a.amount).slice(0,5);
  const maxPos = Math.max(1, ...pos.map(x=>x.amount));
  const years = [2026,2027,2028,2029].map(year => {
    const list = players.filter(p => Number(p.contractEnd || p.expirationYear || 0) === year);
    return {year, list, value:list.reduce((s,p)=>s+Number(p.totalValue||0),0), top:[...list].sort((a,b)=>Number(b.apy||0)-Number(a.apy||0)).slice(0,3)};
  });
  const news = leagueNews();
  const topCap = Math.max(1, Number(ranked[0] && ranked[0].capSpace ? ranked[0].capSpace : 1));
  body.innerHTML = `
    <div class="league-grid">
      <div class="league-main">
        <div class="league-metrics">
          <article><span>CAP SPACE</span><strong>${MONEY(capSpace)}</strong><small>Across 32 teams</small></article>
          <article><span>DEAD MONEY</span><strong>${MONEY(dead)}</strong><small>League total</small></article>
          <article><span>ACTIVE SPENDING</span><strong>${MONEY(active)}</strong><small>League total</small></article>
          <article><span>AVG APY</span><strong>${MONEY(avgApy)}</strong><small>League average</small></article>
        </div>
        <article class="panel league-rank-panel">
          <div class="panel-head"><h3>League Rankings</h3><button class="text-btn" data-jump="league">View Full Rankings ›</button></div>
          <div class="table-wrap"><table><thead><tr><th>#</th><th>TEAM</th><th>CAP SPACE</th><th>DEAD MONEY</th><th>ACTIVE SPENDING</th><th>EXPIRING CONTRACTS</th></tr></thead><tbody>
          ${ranked.slice(0,10).map((t,i)=>`<tr class="league-team-row" data-team="${t.abbr}"><td>${i+1}</td><td><strong class="team-code">${t.abbr}</strong><span class="team-name-small">${t.name}</span></td><td class="green-text">${MONEY(t.capSpace)}</td><td>${MONEY(t.deadMoney)}</td><td>${MONEY(t.activeSpend)}</td><td>${expirationCount(t.abbr)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="league-table-foot">Showing 1–10 of 32 teams <span>‹ &nbsp; <b>1</b> &nbsp; 2 &nbsp; 3 &nbsp; 4 &nbsp; ›</span></div>
        </article>
        <div class="league-bottom">
          <article class="panel"><div class="panel-head"><h3>Position Spending</h3><button class="text-btn" data-jump="positions">View All Positions ›</button></div><div class="league-pos-list">
            ${pos.map(x=>`<div><span>${x.g}</span><i><b style="width:${x.amount/maxPos*100}%"></b></i><strong>${MONEY(x.amount)}</strong></div>`).join('')}
          </div></article>
          <article class="panel"><div class="panel-head"><h3>Contract Expirations</h3><button class="text-btn" data-jump="expirations">View All Expirations ›</button></div><div class="expiration-mini">
            ${years.map(x=>`<div><strong>${x.year}${x.year===2029?'+':''}</strong><span>${x.list.length}</span><b>${MONEY(x.value)}</b><small>${x.top.map(p=>`${p.name} (${p.team})`).join(', ') || '—'}</small></div>`).join('')}
          </div></article>
        </div>
      </div>
      <aside class="league-side">
        <article class="panel"><div class="panel-head"><h3>Recent Transactions</h3><button class="text-btn" data-jump="transactions">View All</button></div>
          ${news.map(x=>`<div class="dash-news-row"><span class="news-type">${String(x.type||'NEWS').toUpperCase()}</span><div><strong>${x.headline||x.player}</strong><small>${[x.team,x.position,x.source].filter(Boolean).join(' · ')}</small></div><span>${x.timestamp?new Date(x.timestamp).toLocaleDateString():''}</span></div>`).join('') || '<div class="empty">No recent transactions loaded.</div>'}
        </article>
        <article class="panel"><div class="panel-head"><h3>Top Cap Space</h3><button class="text-btn" data-jump="league">View All</button></div><div class="capspace-bars">
          ${ranked.slice(0,5).map(t=>`<div data-team="${t.abbr}"><span>${t.abbr}</span><i><b style="width:${Math.max(3, Number(t.capSpace||0)/topCap*100)}%"></b></i><strong>${MONEY(t.capSpace)}</strong></div>`).join('')}
        </div></article>
      </aside>
    </div>`;
  qsa('[data-team]', body).forEach(el => el.addEventListener('click', () => openTeam(el.dataset.team)));
  qsa('[data-jump]', body).forEach(el => el.addEventListener('click', () => {
    const nav = qs(`[data-view="${el.dataset.jump}"]`);
    if (nav) nav.click();
  }));
  const updated = qs('#leagueUpdated');
  if (updated) updated.textContent = `Updated ${state.lastFullSync ? new Date(state.lastFullSync).toLocaleString() : 'not yet'}`;
}

function openTeam(abbr){
  const select = qs('#teamSelect');
  if (select) {
    select.value = abbr;
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }
  showView('teams');
  setTimeout(updateTeamChrome, 100);
}

async function loadState(){
  try {
    const response = await fetch('/api/state', {cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = await response.json();
    renderLeague();
    const status = qs('#syncStatus');
    if (status) status.textContent = state.lastFullSync ? `As of ${new Date(state.lastFullSync).toLocaleString()}` : 'Not updated yet';
  } catch (error) {
    const status = qs('#syncStatus');
    if (status) status.textContent = 'Data load failed';
    console.error(error);
  }
}

async function refreshAll(){
  if (syncing) return;
  syncing = true;
  const button = qs('#syncBtn');
  const status = qs('#syncStatus');
  if (button) { button.disabled = true; button.textContent = '…'; }
  if (status) status.textContent = 'Updating all 32 teams…';
  try {
    const response = await fetch('/api/sync/all', {method:'POST', headers:{'content-type':'application/json'}});
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || 'Update failed');
    await loadState();
    const select = qs('#teamSelect');
    if (select) select.dispatchEvent(new Event('change', {bubbles:true}));
  } catch (error) {
    if (status) status.textContent = `Update failed: ${error.message}`;
  } finally {
    syncing = false;
    if (button) { button.disabled = false; button.textContent = '↻'; }
  }
}

function bind(){
  const dash = qs('[data-view="dashboard"]');
  const teams = qs('[data-view="teams"]');
  if (dash) dash.addEventListener('click', e => { e.preventDefault(); showView('dashboard'); });
  if (teams) teams.addEventListener('click', e => { e.preventDefault(); showView('teams'); });
  const refresh = qs('#syncBtn');
  if (refresh) refresh.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); refreshAll(); });
  const select = qs('#teamSelect');
  if (select) select.addEventListener('change', () => setTimeout(updateTeamChrome, 80));
}

function init(){
  setBrand();
  setSidebar();
  setTopbar();
  makeTeamsView();
  bind();
  loadState();
  showView('dashboard');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), {once:true});
else setTimeout(init, 0);