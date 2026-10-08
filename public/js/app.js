'use strict';
/* ============================== constants ============================== */
const THEME_KEY = 'moneyLeakTracker.theme';
const STATE_VERSION = 2;
const CURRENCIES = ['EUR','USD','GBP','CHF','CAD','AUD','INR','JPY','SEK','NOK','DKK','PLN'];
const KEEP_OPTIONS = [[0,'Everything (recommended)'],[24,'Last 24 months'],[36,'Last 3 years'],[60,'Last 5 years']];
const DEFAULT_CATS = [
  ['groceries','Groceries','#16a34a','expense',400],
  ['dining','Eating out & delivery','#f97316','expense',150],
  ['coffee','Coffee & snacks','#a16207','expense',40],
  ['transport','Transport & fuel','#0ea5e9','expense',150],
  ['housing','Housing & utilities','#6366f1','expense',0],
  ['loans','Loans & credit','#7c3aed','expense',0],
  ['subs','Subscriptions & phone','#db2777','expense',60],
  ['shopping','Shopping','#8b5cf6','expense',150],
  ['health','Health','#14b8a6','expense',0],
  ['leisure','Leisure & sport','#eab308','expense',80],
  ['travel','Travel','#06b6d4','expense',0],
  ['fees','Bank fees','#dc2626','expense',0],
  ['cash','Cash withdrawals','#78716c','expense',0],
  ['other','Other','#94a3b8','expense',0],
  ['uncat','Uncategorized','#cbd5e1','expense',0],
  ['income','Income','#059669','income',0],
  ['savings','Savings & own transfers','#0f766e','transfer',0],
];
// the app's own logic depends on these: they can be renamed and recoloured, but not deleted or retyped
const PROTECTED_CATS = new Set(['uncat','income','loans']);
const DEFAULT_RULES = {
  groceries:['carrefour','monoprix','leclerc','auchan','lidl','franprix','intermarche','casino','picard','aldi','super u','hyper u','biocoop','naturalia','la grande epicerie','g20','netto','grand frais','cora','spar','metro','marche'],
  dining:['restaurant','resto','uber eats','ubereats','deliveroo','just eat','mcdonald','mcdo','burger king','kfc','sushi','pizza','brasserie','bistrot','five guys','o tacos','subway','creperie','traiteur'],
  coffee:['starbucks','cafe','boulangerie','columbus','relay','brioche doree','tabac','patisserie','pret a manger','costa'],
  transport:['sncf','ratp','navigo','uber','bolt','heetch','blablacar','totalenergies','total','esso','shell','avia','autoroute','vinci','sanef','aprr','parking','indigo','velib','lime','dott','transilien','ouigo','tgv','peage','carburant','station'],
  housing:['loyer','edf','engie','veolia','assurance habitation','syndic','taxe fonciere','taxe habitation','totalenergies electricite','ekwateur','gaz','mma','maif','macif','axa'],
  loans:['pret','pret immo','pret immobilier','credit immo','credit immobilier','credit auto','credit conso','echeance pret','remboursement pret','rembt pret','cetelem','cofidis','sofinco','franfinance','younited','oney','floa','diac','rci banque','psa banque','stellantis financial','volkswagen bank','bmw finance','mercedes benz financial','ca consumer finance','carrefour banque','creatis','loa','lld'],
  subs:['netflix','spotify','deezer','disney','canal+','canal plus','amazon prime','prime video','apple com','itunes','apple','google','youtube','free mobile','freebox','orange','sfr','bouygues','sosh','red by sfr','icloud','chatgpt','openai','adobe','microsoft','dropbox','audible','molotov','dazn','bein'],
  shopping:['amazon','fnac','darty','boulanger','zara','h&m','uniqlo','decathlon','sephora','ikea','leroy merlin','castorama','cdiscount','vinted','zalando','action','kiabi','primark','galeries lafayette','printemps','apple store','nocibe','shein','temu','aliexpress','gifi','la redoute'],
  health:['pharmacie','doctolib','medecin','docteur','dentiste','mutuelle','kine','opticien','laboratoire','hopital','clinique','osteopathe'],
  leisure:['cinema','ugc','pathe','gaumont','mk2','basic fit','basic-fit','fitness','neoness','salle de sport','steam','playstation','xbox','nintendo','ticketmaster','fnac spectacles','musee','concert','bowling','escape'],
  travel:['airbnb','booking','air france','easyjet','ryanair','transavia','vueling','hotel','accor','ibis','expedia','hostel','lastminute','opodo','eurostar','sixt','hertz','europcar'],
  fees:['frais','commission','cotisation carte','cotisation','agios','cotis','interets debiteurs'],
  cash:['retrait','dab','withdrawal','atm'],
  income:['salaire','paie','remuneration','caf','cpam','france travail','pole emploi','remboursement','prime','dividende','interets','salary','payroll'],
  savings:['livret a','ldds','lep','pel','cel','epargne','assurance vie','pea','virement interne','vers compte']
};
const STOP = new Set(['cb','carte','card','prlv','prelevement','prelev','sepa','paiement','paiemt','achat','facture','fact','vir','virement','sct','inst','instantane','recu','emis','du','de','des','le','la','les','et','pour','au','aux','en','payment','pos','purchase','debit','credit','ref','www','com','fr','net','sa','sas','sarl','eur','euro','paris','france','fra','sc','ech','echeance','mandat','mdt','ics','rum','lib','date','op']);

/* ============================== tiny helpers ============================== */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
// RFC 4122 v4 ids: the database uses uuid primary keys
const uid = () => crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
const isUUID = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ''));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const norm = s => fold(s).replace(/[^a-z0-9&+]+/g,' ').replace(/\s+/g,' ').trim();
const clean = s => norm(s).split(' ').filter(w => w.length > 1 && !/\d/.test(w) && !STOP.has(w)).join(' ');
const merchantKey = s => clean(s).split(' ').slice(0,2).join(' ') || norm(s).slice(0,24) || '(blank)';
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
const sum = a => a.reduce((s,v) => s + v, 0);
function curMonth(){ const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth()+1); }
function todayISO(){ const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addMonths(m, n){ let [y,mo] = m.split('-').map(Number); mo += n; while (mo > 12){ mo -= 12; y++; } while (mo < 1){ mo += 12; y--; } return y + '-' + pad(mo); }
function lastN(m, n){ const a = []; for (let i = n-1; i >= 0; i--) a.push(addMonths(m, -i)); return a; }
function mLabel(m, long){ const [y,mo] = m.split('-').map(Number); return new Date(y, mo-1, 1).toLocaleDateString(undefined, long ? {month:'long', year:'numeric'} : {month:'short', year:'2-digit'}); }
function dLabel(d){ const [y,m,dd] = d.split('-').map(Number); return new Date(y, m-1, dd).toLocaleDateString(undefined, {day:'numeric', month:'short'}); }
const nfCache = {};
function money(v, dec){
  if (dec == null) dec = (Math.abs(v) < 100 && Math.round(v*100) % 100 !== 0) ? 2 : 0;
  const k = state.settings.currency + dec;
  if (!nfCache[k]) { try { nfCache[k] = new Intl.NumberFormat(undefined, {style:'currency', currency: state.settings.currency, minimumFractionDigits: dec, maximumFractionDigits: dec}); } catch(e){ nfCache[k] = new Intl.NumberFormat(undefined, {minimumFractionDigits: dec, maximumFractionDigits: dec}); } }
  return nfCache[k].format(v);
}
const pct = v => v == null || !isFinite(v) ? '—' : Math.round(v*100) + '%';
function toast(msg, err){ const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.className = '', 3800); }
function download(name, text, type){ const b = new Blob([text], {type}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const cloud = () => Store.mode === 'cloud';

/* ============================== state ============================== */
function defaultState(){
  return {
    version: STATE_VERSION,
    categories: DEFAULT_CATS.map(([id,name,color,type,budget]) => ({id,name,color,type,budget})),
    rules: Object.entries(DEFAULT_RULES).flatMap(([cat,kws]) => kws.map(kw => ({kw, cat}))),
    txns: [],
    loans: [],
    settings: {currency:'EUR', savingsGoal:20, smallThreshold:15, keepMonths:0, lastBackup:null}
  };
}
// Validates anything loaded from storage, the database or a backup file, and upgrades older versions.
function migrate(o){
  const d = defaultState();
  if (!o || typeof o !== 'object') return d;
  const os = o.settings && typeof o.settings === 'object' ? o.settings : {};
  const s = {...d, settings: {...d.settings, ...os}};
  s.settings.currency = CURRENCIES.includes(s.settings.currency) ? s.settings.currency : 'EUR';
  s.settings.savingsGoal = Math.min(90, Math.max(0, +s.settings.savingsGoal || 0));
  s.settings.smallThreshold = Math.max(1, +s.settings.smallThreshold || 15);
  s.settings.keepMonths = KEEP_OPTIONS.some(([n]) => n === +s.settings.keepMonths) ? +s.settings.keepMonths : 0;
  if ((+o.version || 1) < 2 && os.autoPrune) s.settings.keepMonths = 24;   // v1 deleted after 12 months; loans need last year in full
  delete s.settings.autoPrune;

  s.categories = (Array.isArray(o.categories) && o.categories.length ? o.categories : d.categories)
    .filter(c => c && c.id != null)
    .map(c => ({id: String(c.id), name: String(c.name ?? c.id).slice(0, 60), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8',
      type: ['expense','income','transfer'].includes(c.type) ? c.type : 'expense', budget: Math.max(0, +c.budget || 0)}));
  for (const id of PROTECTED_CATS){
    const def = d.categories.find(c => c.id === id), have = s.categories.find(c => c.id === id);
    if (!have) s.categories.push({...def}); else have.type = def.type;
  }
  s.rules = (Array.isArray(o.rules) ? o.rules : d.rules).filter(r => r && typeof r.kw === 'string' && r.cat != null).map(r => ({kw: r.kw, cat: String(r.cat)}));
  if ((+o.version || 1) < 2){
    const have = new Set(s.rules.map(r => norm(r.kw)));
    DEFAULT_RULES.loans.forEach(kw => { if (!have.has(kw)) s.rules.push({kw, cat:'loans'}); });
  }
  s.txns = (Array.isArray(o.txns) ? o.txns : [])
    .filter(t => t && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(Number(t.amount)))
    .map(t => ({id: isUUID(t.id) ? t.id : uid(), date: t.date, desc: String(t.desc ?? ''), amount: Math.round(Number(t.amount) * 100) / 100, cat: String(t.cat ?? 'uncat'),
      ...(t.note ? {note: String(t.note)} : {}), ...(t.src ? {src: String(t.src)} : {})}));
  s.loans = (Array.isArray(o.loans) ? o.loans : []).map(cleanLoan).filter(Boolean);
  return s;
}
function save(){ catMap = null; ruleCache = null; Store.save(); }
let state = defaultState();
Store.bind(() => state);
let catMap = null, ruleCache = null;
function catOf(id){
  if (!catMap) catMap = new Map(state.categories.map(c => [c.id, c]));
  return catMap.get(id) || catMap.get('uncat') || {id:'uncat', name:'Uncategorized', color:'#cbd5e1', type:'expense', budget:0};
}
function matchCat(desc){
  if (!ruleCache) ruleCache = state.rules.map(r => ({k: ' ' + norm(r.kw) + ' ', cat: r.cat})).filter(r => r.k.trim() && state.categories.some(c => c.id === r.cat)).sort((a,b) => b.k.length - a.k.length);
  const n = ' ' + norm(desc) + ' ', c = ' ' + clean(desc) + ' ';
  for (const r of ruleCache) if (n.includes(r.k) || c.includes(r.k)) return r.cat;
  return null;
}
// Rules match on text only, so check the direction too: money going out is never "income"
// (e.g. "PRLV REMBOURSEMENT PRET" would otherwise match the income keyword "remboursement").
function suggestCat(desc, amount){
  const c = matchCat(desc);
  if (c && !(amount < 0 && catOf(c).type === 'income')) return c;
  return amount > 0 ? 'income' : 'uncat';
}
const autoCat = t => suggestCat(t.desc, t.amount);
const txKey = t => t.date + '|' + Number(t.amount).toFixed(2) + '|' + norm(t.desc);
function pruneCutoff(){ const n = state.settings.keepMonths; return n ? addMonths(curMonth(), -(n - 1)) + '-01' : null; }
function pruneOld(){
  const cutoff = pruneCutoff(); if (!cutoff) return 0;
  const before = state.txns.length;
  state.txns = state.txns.filter(t => t.date >= cutoff);
  return before - state.txns.length;
}

/* ============================== aggregation ============================== */
function monthsWithData(){ return [...new Set(state.txns.map(t => t.date.slice(0,7)))].sort().reverse(); }
function hasData(m){ return state.txns.some(t => t.date.startsWith(m)); }
function monthStats(m){
  let inc = 0, exp = 0, sav = 0, n = 0;
  for (const t of state.txns){
    if (!t.date.startsWith(m)) continue; n++;
    const ty = catOf(t.cat).type;
    if (ty === 'income') inc += t.amount; else if (ty === 'expense') exp -= t.amount; else sav -= t.amount;
  }
  return {inc, exp, net: inc - exp, rate: inc > 0 ? (inc - exp) / inc : null, sav, n};
}
function spendByCat(m){
  const r = {};
  for (const t of state.txns){
    if (!t.date.startsWith(m)) continue;
    const c = catOf(t.cat); if (c.type !== 'expense') continue;
    r[c.id] = (r[c.id] || 0) - t.amount;
  }
  return r;
}
function avgSpend(endMonth, n){
  const ms = lastN(endMonth, n).filter(hasData);
  const out = {}; if (!ms.length) return out;
  for (const m of ms){ const s = spendByCat(m); for (const k in s) out[k] = (out[k] || 0) + s[k]; }
  for (const k in out) out[k] /= ms.length;
  return out;
}
function topCat(arr){ const c = {}; arr.forEach(t => c[t.cat] = (c[t.cat] || 0) + 1); return Object.entries(c).sort((a,b) => b[1] - a[1])[0]?.[0]; }

function computeInsights(m){
  const S = state.settings;
  const set12 = new Set(lastN(m, 12)), recent6 = new Set(lastN(m, 6));
  const isExp = t => catOf(t.cat).type === 'expense' && t.amount < 0;
  const exp12 = state.txns.filter(t => set12.has(t.date.slice(0,7)) && isExp(t));

  // recurring charges: same merchant, similar amount, in >=3 of the last 6 months, about once a month
  const groups = new Map();
  for (const t of exp12){ const k = merchantKey(t.desc); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const recurring = [], recurringKeys = new Set();
  for (const [k, arr] of groups){
    const ms = new Set(arr.map(t => t.date.slice(0,7)));
    if ([...ms].filter(x => recent6.has(x)).length < 3) continue;
    if (arr.length / ms.size > 1.5) continue;
    const amts = arr.map(t => -t.amount).sort((a,b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    if (amts.filter(a => Math.abs(a - med) <= Math.max(1.5, med * .15)).length / amts.length < .7) continue;
    const last = arr.reduce((a,t) => t.date > a ? t.date : a, '');
    if (last.slice(0,7) < addMonths(m, -1)) continue; // stopped
    const cat = topCat(arr);
    if (['groceries','dining','coffee','shopping'].includes(cat)) continue; // everyday spending, not a subscription
    recurring.push({key:k, name:titleCase(k), monthly:med, annual:med*12, months:ms.size, last, cat});
    recurringKeys.add(k);
  }
  recurring.sort((a,b) => b.annual - a.annual);
  const discretionaryRec = recurring.filter(r => !['housing','loans','savings','income'].includes(r.cat));
  const recAnnual = sum(discretionaryRec.map(r => r.annual));

  // small purchases
  const th = S.smallThreshold;
  const isSmall = t => isExp(t) && -t.amount <= th && !recurringKeys.has(merchantKey(t.desc));
  const smallM = state.txns.filter(t => t.date.startsWith(m) && isSmall(t));
  const smallTotal = -sum(smallM.map(t => t.amount));
  const small3Months = lastN(m, 3).filter(hasData);
  const smallAvg = small3Months.length ? sum(small3Months.map(mm => -sum(state.txns.filter(t => t.date.startsWith(mm) && isSmall(t)).map(t => t.amount)))) / small3Months.length : 0;
  const smallByM = {};
  smallM.forEach(t => { const k = merchantKey(t.desc); (smallByM[k] = smallByM[k] || {name:titleCase(k), n:0, total:0}); smallByM[k].n++; smallByM[k].total -= t.amount; });
  const smallTop = Object.values(smallByM).sort((a,b) => b.total - a.total).slice(0,5);

  // categories: over budget, rising
  const cur = spendByCat(m), prevAvg = avgSpend(addMonths(m,-1), 3), havePrev = lastN(addMonths(m,-1),3).some(hasData);
  const overBudget = [], rising = [];
  for (const c of state.categories){
    if (c.type !== 'expense') continue;
    const v = cur[c.id] || 0;
    if (c.budget > 0 && v > c.budget) overBudget.push({cat:c, spent:v, budget:c.budget, excess:v - c.budget});
    const a = prevAvg[c.id] || 0;
    if (havePrev && c.id !== 'uncat' && v > a * 1.25 && v - a >= 25) rising.push({cat:c, spent:v, avg:a, diff:v - a});
  }
  overBudget.sort((a,b) => b.excess - a.excess); rising.sort((a,b) => b.diff - a.diff);

  // top merchants this month
  const tm = {};
  state.txns.filter(t => t.date.startsWith(m) && isExp(t)).forEach(t => { const k = merchantKey(t.desc); (tm[k] = tm[k] || {name:titleCase(k), n:0, total:0, cat:t.cat}); tm[k].n++; tm[k].total -= t.amount; });
  const topMerchants = Object.values(tm).sort((a,b) => b.total - a.total).slice(0,8);

  const fees12 = -sum(exp12.filter(t => t.cat === 'fees').map(t => t.amount));
  const uncat = state.txns.filter(t => set12.has(t.date.slice(0,7)) && catOf(t.cat).id === 'uncat').length;
  const st = monthStats(m);
  const target = st.inc * S.savingsGoal / 100, gap = target - st.net;

  const dining3 = avgSpend(m, 3).dining || 0;
  const levers = [];
  if (smallAvg > 0) levers.push({title:`Halve small purchases (≤ ${money(th)})`, detail:`${smallM.length} small purchases this month, ${money(smallTotal)} in total — they add up to about ${money(smallAvg*12,0)} a year.`, save: smallAvg * 12 * .5});
  if (discretionaryRec.length) levers.push({title:`Review ${discretionaryRec.length} recurring charge${discretionaryRec.length>1?'s':''}`, detail:`Subscriptions & regular charges cost ${money(recAnnual,0)} a year. Estimate assumes you cancel or downgrade a quarter of them.`, save: recAnnual * .25});
  if (overBudget.length) levers.push({title:`Bring ${overBudget.length} categor${overBudget.length>1?'ies':'y'} back on budget`, detail: overBudget.map(o => `${o.cat.name} +${money(o.excess,0)}`).join(' · '), save: sum(overBudget.map(o => o.excess)) * 12});
  if (dining3 > 0 && !overBudget.some(o => o.cat.id === 'dining')) levers.push({title:'Cook one more meal a week (−30% eating out)', detail:`You spend about ${money(dining3,0)} a month eating out and on delivery.`, save: dining3 * 12 * .3});
  if (fees12 >= 20) levers.push({title:'Cut bank fees', detail:`${money(fees12,0)} in bank fees over 12 months — many online banks charge nothing.`, save: fees12});
  const lv = levers.filter(l => l.save >= 10).sort((a,b) => b.save - a.save);
  return {recurring, recAnnual, discretionaryRec, smallM, smallTotal, smallAvg, smallTop, overBudget, rising, topMerchants, fees12, uncat, st, target, gap, levers: lv, potential: sum(lv.map(l => l.save))};
}

/* ============================== ui state & routing ============================== */
const ui = {tab:'dashboard', month: curMonth(), tx:{month:null, cat:'', q:''}, imp:null, ruleQ:''};
const TABS = ['dashboard','insights','loans','transactions','import','setup'];
let charts = {}, appStarted = false;
function go(tab){ if (!TABS.includes(tab)) tab = 'dashboard'; ui.tab = tab; if (location.hash !== '#' + tab) history.replaceState(null, '', location.pathname + location.search + '#' + tab); render(); window.scrollTo(0,0); }
function render(){
  if (!appStarted) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  Object.values(charts).forEach(c => c.destroy()); charts = {};
  ({dashboard:renderDashboard, insights:renderInsights, loans:renderLoans, transactions:renderTransactions, import:renderImport, setup:renderSetup})[ui.tab]();
}
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function chart(id, cfg){
  const el = document.getElementById(id); if (!el) return;
  if (!window.Chart){ const box = el.parentElement; box.style.height = 'auto'; box.innerHTML = '<p class="muted small">Charts need an internet connection to load.</p>'; return; }
  Chart.defaults.color = cssVar('--muted'); Chart.defaults.borderColor = cssVar('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  charts[id] = new Chart(el, cfg);
}
function monthPicker(){
  const ms = new Set(monthsWithData()); ms.add(curMonth()); ms.add(ui.month);
  const arr = [...ms].sort().reverse();
  return `<div class="monthbar"><button class="icon-btn" data-action="month" data-d="-1" aria-label="Previous month">‹</button>
    <select id="monthSel" aria-label="Month">${arr.map(m => `<option value="${m}" ${m === ui.month ? 'selected' : ''}>${mLabel(m,true)}</option>`).join('')}</select>
    <button class="icon-btn" data-action="month" data-d="1" aria-label="Next month">›</button></div>`;
}
function emptyState(){
  return `<div class="card empty"><h2>Let's find where your money goes</h2>
    <p>Import a CSV export from your bank (or several, one per account), or add expenses by hand. The app categorises everything, keeps your history and points out the leaks.</p>
    <div class="row"><button class="btn primary" data-goto="import">Import bank CSV</button><button class="btn" data-action="openAdd">Add an expense</button><button class="btn" data-action="demo">Try with demo data</button></div></div>`;
}
function backupBanner(){
  if (Store.status === 'error' && !cloud()) return `<div class="banner">Browser storage isn't available, so changes won't survive a reload. <button class="btn" data-action="exportJSON">Export backup</button></div>`;
  if (!state.txns.length || hasDemoData()) return '';
  const lb = state.settings.lastBackup, days = lb ? (Date.now() - new Date(lb)) / 864e5 : Infinity;
  if (days < (cloud() ? 90 : 30)) return '';
  const why = cloud() ? 'Your data is safe in the database, but a copy of your own is good insurance.' : 'Your data lives only in this browser — clearing site data would erase it.';
  return `<div class="banner"><span>${lb ? `Last backup was ${Math.floor(days)} days ago.` : 'You haven’t made a backup yet.'} ${why}</span><button class="btn" data-action="exportJSON">Export backup</button></div>`;
}
const hasDemoData = () => state.txns.some(t => t.src === 'demo') || state.loans.some(l => l.src === 'demo');
const onlyDemoData = () => hasDemoData() && state.txns.every(t => t.src === 'demo') && state.loans.every(l => l.src === 'demo');
// Shown on every page while example data is loaded, so it's obvious how to get back to a real budget
function demoBanner(){
  if (!hasDemoData()) return '';
  return onlyDemoData()
    ? `<div class="banner info"><span>You're exploring <b>demo data</b>. When you're ready, start your own budget from scratch.</span><button class="btn primary" data-action="newBudget">Start my real budget</button></div>`
    : `<div class="banner info"><span>Your budget still contains <b>demo data</b> next to your own.</span><button class="btn" data-action="removeDemo">Remove demo data</button></div>`;
}
// A clean slate: default categories and rules, but no budget amounts, no transactions and no loans.
// Personal preferences (currency, goals, history length) are kept.
function freshState(){
  const s = defaultState(), o = state.settings;
  s.categories.forEach(c => c.budget = 0);
  s.settings = {...s.settings, currency: o.currency, savingsGoal: o.savingsGoal, smallThreshold: o.smallThreshold, keepMonths: o.keepMonths, lastBackup: o.lastBackup};
  return s;
}

/* ============================== dashboard ============================== */
function renderDashboard(){
  const v = $('#view');
  if (!state.txns.length){ v.innerHTML = `<div class="pagehead"><h1>Dashboard</h1></div>` + emptyState() + (state.loans.length ? `<div class="grid" style="margin-top:16px">${loansDashCard()}</div>` : ''); return; }
  const m = ui.month, prev = addMonths(m, -1), s = monthStats(m), p = monthStats(prev), goal = state.settings.savingsGoal;
  const dExp = s.exp - p.exp;
  const sp = spendByCat(m);
  const cats = Object.entries(sp).filter(([,x]) => x > .005).sort((a,b) => b[1] - a[1]);
  const I = computeInsights(m);
  const months = lastN(m, 12), stats = months.map(monthStats);
  const budgeted = state.categories.filter(c => c.type === 'expense' && c.budget > 0);
  const rateCls = s.rate == null ? '' : s.rate * 100 >= goal ? 'ok' : s.rate < 0 ? 'bad' : 'warnc';

  v.innerHTML = `${demoBanner()}${backupBanner()}
  <div class="pagehead"><h1>Dashboard</h1>${monthPicker()}</div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span>Income</span><strong>${money(s.inc,0)}</strong><small>${p.n ? (s.inc >= p.inc ? '▲ ' : '▼ ') + money(Math.abs(s.inc - p.inc),0) + ' vs ' + mLabel(prev) : '&nbsp;'}</small></div>
    <div class="card kpi"><span>Spending</span><strong>${money(s.exp,0)}</strong><small class="${p.n ? (dExp > 0 ? 'bad' : 'ok') : ''}">${p.n ? (dExp > 0 ? '▲ ' : '▼ ') + money(Math.abs(dExp),0) + ' vs ' + mLabel(prev) : '&nbsp;'}</small></div>
    <div class="card kpi"><span>Saved this month</span><strong style="color:${s.net >= 0 ? 'var(--good)' : 'var(--danger)'}">${money(s.net,0)}</strong><small>${s.sav > 0 ? money(s.sav,0) + ' moved to savings' : 'income − spending'}</small></div>
    <div class="card kpi"><span>Savings rate</span><strong>${pct(s.rate)}</strong><small class="${rateCls}">Goal ${goal}%${s.rate != null && s.rate*100 < goal && I.gap > 0 ? ' · ' + money(I.gap,0) + ' short' : s.rate != null ? ' · on track' : ''}</small></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>Where it went</h2><p class="sub">${mLabel(m,true)} spending by category</p>
      ${cats.length ? `<div class="chartbox sm"><canvas id="donut"></canvas></div>
      <ul class="catlist" style="margin-top:12px">${cats.map(([id,val]) => { const c = catOf(id); const b = c.budget; const r = b ? val / b : 0;
        return `<li><span class="dot" style="background:${esc(c.color)}"></span><span>${esc(c.name)}</span><span class="amt">${money(val,0)}</span>
        <span class="meta">${s.exp > 0 ? Math.round(val / s.exp * 100) + '% of spending' : ''}${b ? ` · budget ${money(b,0)} <span class="bar"><i class="${r > 1 ? 'over' : r > .85 ? 'near' : ''}" style="width:${Math.min(100, r*100)}%"></i></span>` : ''}</span></li>`; }).join('')}</ul>`
      : '<p class="muted">No spending recorded for this month.</p>'}
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><h2>Last 12 months</h2><p class="sub">Income vs spending, with savings rate</p><div class="chartbox"><canvas id="trend"></canvas></div></div>
      <div class="card"><h2>Biggest savings levers</h2><p class="sub">${I.potential > 0 ? `Roughly <b style="color:var(--good)">${money(I.potential,0)}/year</b> on the table` : 'Based on your last 3–12 months'}</p>
        ${I.levers.length ? I.levers.slice(0,3).map((l,i) => `<div class="lever"><span class="n">${i+1}</span><div class="t"><b>${esc(l.title)}</b><small>${esc(l.detail)}</small></div><span class="v">${money(l.save,0)}/yr</span></div>`).join('') : '<p class="muted small">Not enough history yet — insights get sharper after 2–3 months of data.</p>'}
        <div style="margin-top:10px"><button class="btn" data-goto="insights">See all leaks →</button></div>
      </div>
      ${loansDashCard()}
    </div>
    ${budgeted.length ? `<div class="card span2"><h2>Budgets</h2><p class="sub">${mLabel(m,true)} · ${budgeted.filter(c => (sp[c.id]||0) > c.budget).length} over budget</p>
      <div class="grid g2" style="gap:6px 28px">${budgeted.map(c => { const val = sp[c.id] || 0, r = val / c.budget;
        return `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:5px"><span><span class="dot" style="display:inline-block;background:${esc(c.color)};margin-right:6px"></span>${esc(c.name)}</span><span class="${r > 1 ? '' : 'muted'}" style="${r > 1 ? 'color:var(--danger);font-weight:600' : ''}">${money(val,0)} / ${money(c.budget,0)}</span></div><div class="bar"><i class="${r > 1 ? 'over' : r > .85 ? 'near' : ''}" style="width:${Math.min(100, r*100)}%"></i></div></div>`; }).join('')}</div></div>` : ''}
  </div>`;

  if (cats.length) chart('donut', {type:'doughnut', data:{labels: cats.map(([id]) => catOf(id).name), datasets:[{data: cats.map(([,x]) => Math.round(x*100)/100), backgroundColor: cats.map(([id]) => catOf(id).color), borderColor: cssVar('--surface'), borderWidth: 2}]},
    options:{maintainAspectRatio:false, cutout:'62%', plugins:{legend:{display:false}, tooltip:{callbacks:{label: c => ` ${c.label}: ${money(c.raw,0)}`}}}}});
  chart('trend', {data:{labels: months.map(x => mLabel(x)), datasets:[
      {type:'bar', label:'Income', data: stats.map(x => Math.round(x.inc)), backgroundColor: cssVar('--good'), borderRadius:4, order:2},
      {type:'bar', label:'Spending', data: stats.map(x => Math.round(x.exp)), backgroundColor: '#f97316', borderRadius:4, order:2},
      {type:'line', label:'Savings rate', data: stats.map(x => x.rate == null ? null : Math.round(x.rate*100)), yAxisID:'y1', borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), tension:.3, pointRadius:3, spanGaps:true, order:1}]},
    options:{maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
      plugins:{legend:{position:'bottom', labels:{boxWidth:10, boxHeight:10}}, tooltip:{callbacks:{label: c => c.dataset.yAxisID === 'y1' ? ` Savings rate: ${c.raw}%` : ` ${c.dataset.label}: ${money(c.raw,0)}`}}},
      scales:{x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback: v => money(v,0)}}, y1:{position:'right', grid:{display:false}, ticks:{callback: v => v + '%'}, suggestedMin:0, suggestedMax:50}}}});
}

/* ============================== insights ============================== */
function renderInsights(){
  const v = $('#view');
  if (!state.txns.length){ v.innerHTML = `<div class="pagehead"><h1>Leaks &amp; savings</h1></div>` + emptyState(); return; }
  const m = ui.month, I = computeInsights(m), S = state.settings;
  v.innerHTML = `${demoBanner()}<div class="pagehead"><h1>Leaks &amp; savings</h1>${monthPicker()}</div>
  ${I.uncat ? `<div class="banner info"><span>${I.uncat} transaction${I.uncat>1?'s are':' is'} uncategorised in the last 12 months — categorising them sharpens these insights.</span><button class="btn" data-action="showUncat">Categorise now</button></div>` : ''}
  <div class="grid g2">
    <div class="card span2"><div class="hero"><div><h2>Estimated savings potential</h2><p class="sub mt0">If you act on the levers below — based on ${mLabel(m,true)} and the months before it.</p></div><div class="big">${money(I.potential,0)}<span style="font-size:16px;font-weight:600">/yr</span></div></div>
      ${I.levers.length ? I.levers.map((l,i) => `<div class="lever"><span class="n">${i+1}</span><div class="t"><b>${esc(l.title)}</b><small>${esc(l.detail)}</small></div><span class="v">${money(l.save,0)}/yr</span></div>`).join('') : '<p class="muted">No obvious leaks found yet. Insights sharpen after 2–3 months of data.</p>'}
    </div>
    <div class="card"><h2>Savings goal</h2><p class="sub">Target: save ${S.savingsGoal}% of income</p>
      ${I.st.inc > 0 ? `<table><tr><td>Income</td><td class="num">${money(I.st.inc,0)}</td></tr><tr><td>Spending</td><td class="num">${money(I.st.exp,0)}</td></tr><tr><td>Saved</td><td class="num"><b>${money(I.st.net,0)}</b> (${pct(I.st.rate)})</td></tr><tr><td>Goal</td><td class="num">${money(I.target,0)}</td></tr></table>
      <p style="margin:12px 0 0">${I.gap > 0 ? `<span class="pill warn">${money(I.gap,0)} short</span> Cutting about <b>${money(I.gap,0)}</b> a month would hit your goal.` : `<span class="pill good">On track</span> You beat your goal by ${money(-I.gap,0)}.`}</p>` : '<p class="muted">No income recorded this month, so the savings rate can’t be calculated.</p>'}
    </div>
    <div class="card"><h2>Small purchases</h2><p class="sub">Each ≤ ${money(S.smallThreshold)} — the classic leak</p>
      <div style="display:flex;gap:24px;margin-bottom:10px"><div class="kpi"><span>This month</span><strong>${money(I.smallTotal,0)}</strong><small>${I.smallM.length} purchases</small></div><div class="kpi"><span>Yearly pace</span><strong>${money(I.smallAvg*12,0)}</strong><small>3-month average × 12</small></div></div>
      ${I.smallTop.length ? `<table><tr><th>Where</th><th class="num">Times</th><th class="num">Total</th></tr>${I.smallTop.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${x.n}×</td><td class="num">${money(x.total)}</td></tr>`).join('')}</table>` : ''}
    </div>
    <div class="card span2"><h2>Recurring charges</h2><p class="sub">Charged about once a month for at least 3 of the last 6 months · subscriptions & bills total <b>${money(I.recAnnual,0)}/year</b> (excluding housing, loans & savings)</p>
      ${I.recurring.length ? `<div class="tablewrap"><table><tr><th>Charge</th><th class="hide-sm">Category</th><th class="num">Monthly</th><th class="num">Yearly</th><th class="num">Last</th></tr>
      ${I.recurring.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="hide-sm"><span class="dot" style="display:inline-block;background:${esc(catOf(r.cat).color)};margin-right:6px"></span>${esc(catOf(r.cat).name)}</td><td class="num">${money(r.monthly)}</td><td class="num">${money(r.annual,0)}</td><td class="num muted">${dLabel(r.last)}</td></tr>`).join('')}</table></div>
      <p class="small muted" style="margin:10px 0 0">Ask yourself for each one: did I use it last month? Would I sign up again today?</p>` : '<p class="muted">None detected yet — needs at least 3 months of data.</p>'}
    </div>
    <div class="card"><h2>Over budget</h2><p class="sub">${mLabel(m,true)}</p>
      ${I.overBudget.length ? `<table>${I.overBudget.map(o => `<tr><td>${esc(o.cat.name)}</td><td class="num">${money(o.spent,0)} / ${money(o.budget,0)}</td><td class="num"><span class="pill bad">+${money(o.excess,0)}</span></td></tr>`).join('')}</table>` : `<p class="muted">${state.categories.some(c => c.budget > 0) ? 'Everything is within budget. 👏' : 'No budgets set yet.'} <a href="#setup">Set budgets</a></p>`}
    </div>
    <div class="card"><h2>Rising categories</h2><p class="sub">vs your previous 3-month average</p>
      ${I.rising.length ? `<table>${I.rising.map(o => `<tr><td>${esc(o.cat.name)}</td><td class="num">${money(o.spent,0)} <span class="muted small">vs ${money(o.avg,0)}</span></td><td class="num"><span class="pill warn">+${money(o.diff,0)}</span></td></tr>`).join('')}</table>` : '<p class="muted">No category jumped noticeably this month.</p>'}
    </div>
    <div class="card"><h2>Top merchants</h2><p class="sub">Where most of ${mLabel(m,true)}'s money went</p>
      ${I.topMerchants.length ? `<table>${I.topMerchants.map(x => `<tr><td>${esc(x.name)}<div class="small muted">${esc(catOf(x.cat).name)}</div></td><td class="num muted">${x.n}×</td><td class="num"><b>${money(x.total,0)}</b></td></tr>`).join('')}</table>` : '<p class="muted">No spending this month.</p>'}
    </div>
    <div class="card"><h2>Bank fees</h2><p class="sub">Last 12 months</p>
      <div class="kpi"><strong style="color:${I.fees12 > 0 ? 'var(--danger)' : 'var(--good)'}">${money(I.fees12,0)}</strong><small>${I.fees12 >= 20 ? 'Worth comparing with a no-fee bank.' : 'Low — nice.'}</small></div>
    </div>
  </div>`;
}

/* ============================== transactions ============================== */
function catOptions(sel, withAll){
  const groups = [['expense','Spending'],['income','Income'],['transfer','Transfers']];
  return (withAll ? `<option value="">All categories</option>` : '') + groups.map(([ty,label]) => {
    const cs = state.categories.filter(c => c.type === ty).sort((a,b) => (a.id === 'uncat') - (b.id === 'uncat') || a.name.localeCompare(b.name));
    return cs.length ? `<optgroup label="${label}">${cs.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}
function renderTransactions(){
  const ms = monthsWithData();
  // only pre-filter on a month the filter can actually show, otherwise the select says "All months" while the list is filtered
  if (ui.tx.month === null) ui.tx.month = ms.includes(ui.month) ? ui.month : '';
  $('#view').innerHTML = `${demoBanner()}<div class="pagehead"><h1>Transactions</h1><div class="btnrow"><button class="btn" data-action="exportCSV">Export CSV</button><button class="btn primary" data-action="openAdd">+ Add</button></div></div>
  <div class="card">
    <div class="filters">
      <select class="inp" id="fMonth"><option value="">All months</option>${ms.map(m => `<option value="${m}" ${m === ui.tx.month ? 'selected' : ''}>${mLabel(m,true)}</option>`).join('')}</select>
      <select class="inp" id="fCat">${catOptions(ui.tx.cat, true)}</select>
      <input class="inp" id="fQ" type="search" placeholder="Search description or note…" value="${esc(ui.tx.q)}">
    </div>
    <div id="txList"></div>
  </div>`;
  updateTxList();
}
function updateTxList(){
  const f = ui.tx; let list = state.txns.slice();
  if (f.month) list = list.filter(t => t.date.startsWith(f.month));
  if (f.cat) list = list.filter(t => catOf(t.cat).id === f.cat);
  if (f.q){ const q = norm(f.q); list = list.filter(t => norm(t.desc + ' ' + (t.note || '')).includes(q)); }
  list.sort((a,b) => b.date.localeCompare(a.date) || a.desc.localeCompare(b.desc));
  const out = -sum(list.filter(t => catOf(t.cat).type === 'expense').map(t => t.amount));
  const inc = sum(list.filter(t => catOf(t.cat).type === 'income').map(t => t.amount));
  const shown = list.slice(0, 500);
  $('#txList').innerHTML = list.length ? `<div class="summary"><span>${list.length} transaction${list.length>1?'s':''}${list.length > 500 ? ' (showing 500)' : ''}</span><span>Spent ${money(out,0)} · Income ${money(inc,0)}</span></div>
    ${shown.map(t => `<div class="tx"><div class="tx-date">${dLabel(t.date)}</div>
      <div style="min-width:0"><div class="tx-desc" title="${esc(t.desc)}">${esc(t.desc)}</div>${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}<select data-action="setCat" data-id="${esc(t.id)}" aria-label="Category">${catOptions(catOf(t.cat).id)}</select></div>
      <div class="tx-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount,2)}</div>
      <button class="icon-btn sm" data-action="delTx" data-id="${esc(t.id)}" title="Delete" aria-label="Delete">×</button></div>`).join('')}`
    : `<p class="muted" style="padding:20px 4px">No transactions match. ${state.txns.length ? '' : '<a href="#import">Import a bank CSV</a> to get started.'}</p>`;
}
function setCategory(id, cat){
  const t = state.txns.find(x => x.id === id); if (!t) return;
  t.cat = cat;
  const k = merchantKey(t.desc), c = catOf(cat);
  const similar = state.txns.filter(x => x !== t && merchantKey(x.desc) === k && catOf(x.cat).id !== cat);
  if (similar.length && confirm(`Also move ${similar.length} other "${titleCase(k)}" transaction${similar.length>1?'s':''} to ${c.name}, and categorise future ones automatically?`)){
    similar.forEach(x => x.cat = cat);
    addRule(k, cat);
    toast(`Moved ${similar.length + 1} transactions and saved a rule`);
    save(); updateTxList(); return;
  }
  save(); toast(`Set to ${c.name}`);
  if (ui.tx.cat) updateTxList();
}
function addRule(kw, cat){
  kw = norm(kw); if (!kw) return;
  const ex = state.rules.find(r => norm(r.kw) === kw);
  if (ex) ex.cat = cat; else state.rules.unshift({kw, cat});
}

/* ============================== import ============================== */
function detectDelim(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 25);
  let best = ',', bestScore = -1;
  for (const d of [';', ',', '\t', '|']){
    const counts = lines.map(l => l.split(d).length - 1).filter(c => c > 0);
    if (!counts.length) continue;
    const freq = {}; counts.forEach(c => freq[c] = (freq[c] || 0) + 1);
    const [mode, n] = Object.entries(freq).sort((a,b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = n * 10 + Number(mode);
    if (score > bestScore){ bestScore = score; best = d; }
  }
  return best;
}
function splitCSV(text, d){
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (q){ if (c === '"'){ if (text[i+1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f.trim() === '') { q = true; f = ''; }
    else if (c === d){ row.push(f); f = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && text[i+1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length){ row.push(f); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}
function mkDate(y, m, d){
  y = +y; m = +m; d = +d; if (y < 100) y += 2000;
  // reject impossible dates such as 31/02, which would otherwise show up as early March
  if (!(m >= 1 && m <= 12 && y > 1990 && y < 2100 && d >= 1 && d <= new Date(y, m, 0).getDate())) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parseDate(s, fmt){
  s = String(s ?? '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return mkDate(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/))) return fmt === 'mdy' ? mkDate(m[3], m[1], m[2]) : mkDate(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return mkDate(m[1], m[2], m[3]);
  return null;
}
function detectDateFmt(vals){
  let dmy = 0, mdy = 0;
  for (const v of vals){ const m = String(v ?? '').trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.]\d{2,4}/); if (!m) continue; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; }
  return mdy > dmy ? 'mdy' : 'dmy';
}
function parseAmount(s){
  if (s == null) return null; s = String(s).trim(); if (!s) return null;
  s = s.replace(/[\u2212\u2012\u2013\u2014]/g, '-');   // typographic minus/dashes used by some bank exports
  let neg = false;
  if (/^\(.*\)$/.test(s)){ neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s\u00a0\u202f'€$£¥₹]|[a-zA-Z]/g, '');
  if (s.endsWith('-')){ neg = true; s = s.slice(0, -1); }
  if (!/\d/.test(s)) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1){ s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); }
  else if (lc > -1){ s = (s.split(',').length > 2) ? s.replace(/,/g, '') : s.replace(',', '.'); }
  else if (s.split('.').length > 2) s = s.replace(/\./g, '');
  const v = parseFloat(s); if (!isFinite(v)) return null;
  return neg ? -Math.abs(v) : v;
}
function guessMap(header, data){
  const H = header.map(norm);
  const find = (re, not) => H.findIndex(h => re.test(h) && !(not && not.test(h)));
  const sample = data.slice(0, 40);
  const share = (i, fn) => sample.length ? sample.filter(r => fn(r[i])).length / sample.length : 0;
  let date = find(/date|datum|fecha/, /valeur|value|valuta/); if (date < 0) date = find(/date/);
  if (date < 0 || share(date, x => parseDate(x)) < .5) date = header.findIndex((_, i) => share(i, x => parseDate(x)) > .6);
  let amount = find(/montant|amount|somme|^valeur$|^value$|betrag|importe/, /date|devise|currency/);
  let debit = find(/debit|withdraw|sortie|paid out|money out/), credit = find(/credit|deposit|entree|paid in|money in/);
  if (amount >= 0 && share(amount, x => parseAmount(x) != null) < .5) amount = -1;
  if (amount < 0 && (debit < 0 || credit < 0)){ amount = header.findIndex((_, i) => i !== date && share(i, x => parseAmount(x) != null && !parseDate(x)) > .8); }
  if (amount >= 0){ debit = -1; credit = -1; }
  let desc = find(/libell|descr|label|wording|detail|merchant|payee|intitul|nature|objet|memo|beneficiaire|name|narrative|reference|operation/, /date|montant|amount|debit|credit|type|categor/);
  if (desc < 0){ let best = -1, bl = 0; header.forEach((_, i) => { if (i === date || i === amount || i === debit || i === credit) return; const l = sum(sample.map(r => (r[i] || '').length)); if (l > bl){ bl = l; best = i; } }); desc = best; }
  return {date, desc, amount, debit, credit};
}
function startImport(text, name){
  text = String(text || '').replace(/^\uFEFF/, '');
  if (!text.trim()){ toast('That file looks empty', true); return; }
  const d = detectDelim(text), rows = splitCSV(text, d);
  if (!rows.length){ toast('Couldn’t find any rows in that file — is it a CSV export?', true); return; }
  const freq = {}; rows.forEach(r => freq[r.length] = (freq[r.length] || 0) + 1);
  const mode = +Object.entries(freq).sort((a,b) => b[1] - a[1] || b[0] - a[0])[0][0];
  if (mode < 2){ toast('Couldn’t find columns in that file — is it a CSV export?', true); return; }
  let hi = rows.findIndex(r => r.length >= mode);
  const looksData = rows[hi].some(c => parseDate(c)) && rows[hi].some(c => parseAmount(c) != null && !parseDate(c));
  const header = looksData ? rows[hi].map((_, i) => `Column ${i+1}`) : rows[hi].map((h, i) => h || `Column ${i+1}`);
  const data = rows.slice(looksData ? hi : hi + 1).filter(r => r.length >= 2);
  const map = guessMap(header, data);
  ui.imp = {name, header, data, map, datefmt: map.date >= 0 ? detectDateFmt(data.map(r => r[map.date])) : 'dmy', invert:false, account:''};
  renderImport();
}
function buildImport(){
  const I = ui.imp, M = I.map, out = []; let errors = 0;
  for (const r of I.data){
    const date = M.date >= 0 ? parseDate(r[M.date], I.datefmt) : null;
    let amt;
    if (M.amount >= 0) amt = parseAmount(r[M.amount]);
    else { const dv = M.debit >= 0 ? parseAmount(r[M.debit]) : null, cv = M.credit >= 0 ? parseAmount(r[M.credit]) : null; amt = (dv == null && cv == null) ? null : (cv || 0) - Math.abs(dv || 0); }
    if (!date || amt == null || !isFinite(amt)){ errors++; continue; }
    if (I.invert) amt = -amt;
    const desc = String(M.desc >= 0 ? (r[M.desc] ?? '') : '').replace(/\s+/g, ' ').trim() || '(no description)';
    out.push({id: uid(), date, desc, amount: Math.round(amt * 100) / 100, src:'csv', ...(I.account ? {note: I.account} : {})});
  }
  const ex = new Map(); state.txns.forEach(t => { const k = txKey(t); ex.set(k, (ex.get(k) || 0) + 1); });
  const fresh = []; let dupes = 0;
  for (const t of out){ const k = txKey(t), c = ex.get(k) || 0; if (c > 0){ ex.set(k, c - 1); dupes++; } else { t.cat = autoCat(t); fresh.push(t); } }
  return {fresh, dupes, errors, total: out.length};
}
function renderImport(){
  const v = $('#view'), I = ui.imp;
  let html = `<div class="pagehead"><h1>Import from your bank</h1></div>
  <div class="grid g2">
    <div class="card"><h2>1 · Choose your bank export</h2><p class="sub">CSV from your bank's website or app (usually under "Télécharger / Exporter les opérations"). Import each account separately; re-importing overlapping dates is fine — duplicates are skipped.</p>
      <label class="drop" id="drop"><input type="file" id="csvFile" accept=".csv,.txt,.tsv,text/csv" hidden><b>${I ? esc(I.name) : 'Drop a CSV file here'}</b><small>${I ? 'Choose another file' : 'or click to choose a file'}</small></label>
      <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">…or paste the CSV text</summary><textarea class="inp" id="pasteCSV" placeholder="Date;Libellé;Montant&#10;05/10/2026;CB MONOPRIX;-23,40" style="margin-top:8px"></textarea><button class="btn" data-action="pasteImport" style="margin-top:8px">Read pasted text</button></details>
    </div>
    <div class="card"><h2>Tips</h2><ul class="small muted" style="padding-left:18px;margin:0">
      <li>Most French banks (BNP, Société Générale, Crédit Agricole, LCL, Boursorama, Revolut…) offer CSV export. If yours only offers Excel, open it and "Save as CSV".</li>
      <li>Expenses should end up <b>negative</b>, income <b>positive</b>. If it's the other way round, tick "Flip signs".</li>
      <li>Transfers to your own savings (Livret A, etc.) go to "Savings & own transfers" so they don't count as spending.</li>
      <li>Loan repayments go to "Loans &amp; credit" — link them to a loan in the Loans tab to see your milestones.</li>
      <li>After importing, fix a few categories in Transactions — the app learns a rule each time.</li></ul></div>`;
  if (I){
    const opt = sel => `<option value="-1">—</option>` + I.header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const res = buildImport();
    const dates = res.fresh.map(t => t.date).sort();
    html += `<div class="card span2"><h2>2 · Check the columns</h2><p class="sub">I've guessed the columns — fix any that look wrong in the preview.</p>
      <div class="mapgrid">
        <label class="field">Date<select data-imp="date">${opt(I.map.date)}</select></label>
        <label class="field">Description<select data-imp="desc">${opt(I.map.desc)}</select></label>
        <label class="field">Amount (single column)<select data-imp="amount">${opt(I.map.amount)}</select></label>
        <label class="field">…or Debit column<select data-imp="debit" ${I.map.amount >= 0 ? 'disabled' : ''}>${opt(I.map.debit)}</select></label>
        <label class="field">…and Credit column<select data-imp="credit" ${I.map.amount >= 0 ? 'disabled' : ''}>${opt(I.map.credit)}</select></label>
        <label class="field">Date format<select data-impopt="datefmt"><option value="dmy" ${I.datefmt === 'dmy' ? 'selected' : ''}>DD/MM/YYYY</option><option value="mdy" ${I.datefmt === 'mdy' ? 'selected' : ''}>MM/DD/YYYY</option></select></label>
        <label class="field">Account label (optional)<input data-impopt="account" value="${esc(I.account)}" placeholder="e.g. BNP current"></label>
      </div>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" data-impopt="invert" ${I.invert ? 'checked' : ''}> Flip signs (my file shows expenses as positive numbers)</label>
      <p style="margin:0 0 10px"><b>${res.fresh.length}</b> new transaction${res.fresh.length === 1 ? '' : 's'}${dates.length ? ` from ${dLabel(dates[0])} ${dates[0].slice(0,4)} to ${dLabel(dates[dates.length-1])} ${dates[dates.length-1].slice(0,4)}` : ''}
        ${res.dupes ? ` · <span class="pill">${res.dupes} already imported</span>` : ''}${res.errors ? ` · <span class="pill warn">${res.errors} rows skipped (no valid date/amount)</span>` : ''}
        · <span class="pill">${res.fresh.filter(t => t.cat === 'uncat').length} uncategorised</span></p>
      ${res.fresh.length ? `<div class="tablewrap"><table><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr>
        ${res.fresh.slice(0, 8).map(t => `<tr><td class="muted" style="white-space:nowrap">${t.date}</td><td>${esc(t.desc)}</td><td><span class="dot" style="display:inline-block;background:${esc(catOf(t.cat).color)};margin-right:6px"></span>${esc(catOf(t.cat).name)}</td><td class="num ${t.amount > 0 ? 'pos' : ''}">${money(t.amount,2)}</td></tr>`).join('')}</table></div>
        ${res.fresh.length > 8 ? `<p class="small muted">…and ${res.fresh.length - 8} more</p>` : ''}` : ''}
      <div class="btnrow" style="margin-top:14px"><button class="btn primary" data-action="commitImport" ${res.fresh.length ? '' : 'disabled'}>Import ${res.fresh.length} transaction${res.fresh.length === 1 ? '' : 's'}</button><button class="btn" data-action="cancelImport">Cancel</button></div>
    </div>`;
  }
  v.innerHTML = html + `</div>`;
  const drop = $('#drop');
  ['dragover','dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(e => drop.addEventListener(e, () => drop.classList.remove('over')));
  drop.addEventListener('drop', ev => { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) readFile(f); });
  $('#csvFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); });
}
function readFile(f){
  const r = new FileReader();
  r.onload = () => {
    let text = r.result;
    // French bank exports are often Windows-1252: re-read if UTF-8 decoding produced replacement chars
    if (text.includes('\uFFFD')){ const r2 = new FileReader(); r2.onload = () => startImport(r2.result, f.name); r2.readAsText(f, 'windows-1252'); return; }
    startImport(text, f.name);
  };
  r.onerror = () => toast('Could not read that file', true);
  r.readAsText(f, 'utf-8');
}
function commitImport(){
  const res = buildImport(); if (!res.fresh.length) return;
  state.txns.push(...res.fresh);
  let pruned = pruneOld();
  save();
  const latest = res.fresh.map(t => t.date).sort().pop().slice(0,7);
  ui.month = latest; ui.tx.month = null; ui.imp = null;
  const unc = res.fresh.filter(t => t.cat === 'uncat').length;
  toast(`Imported ${res.fresh.length} transactions${res.dupes ? `, skipped ${res.dupes} duplicates` : ''}${pruned ? `, removed ${pruned} older than ${state.settings.keepMonths} months` : ''}`);
  if (unc){ ui.tx = {month:'', cat:'uncat', q:''}; go('transactions'); setTimeout(() => toast(`${unc} need a category — pick one and the app will remember it`), 3900); }
  else go('dashboard');
}

/* ============================== setup ============================== */
function renderSetup(){
  const S = state.settings, avg = avgSpend(ui.month, 3);
  const cats = state.categories.slice().sort((a,b) => ({expense:0,income:1,transfer:2}[a.type] - {expense:0,income:1,transfer:2}[b.type]));
  const dates = state.txns.map(t => t.date).sort();
  $('#view').innerHTML = `${demoBanner()}<div class="pagehead"><h1>Budgets &amp; settings</h1></div>
  <div class="grid">
    ${cloud() ? familyCard() + accountCard() : ''}
    <div class="card"><h2>Preferences</h2><p class="sub">Used across the dashboard and insights${cloud() ? ' · shared with your family' : ''}</p>
      <div class="setrow">
        <label class="field">Currency<select data-setting="currency">${CURRENCIES.map(c => `<option ${c === S.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field">Savings goal (% of income)<input type="number" min="0" max="90" step="1" data-setting="savingsGoal" value="${S.savingsGoal}"></label>
        <label class="field">"Small purchase" threshold<input type="number" min="1" step="1" data-setting="smallThreshold" value="${S.smallThreshold}"></label>
        <label class="field">Keep history<select data-setting="keepMonths">${KEEP_OPTIONS.map(([n, l]) => `<option value="${n}" ${n === S.keepMonths ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <p class="small muted" style="margin:10px 0 0">"Paid last year" figures on the Loans tab need at least 24 months of history.</p>
    </div>
    <div class="card"><div class="pagehead" style="margin-bottom:6px"><div><h2>Categories &amp; monthly budgets</h2><p class="sub mt0">"3-mo avg" shows what you actually spend, so you can set realistic budgets. Leave budget at 0 for none.</p></div>
      <div class="btnrow"><button class="btn" data-action="suggestBudgets">Suggest budgets</button><button class="btn" data-action="addCat">+ Category</button></div></div>
      <div class="tablewrap"><table class="cattable"><tr><th></th><th>Name</th><th class="hide-sm">Type</th><th class="num hide-sm">3-mo avg</th><th class="num">Budget / mo</th><th></th></tr>
      ${cats.map(c => `<tr><td><input type="color" value="${esc(c.color)}" data-cat="${esc(c.id)}" data-field="color" aria-label="Colour"></td>
        <td><input class="inp" value="${esc(c.name)}" data-cat="${esc(c.id)}" data-field="name"></td>
        <td class="hide-sm"><select class="inp" data-cat="${esc(c.id)}" data-field="type" ${PROTECTED_CATS.has(c.id) ? 'disabled' : ''}><option value="expense" ${c.type === 'expense' ? 'selected' : ''}>Spending</option><option value="income" ${c.type === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${c.type === 'transfer' ? 'selected' : ''}>Transfer (ignored)</option></select></td>
        <td class="num muted hide-sm">${c.type === 'expense' && avg[c.id] ? money(avg[c.id],0) : '—'}</td>
        <td class="num">${c.type === 'expense' ? `<input class="inp budget" type="number" min="0" step="10" value="${c.budget || 0}" data-cat="${esc(c.id)}" data-field="budget">` : ''}</td>
        <td>${PROTECTED_CATS.has(c.id) ? '' : `<button class="icon-btn sm" data-action="delCat" data-id="${esc(c.id)}" title="Delete category" aria-label="Delete category">×</button>`}</td></tr>`).join('')}
      </table></div>
    </div>
    <div class="card"><div class="pagehead" style="margin-bottom:6px"><div><h2>Auto-categorisation rules</h2><p class="sub mt0">If a description contains the keyword, it goes to that category. Longer keywords win. ${state.rules.length} rules.</p></div>
      <div class="btnrow"><button class="btn" data-action="recat">Re-apply to uncategorised</button><button class="btn" data-action="addRule">+ Rule</button></div></div>
      <input class="inp" id="ruleQ" type="search" placeholder="Filter rules…" value="${esc(ui.ruleQ)}" style="width:100%;margin-bottom:10px">
      <div class="rules" id="rulesBox"></div>
    </div>
    <div class="card"><h2>Your data</h2><p class="sub">${state.txns.length} transactions · ${state.loans.length} loan${state.loans.length === 1 ? '' : 's'}${dates.length ? ` · ${dates[0]} → ${dates[dates.length - 1]}` : ''} · last backup: ${S.lastBackup ? new Date(S.lastBackup).toLocaleDateString() : 'never'}</p>
      <div class="btnrow">
        <button class="btn primary" data-action="exportJSON">Export backup (.json)</button>
        <button class="btn" data-action="restore">Restore backup</button>
        <button class="btn" data-action="exportCSV">Export transactions (.csv)</button>
        ${hasDemoData() ? '<button class="btn" data-action="removeDemo">Remove demo data</button>' : '<button class="btn" data-action="demo">Load demo data</button>'}
        <button class="btn danger" data-action="newBudget">Start a new budget</button>
      </div>
      <p class="small muted" style="margin:12px 0 0">${cloud() ? 'Everything is stored in your private Supabase database and shared only with the members of your family budget. Moving over from the old single-file version? Export a backup there and use "Restore backup" here.' : 'Local mode: data is stored only in this browser. To use the app on your phone and computer, export a backup on one and restore it on the other.'}</p>
    </div>
  </div>`;
  updateRules();
}
function updateRules(){
  const q = norm(ui.ruleQ);
  const list = state.rules.map((r, i) => ({...r, i})).filter(r => !q || norm(r.kw).includes(q) || norm(catOf(r.cat).name).includes(q));
  $('#rulesBox').innerHTML = list.length ? list.map(r => `<div class="r"><input value="${esc(r.kw)}" data-rule="${r.i}" data-field="kw" aria-label="Keyword"><select data-rule="${r.i}" data-field="cat" aria-label="Category">${catOptions(r.cat)}</select><button class="icon-btn sm" data-action="delRule" data-i="${r.i}" aria-label="Delete rule">×</button></div>`).join('') : '<p class="muted small" style="padding:10px">No rules match.</p>';
}
function familyCard(){
  const H = Store.household, me = Store.user, owner = H.role === 'owner';
  return `<div class="card"><h2>Family budget</h2><p class="sub">Everyone below sees and edits the same transactions, budgets and loans.</p>
    <div class="setrow" style="align-items:flex-end;margin-bottom:14px">
      <label class="field">Name<input class="inp" id="hhName" value="${esc(H.name)}" maxlength="80" ${owner ? '' : 'disabled'}></label>
      <div class="field">Invite code<div class="btnrow" style="align-items:center"><code class="invite">${esc(H.invite_code)}</code><button class="btn" data-action="copyInvite">Copy invitation</button>${owner ? '<button class="btn" data-action="newInvite" title="The old code stops working">New code</button>' : ''}</div></div>
    </div>
    <p class="small muted" style="margin:0 0 12px">To add someone: send them the invitation. They create an account on this website, then enter the code.</p>
    <table>${Store.members.map(m => `<tr><td><b>${esc(m.display_name || (m.email || '').split('@')[0])}</b>${m.user_id === me.id ? ' <span class="pill">you</span>' : ''}<div class="small muted">${esc(m.email || '')}</div></td>
      <td class="num">${m.role === 'owner' ? '<span class="pill good">owner</span>' : ''}</td>
      <td class="num">${m.user_id === me.id ? (owner ? '' : '<button class="btn danger" data-action="leaveFamily">Leave</button>') : owner ? `<button class="btn danger" data-action="removeMember" data-id="${esc(m.user_id)}">Remove</button>` : ''}</td></tr>`).join('')}</table>
  </div>`;
}
function accountCard(){
  const u = Store.user;
  return `<div class="card"><h2>Your account</h2><p class="sub">Signed in as <b>${esc(u.name)}</b> · ${esc(u.email)}</p>
    <form class="setrow" data-form="changePassword" style="align-items:flex-end">
      <input type="text" name="username" value="${esc(u.email)}" autocomplete="username" hidden>
      <label class="field">New password<input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <div class="btnrow"><button class="btn" type="submit">Change password</button><button class="btn danger" type="button" data-action="signOut">Sign out</button></div>
    </form><p class="formerr" hidden></p></div>`;
}

/* ============================== add dialog ============================== */
let catTouched = false;
function openAdd(){
  const f = $('#txForm'); f.reset(); catTouched = false; $('#txErr').hidden = true;
  f.date.value = todayISO(); f.cat.innerHTML = catOptions('uncat');
  $('#txDialog').showModal(); f.amount.focus();
}
function suggestDialogCat(){
  if (catTouched) return;
  const f = $('#txForm');
  f.cat.value = suggestCat(f.desc.value, f.kind.value === 'income' ? 1 : -1);
}

/* ============================== demo data ============================== */
function demoLoans(){
  const y = new Date().getFullYear();
  return [
    cleanLoan({name: 'House – demo bank', kind: 'house', principal: 240000, rate: 3.4, start_date: `${y - 5}-03-05`, term_months: 300, insurance: 38.5, keyword: 'pret immo 0012345', src: 'demo'}),
    cleanLoan({name: 'Car – demo finance', kind: 'car', principal: 24000, rate: 4.9, start_date: `${y - 3}-06-10`, term_months: 60, keyword: 'diac credit auto', src: 'demo'})
  ];
}
function genDemo(){
  const rnd = mulberry32(7), R = (a,b) => a + rnd() * (b - a), pick = a => a[Math.floor(rnd() * a.length)], ri = (a,b) => Math.floor(R(a, b + 1));
  const end = curMonth(), today = new Date(), out = [];
  const [house, car] = demoLoans().map(L => loanSchedule(L));
  for (let i = 23; i >= 0; i--){
    const m = addMonths(end, -i), [y, mo] = m.split('-').map(Number), dim = new Date(y, mo, 0).getDate();
    const maxDay = i === 0 ? today.getDate() : dim;
    const add = (d, desc, amt) => { d = Math.min(d, dim); if (d > maxDay) return; out.push({id: uid(), date: `${m}-${pad(d)}`, desc: desc + ' ' + pad(d) + '/' + pad(mo), amount: Math.round(amt * 100) / 100, src:'demo'}); };
    const hp = house.rows.find(r => r.date.startsWith(m)), cp = car.rows.find(r => r.date.startsWith(m));
    if (hp) add(5, 'PRLV SEPA ECHEANCE PRET IMMO 0012345', -(hp.interest + hp.principal + hp.insurance));
    if (cp) add(10, 'PRLV SEPA DIAC CREDIT AUTO', -(cp.interest + cp.principal));
    add(5, 'PRLV SEPA EDF', -R(55, 82));
    add(6, 'PRLV SEPA FREE MOBILE', -19.99);
    add(7, 'PRLV SEPA FREEBOX', -29.99);
    add(8, 'PRLV SEPA NETFLIX.COM', -13.49);
    add(10, 'CB SPOTIFY', -11.12);
    add(12, 'PRLV SEPA DISNEY PLUS', -9.99);
    add(3, 'PRLV SEPA BASIC FIT', -29.99);
    add(2, 'CB NAVIGO RATP', -88.80);
    add(4, 'COTISATION CARTE VISA PREMIER', -11.50);
    if (i < 8) add(14, 'PRLV SEPA AMAZON PRIME', -6.99);
    if (i < 5) add(15, 'CB CHATGPT OPENAI', -22.99);
    add(27, 'VIREMENT SALAIRE ACME SAS', 2850 + (i % 12 === 6 ? 900 : 0));
    add(28, 'VIREMENT SALAIRE MAIRIE DE VERSAILLES', 2350);
    add(28, 'VIR LIVRET A', -(i % 3 === 0 ? 150 : 300));
    for (let k = ri(7, 10); k > 0; k--) add(ri(1, 28), pick(['CB CARREFOUR CITY','CB MONOPRIX','CB LIDL','CB FRANPRIX','CB PICARD']), -R(14, 96));
    for (let k = ri(3, 6) + (i < 3 ? 4 : 0); k > 0; k--) add(ri(1, 28), pick(['CB UBER EATS','CB DELIVEROO','CB RESTAURANT LE PETIT ZINC','CB SUSHI SHOP','CB BURGER KING']), -R(13, 46));
    for (let k = ri(12, 22); k > 0; k--) add(ri(1, 28), pick(['CB STARBUCKS','CB BOULANGERIE PAUL','CB COLUMBUS CAFE','CB RELAY GARE']), -R(2.4, 7.9));
    for (let k = ri(2, 4); k > 0; k--) add(ri(1, 28), pick(['CB AMAZON MKTPLACE','CB FNAC','CB ZARA','CB DECATHLON','CB SEPHORA']), -R(15, 85));
    for (let k = ri(0, 3); k > 0; k--) add(ri(1, 28), 'CB UBER TRIP', -R(9, 26));
    if (rnd() < .4) add(ri(1, 28), 'CB SNCF OUIGO', -R(25, 79));
    if (rnd() < .5) add(ri(1, 28), 'CB PHARMACIE DU CENTRE', -R(6, 31));
    for (let k = ri(0, 2); k > 0; k--) add(ri(1, 28), 'CB UGC CINE CITE', -R(9, 13));
    if (rnd() < .3) add(ri(1, 28), 'RETRAIT DAB', -pick([20, 40, 60]));
    if (rnd() < .25) add(ri(1, 28), 'FRAIS COMMISSION INTERVENTION', -8);
    if (i === 3){ add(9, 'CB AIRBNB', -420); add(10, 'CB EASYJET', -186); }
  }
  out.forEach(t => t.cat = autoCat(t));
  return out;
}

/* ============================== gate: sign in, family set-up, errors ============================== */
let gateMode = null;
function renderGate(mode, msg, ok){
  gateMode = mode; appStarted = false;
  document.body.classList.add('gate');
  Object.values(charts).forEach(c => c.destroy()); charts = {};
  const u = Store.user;
  const err = msg ? `<p class="${ok ? 'formok' : 'formerr'}" role="alert">${esc(msg)}</p>` : `<p class="formerr" role="alert" hidden></p>`;
  const email = (auto) => `<label class="field">Email<input class="inp" name="email" type="email" autocomplete="${auto || 'email'}" required></label>`;
  const views = {
    loading: () => `<div class="gatecard card"><p class="muted" style="margin:0">${esc(msg || 'Loading…')}</p></div>`,
    error: () => `<div class="gatecard card"><h1>Something went wrong</h1><p class="sub">${esc(msg)}</p><button class="btn primary" data-action="reload">Reload</button></div>`,
    signin: () => `<div class="gatecard card"><h1>Sign in</h1><p class="sub">Your family's spending, budgets and loans in one place.</p>
      <form data-form="signin">${email('username')}<label class="field">Password<input class="inp" name="password" type="password" autocomplete="current-password" required></label>${err}<button class="btn primary" type="submit">Sign in</button></form>
      <div class="gatelinks"><a href="#" data-gate="forgot">Forgot password?</a><a href="#" data-gate="signup">Create an account</a></div></div>`,
    signup: () => `<div class="gatecard card"><h1>Create your account</h1><p class="sub">Joining a family budget? Create your account first, then enter the invite code you were sent.</p>
      <form data-form="signup"><label class="field">Your first name<input class="inp" name="name" autocomplete="given-name" required maxlength="40"></label>${email()}<label class="field">Password <small class="muted">at least 8 characters</small><input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>${err}<button class="btn primary" type="submit">Create account</button></form>
      <div class="gatelinks"><a href="#" data-gate="signin">I already have an account</a></div></div>`,
    confirm: () => `<div class="gatecard card"><h1>Check your inbox</h1><p class="sub">We sent you a link to confirm your email address. Click it, then come back here and sign in.</p><button class="btn primary" data-gate="signin">Go to sign in</button></div>`,
    forgot: () => `<div class="gatecard card"><h1>Reset your password</h1><p class="sub">Enter your email and we'll send you a link to choose a new password.</p>
      <form data-form="forgot">${email()}${err}<button class="btn primary" type="submit">Send reset link</button></form>
      <div class="gatelinks"><a href="#" data-gate="signin">Back to sign in</a></div></div>`,
    recovery: () => `<div class="gatecard card"><h1>Choose a new password</h1><p class="sub">For ${esc(u ? u.email : 'your account')}</p>
      <form data-form="recovery"><input type="text" name="username" value="${esc(u ? u.email : '')}" autocomplete="username" hidden><label class="field">New password <small class="muted">at least 8 characters</small><input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>${err}<button class="btn primary" type="submit">Save password</button></form></div>`,
    household: () => `<div class="gatecard card wide"><h1>Welcome${u ? ', ' + esc(u.name) : ''}!</h1><p class="sub">Set up a family budget, or join the one a family member already created.</p>
      ${err}
      <div class="grid g2" style="margin-top:12px">
        <form data-form="createFamily" class="card flat"><h2>Start a new family budget</h2><p class="sub">You'll get an invite code to share with your family.</p>
          <label class="field">Name<input class="inp" name="name" maxlength="80" value="${esc(u ? u.name + '’s family' : 'Our family')}" required></label><p class="formerr" role="alert" hidden></p><button class="btn primary" type="submit">Create</button></form>
        <form data-form="joinFamily" class="card flat"><h2>Join your family</h2><p class="sub">Enter the code from the invitation you received.</p>
          <label class="field">Invite code<input class="inp" name="code" autocomplete="off" autocapitalize="characters" placeholder="e.g. 7F3A9C21B0" required></label><p class="formerr" role="alert" hidden></p><button class="btn primary" type="submit">Join</button></form>
      </div>
      <div class="gatelinks"><a href="#" data-action="signOut">Sign out</a></div></div>`
  };
  $('#view').innerHTML = `<div class="gatewrap">${views[mode]()}</div>`;
  const first = $('#view input:not([hidden])'); if (first && mode !== 'loading') first.focus();
}
function formMsg(form, msg, ok){
  const p = form.querySelector('.formerr, .formok') || form.parentElement.querySelector('.formerr, .formok');
  if (!p) { toast(msg, !ok); return; }
  p.className = ok ? 'formok' : 'formerr'; p.textContent = msg; p.hidden = !msg;
}
const friendly = e => {
  const m = (e && e.message) || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.';
  if (/already registered|already been registered/i.test(m)) return 'There is already an account with this email. Sign in instead, or reset your password.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts — please wait a few minutes and try again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Can’t reach the server. Check your internet connection.';
  return m;
};
async function onGateSubmit(form){
  const f = form, kind = f.dataset.form, btn = f.querySelector('button[type=submit]');
  const val = n => (f.elements[n] ? f.elements[n].value.trim() : '');
  btn.disabled = true; formMsg(f, '');
  try {
    if (kind === 'signin'){ const next = await Store.signIn(val('email'), f.elements.password.value); if (next === 'app') return startApp(); renderGate('household'); }
    else if (kind === 'signup'){
      if (f.elements.password.value.length < 8) throw new Error('Use at least 8 characters for your password.');
      const next = await Store.signUp(val('name'), val('email'), f.elements.password.value);
      renderGate(next === 'confirm' ? 'confirm' : 'household');
    }
    else if (kind === 'forgot'){ await Store.sendReset(val('email')); formMsg(f, 'If that email has an account, a reset link is on its way.', true); }
    else if (kind === 'recovery'){
      if (f.elements.password.value.length < 8) throw new Error('Use at least 8 characters for your password.');
      await Store.updatePassword(f.elements.password.value); toast('Password updated');
      return (await Store.loadHousehold()) ? startApp() : renderGate('household');
    }
    else if (kind === 'createFamily'){ await Store.createHousehold(val('name')); toast('Family budget created — share the invite code from Settings'); return startApp(); }
    else if (kind === 'joinFamily'){ await Store.joinHousehold(val('code')); toast(`You joined ${Store.household.name}`); return startApp(); }
    else if (kind === 'changePassword'){
      if (f.elements.password.value.length < 8) throw new Error('Use at least 8 characters for your password.');
      await Store.updatePassword(f.elements.password.value); f.reset(); toast('Password changed');
    }
  } catch (e){ formMsg(f, friendly(e)); }
  finally { btn.disabled = false; }
}

/* ============================== app start ============================== */
async function startApp(){
  renderGate('loading', 'Loading your budget…');
  let raw;
  try { raw = await Store.loadData(); }
  catch (e){ return renderGate('error', 'Could not load your data: ' + friendly(e)); }
  state = migrate(raw); catMap = null; ruleCache = null;
  pruneOld();
  save();   // persists migrations; in cloud mode only real differences are sent
  ui.month = monthsWithData()[0] || curMonth(); ui.tx = {month:null, cat:'', q:''}; ui.imp = null;
  document.body.classList.remove('gate');
  appStarted = true; gateMode = null;
  renderChrome();
  const h = location.hash.slice(1);
  go(TABS.includes(h) ? h : 'dashboard');
}
function renderChrome(){
  const u = Store.user, av = $('#userBtn');
  if (cloud() && u){ av.hidden = false; av.textContent = (u.name || u.email || '?').trim().slice(0, 1).toUpperCase(); av.title = `${u.name} · ${Store.household.name} — account & family`; }
  else av.hidden = true;
  $('footer').innerHTML = cloud()
    ? `Signed in as ${esc(u.name)} · ${esc(Store.household.name)}. Your data is stored in your family's private database. <a href="#setup">Export a backup</a> now and then.`
    : `Local mode: your data is saved only in this browser on this device. <a href="#setup">Export a backup</a> regularly, and use it to move your data to another device.`;
  updateSync();
}
function updateSync(){
  const el = $('#sync'), s = Store.status;
  el.hidden = !cloud() || !appStarted;
  el.className = 'sync' + (s === 'error' ? ' err' : '');
  el.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? '⚠ Not saved — retry' : '✓ Saved';
  el.title = s === 'error' ? 'Your last changes are not saved yet. ' + friendly(Store.lastError) : 'All changes are saved';
}
Store.on('status', (s, err) => {
  updateSync();
  if (s === 'error') toast(cloud() ? 'Couldn’t save your changes: ' + friendly(err) : 'Could not save — browser storage is blocked or full. Export a backup now.', true);
});
Store.on('remote', cfg => {
  const fresh = migrate({...cfg, txns: state.txns, loans: state.loans});
  state.categories = fresh.categories; state.rules = fresh.rules; state.settings = fresh.settings;
  catMap = null; ruleCache = null;
  toast('A family member changed the settings at the same time. Their version was kept — please check and redo your last change.', true);
  render();
});
Store.on('signedOut', () => location.reload());

/* ============================== events ============================== */
document.addEventListener('click', e => {
  const gl = e.target.closest('[data-gate]'); if (gl){ e.preventDefault(); renderGate(gl.dataset.gate); return; }
  const tab = e.target.closest('#tabs button'); if (tab){ go(tab.dataset.tab); return; }
  const g = e.target.closest('[data-goto]'); if (g){ e.preventDefault(); if (appStarted) go(g.dataset.goto); return; }
  const a = e.target.closest('[data-action]'); if (!a || a.tagName === 'SELECT') return;
  const act = a.dataset.action;
  if (!appStarted && !['reload','signOut','theme'].includes(act)) return;
  switch (act){
    case 'reload': location.reload(); break;
    case 'signOut': e.preventDefault(); (async () => { if (!(await Store.flush()) && !confirm('Some changes are not saved yet. Sign out anyway?')) return; await Store.signOut(); location.replace(location.pathname); })(); break;
    case 'openAdd': openAdd(); break;
    case 'closeAdd': $('#txDialog').close(); break;
    case 'theme': cycleTheme(); break;
    case 'month': ui.month = addMonths(ui.month, +a.dataset.d); ui.tx.month = null; render(); break;
    case 'demo': {
      if ((state.txns.some(t => t.src !== 'demo') || state.loans.some(l => l.src !== 'demo')) && !confirm('Add demo transactions and loans alongside your real data? You can remove them later in Budgets & settings.')) return;
      if (cloud() && Store.members.length > 1 && !confirm('Demo data is shared: everyone in your family budget will see it until you remove it. Continue?')) return;
      state.txns = state.txns.filter(t => t.src !== 'demo').concat(genDemo());
      state.loans = state.loans.filter(l => l.src !== 'demo').concat(demoLoans());
      save(); ui.month = addMonths(curMonth(), -1); ui.tx.month = null; toast('Demo data loaded — remove it any time in Budgets & settings'); go('dashboard'); break; }
    case 'removeDemo': state.txns = state.txns.filter(t => t.src !== 'demo'); state.loans = state.loans.filter(l => l.src !== 'demo'); save(); ui.month = monthsWithData()[0] || curMonth(); toast('Demo data removed'); render(); break;
    case 'delTx': { const t = state.txns.find(x => x.id === a.dataset.id); if (t && confirm(`Delete "${t.desc}" (${money(t.amount,2)})?`)){ state.txns = state.txns.filter(x => x !== t); save(); updateTxList(); } break; }
    case 'showUncat': ui.tx = {month:'', cat:'uncat', q:''}; go('transactions'); break;
    case 'pasteImport': { const t = $('#pasteCSV').value; if (t.trim()) startImport(t, 'Pasted text'); break; }
    case 'commitImport': commitImport(); break;
    case 'cancelImport': ui.imp = null; renderImport(); break;
    case 'exportJSON': {
      const {version, categories, rules, txns, loans, settings} = state;
      download(`money-tracker-backup-${todayISO()}.json`, JSON.stringify({version, categories, rules, txns, loans, settings}, null, 1), 'application/json');
      state.settings.lastBackup = new Date().toISOString(); save(); toast('Backup downloaded'); if (ui.tab !== 'transactions' && ui.tab !== 'import') render(); break; }
    case 'restore': $('#restoreFile').click(); break;
    case 'exportCSV': {
      // a leading = + - @ makes spreadsheets run the cell as a formula: neutralise it in text columns
      const txt = s => /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
      const rows = [['Date','Description','Amount','Category','Type','Note']].concat(state.txns.slice().sort((x,y) => x.date.localeCompare(y.date)).map(t => [t.date, txt(t.desc), t.amount.toFixed(2), txt(catOf(t.cat).name), catOf(t.cat).type, txt(t.note || '')]));
      download(`transactions-${todayISO()}.csv`, '\uFEFF' + rows.map(r => r.map(x => /[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(',')).join('\n'), 'text/csv'); break; }
    case 'newBudget': {
      const ok = onlyDemoData()
        ? confirm('Remove the demo data and start your own budget from scratch?')
        : confirm(`Start a new budget${cloud() ? ` for everyone in "${Store.household.name}"` : ''}? All transactions, loans, budgets, categories and rules are deleted and you start again from a clean slate. Your account${cloud() ? ' and family members are' : ' is'} kept.\n\nIf you might want this data later, click Cancel and use "Export backup" first.`)
          && confirm('Really start over? This cannot be undone.');
      if (!ok) break;
      state = freshState(); Store.replaceAll(); save();
      ui.month = curMonth(); ui.tx = {month:null, cat:'', q:''}; ui.imp = null;
      toast('New budget started — import a bank CSV or add your first expense'); go('dashboard'); break; }
    case 'suggestBudgets': { const avg = avgSpend(ui.month, 3); let n = 0; state.categories.forEach(c => { if (c.type === 'expense' && !['uncat','loans'].includes(c.id) && avg[c.id] > 0){ c.budget = Math.max(10, Math.round(avg[c.id] * .9 / 10) * 10); n++; } }); if (!n){ toast('Need some spending data first'); break; } save(); toast(`Set ${n} budgets to 90% of your 3-month average`); render(); break; }
    case 'addCat': { const name = prompt('New category name'); if (!name || !name.trim()) break; const id = 'c_' + uid().slice(0, 8); state.categories.push({id, name: name.trim().slice(0, 60), color: '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'), type:'expense', budget:0}); save(); render(); break; }
    case 'delCat': { const c = catOf(a.dataset.id); if (PROTECTED_CATS.has(c.id)) break; const n = state.txns.filter(t => t.cat === c.id).length; if (!confirm(`Delete category "${c.name}"?${n ? ` Its ${n} transactions become Uncategorized.` : ''}`)) break; state.txns.forEach(t => { if (t.cat === c.id) t.cat = 'uncat'; }); state.rules = state.rules.filter(r => r.cat !== c.id); state.categories = state.categories.filter(x => x.id !== c.id); save(); render(); break; }
    case 'addRule': { const kw = prompt('Keyword to look for in the description (e.g. "monoprix")'); if (!kw || !norm(kw)) break; addRule(kw, 'other'); ui.ruleQ = norm(kw); save(); render(); toast('Rule added — now pick its category'); break; }
    case 'delRule': state.rules.splice(+a.dataset.i, 1); save(); updateRules(); break;
    case 'recat': { let n = 0; state.txns.forEach(t => { if (catOf(t.cat).id === 'uncat'){ const c = matchCat(t.desc); if (c && !(t.amount < 0 && catOf(c).type === 'income')){ t.cat = c; n++; } } }); save(); toast(n ? `Categorised ${n} transactions` : 'No uncategorised transactions matched a rule'); break; }
    case 'addLoan': openLoan(null, a.dataset.kw); break;
    case 'editLoan': openLoan(a.dataset.id); break;
    case 'delLoan': deleteLoan(a.dataset.id); break;
    case 'closeLoan': $('#loanDialog').close(); break;
    case 'copyInvite': {
      const H = Store.household, text = `Join our family budget "${H.name}": open ${location.origin + location.pathname}, create an account, then enter the invite code ${H.invite_code}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Invitation copied — paste it in a message to your family'), () => prompt('Copy this invitation:', text)); break; }
    case 'newInvite': if (confirm('Create a new invite code? The current code will stop working.')) Store.newInviteCode().then(() => { toast('New invite code created'); render(); }, err => toast(friendly(err), true)); break;
    case 'removeMember': { const m = Store.members.find(x => x.user_id === a.dataset.id); if (m && confirm(`Remove ${m.display_name || m.email} from the family budget? They will no longer see any of its data.`)) Store.removeMember(m.user_id).then(() => { toast('Removed'); render(); }, err => toast(friendly(err), true)); break; }
    case 'leaveFamily': if (confirm(`Leave "${Store.household.name}"? You will no longer see its data.`)) Store.flush().then(() => Store.removeMember(Store.user.id)).then(() => location.reload(), err => toast(friendly(err), true)); break;
  }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault(); onGateSubmit(f);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'monthSel'){ ui.month = t.value; ui.tx.month = null; render(); return; }
  if (t.id === 'fMonth'){ ui.tx.month = t.value; updateTxList(); return; }
  if (t.id === 'fCat'){ ui.tx.cat = t.value; updateTxList(); return; }
  if (t.id === 'hhName'){ const name = t.value.trim().slice(0, 80); if (!name) { t.value = Store.household.name; return; } Store.renameHousehold(name).then(() => { toast('Saved'); renderChrome(); }, err => toast(friendly(err), true)); return; }
  if (t.dataset.action === 'setCat'){ setCategory(t.dataset.id, t.value); return; }
  if (t.dataset.imp){ ui.imp.map[t.dataset.imp] = +t.value; if (t.dataset.imp === 'amount' && +t.value < 0 && ui.imp.map.debit < 0){ ui.imp.map.debit = ui.imp.header.findIndex(h => /debit/.test(norm(h))); ui.imp.map.credit = ui.imp.header.findIndex(h => /credit/.test(norm(h))); } renderImport(); return; }
  if (t.dataset.impopt){ const k = t.dataset.impopt; ui.imp[k] = t.type === 'checkbox' ? t.checked : t.value; renderImport(); return; }
  if (t.dataset.setting){
    const k = t.dataset.setting;
    if (k === 'keepMonths'){
      const n = +t.value, cutoff = n ? addMonths(curMonth(), -(n - 1)) + '-01' : null, old = cutoff ? state.txns.filter(x => x.date < cutoff).length : 0;
      if (old && !confirm(`This deletes ${old} transactions dated before ${cutoff}${cloud() ? ' for everyone in your family budget' : ''}. Continue?`)){ t.value = state.settings.keepMonths; return; }
      state.settings.keepMonths = n; const removed = pruneOld(); save(); toast(removed ? `Deleted ${removed} old transactions` : 'Saved'); return;
    }
    let val = t.value; if (t.type === 'number') val = Math.max(0, +val || 0);
    if (k === 'savingsGoal') val = Math.min(90, val);
    if (k === 'smallThreshold') val = Math.max(1, val);
    state.settings[k] = val; save(); toast('Saved'); return; }
  if (t.dataset.cat){ const c = state.categories.find(x => x.id === t.dataset.cat); if (!c) return; const f = t.dataset.field;
    if (f === 'type' && PROTECTED_CATS.has(c.id)) return;
    c[f] = f === 'budget' ? Math.max(0, +t.value || 0) : t.value; if (f === 'name' && !c.name.trim()) c.name = 'Unnamed';
    save(); if (f === 'type') render(); return; }
  if (t.dataset.rule != null){ const r = state.rules[+t.dataset.rule]; if (!r) return; r[t.dataset.field] = t.dataset.field === 'kw' ? norm(t.value) : t.value; save(); return; }
  if (t.id === 'restoreFile'){ const f = t.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const o = JSON.parse(r.result); if (!o || !Array.isArray(o.txns)) throw 0;
        const who = cloud() ? ` for everyone in "${Store.household.name}"` : '';
        if (!confirm(`Replace the current data${who} with this backup (${o.txns.length} transactions${Array.isArray(o.loans) ? `, ${o.loans.length} loans` : ''})?`)) return;
        state = migrate(o); Store.replaceAll(); pruneOld(); save(); ui.month = monthsWithData()[0] || curMonth(); ui.tx.month = null; toast('Backup restored'); go('dashboard'); }
      catch(err){ toast('That file isn’t a valid backup', true); } };
    r.readAsText(f); t.value = ''; return; }
  if (t.name === 'kind' && t.form && t.form.id === 'txForm') suggestDialogCat();
  if (t.name === 'cat' && t.form && t.form.id === 'txForm') catTouched = true;
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'fQ'){ ui.tx.q = t.value; updateTxList(); }
  else if (t.id === 'ruleQ'){ ui.ruleQ = t.value; updateRules(); }
  else if (t.name === 'desc' && t.form && t.form.id === 'txForm') suggestDialogCat();
  else if (t.form && t.form.id === 'loanForm') loanHint();
});
$('#txForm').addEventListener('submit', e => {
  e.preventDefault(); e.stopPropagation();
  const f = e.target, err = $('#txErr');
  const fail = (msg, field) => { err.textContent = msg; err.hidden = false; field.focus(); };
  const raw = parseAmount(f.amount.value), amt = raw == null ? 0 : Math.round(Math.abs(raw) * 100) / 100;
  if (!amt) return fail('Enter an amount, e.g. 12,50', f.amount);
  if (!f.desc.value.trim()) return fail('Enter a description, e.g. Monoprix', f.desc);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.value)) return fail('Pick a date', f.date);
  err.hidden = true;
  const amount = f.kind.value === 'income' ? amt : -amt;
  let cat = f.cat.value;
  if (!catTouched && (!cat || cat === 'uncat' || cat === 'income')) cat = suggestCat(f.desc.value, amount);
  const t = {id: uid(), date: f.date.value, desc: f.desc.value.trim(), amount, cat, src:'manual'};
  if (f.note.value.trim()) t.note = f.note.value.trim();
  state.txns.push(t);
  // learn from a category the person picked themselves, so the next similar entry is filed the same way
  if (catTouched && catOf(t.cat).id !== 'uncat') { const k = merchantKey(t.desc); if (!matchCat(t.desc) && k && k !== '(blank)') addRule(k, t.cat); }
  save();
  $('#txDialog').close(); ui.month = t.date.slice(0,7); ui.tx.month = null;
  toast(`Added ${money(t.amount,2)} · ${catOf(t.cat).name}`); render();
});
$('#loanForm').addEventListener('submit', e => { e.stopPropagation(); submitLoan(e); });
$('#txDialog').addEventListener('click', e => { if (e.target.id === 'txDialog') e.target.close(); });
$('#loanDialog').addEventListener('click', e => { if (e.target.id === 'loanDialog') e.target.close(); });
$('#sync').addEventListener('click', () => { if (Store.status === 'error') Store.save(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (appStarted && TABS.includes(h) && h !== ui.tab) go(h); });
window.addEventListener('beforeunload', e => { if (cloud() && Store.pending){ e.preventDefault(); e.returnValue = ''; } });
// pick up changes made by other family members when the app comes back to the foreground
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !cloud() || !appStarted || Date.now() - Store.lastLoad < 60000) return;
  if (document.querySelector('dialog[open]') || ui.imp || !(await Store.flush())) return;
  try { const raw = await Store.loadData(); state = migrate(raw); catMap = null; ruleCache = null; if (!document.activeElement || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) render(); }
  catch (e){ console.warn('refresh failed', e); }
});

/* ============================== theme & boot ============================== */
function applyTheme(mode){ if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme; $('#themeBtn').title = 'Theme: ' + (mode || 'auto'); }
function cycleTheme(){ let cur; try { cur = localStorage.getItem(THEME_KEY) || 'auto'; } catch(e){ cur = document.documentElement.dataset.theme || 'auto'; }
  const next = {auto:'light', light:'dark', dark:'auto'}[cur] || 'auto';
  try { localStorage.setItem(THEME_KEY, next); } catch(e){}
  applyTheme(next); toast('Theme: ' + next); render(); }
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch(e){}
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
if (Store.mode === 'local' && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

(async function boot(){
  renderGate('loading', 'Connecting…');
  let r;
  try { r = await Store.init(); } catch (e){ r = {screen: 'error', message: friendly(e)}; }
  if (r.screen === 'app') return startApp();
  renderGate(r.screen, r.message);
})();
