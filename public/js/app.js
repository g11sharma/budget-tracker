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
const DEFAULT_CAT_NAMES = Object.fromEntries(DEFAULT_CATS.map(([id, name]) => [id, name]));
// Built-in categories are shown in the reader's language until someone renames them
const catName = c => !c ? '' : DEFAULT_CAT_NAMES[c.id] === c.name ? tr(c.name) : c.name;
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
function mLabel(m, long){ const [y,mo] = m.split('-').map(Number); return new Date(y, mo-1, 1).toLocaleDateString(LOCALE(), long ? {month:'long', year:'numeric'} : {month:'short', year:'2-digit'}); }
function dLabel(d){ const [y,m,dd] = d.split('-').map(Number); return new Date(y, m-1, dd).toLocaleDateString(LOCALE(), {day:'numeric', month:'short'}); }
const nfCache = {};
function money(v, dec){
  if (dec == null) dec = (Math.abs(v) < 100 && Math.round(v*100) % 100 !== 0) ? 2 : 0;
  const k = LANG + state.settings.currency + dec;
  if (!nfCache[k]) { try { nfCache[k] = new Intl.NumberFormat(LOCALE(), {style:'currency', currency: state.settings.currency, minimumFractionDigits: dec, maximumFractionDigits: dec}); } catch(e){ nfCache[k] = new Intl.NumberFormat(LOCALE(), {minimumFractionDigits: dec, maximumFractionDigits: dec}); } }
  return nfCache[k].format(v);
}
const pct = v => v == null || !isFinite(v) ? '—' : tr('{n}%', {n: Math.round(v*100)});
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
  if (smallAvg > 0) levers.push({title: tr('Halve small purchases (≤ {amount})', {amount: money(th)}), detail: trn(smallM.length, '{n} small purchase this month, {total} in total — they add up to about {year} a year.', '{n} small purchases this month, {total} in total — they add up to about {year} a year.', {total: money(smallTotal), year: money(smallAvg*12,0)}), save: smallAvg * 12 * .5});
  if (discretionaryRec.length) levers.push({title: trn(discretionaryRec.length, 'Review {n} recurring charge', 'Review {n} recurring charges'), detail: tr('Subscriptions & regular charges cost {amount} a year. Estimate assumes you cancel or downgrade a quarter of them.', {amount: money(recAnnual,0)}), save: recAnnual * .25});
  if (overBudget.length) levers.push({title: trn(overBudget.length, 'Bring {n} category back on budget', 'Bring {n} categories back on budget'), detail: overBudget.map(o => `${catName(o.cat)} +${money(o.excess,0)}`).join(' · '), save: sum(overBudget.map(o => o.excess)) * 12});
  if (dining3 > 0 && !overBudget.some(o => o.cat.id === 'dining')) levers.push({title: tr('Cook one more meal a week (−30% eating out)'), detail: tr('You spend about {amount} a month eating out and on delivery.', {amount: money(dining3,0)}), save: dining3 * 12 * .3});
  if (fees12 >= 20) levers.push({title: tr('Cut bank fees'), detail: tr('{amount} in bank fees over 12 months — many online banks charge nothing.', {amount: money(fees12,0)}), save: fees12});
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
  if (!window.Chart){ const box = el.parentElement; box.style.height = 'auto'; box.innerHTML = `<p class="muted small">${tr('Charts need an internet connection to load.')}</p>`; return; }
  Chart.defaults.color = cssVar('--muted'); Chart.defaults.borderColor = cssVar('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  charts[id] = new Chart(el, cfg);
}
function monthPicker(){
  const ms = new Set(monthsWithData()); ms.add(curMonth()); ms.add(ui.month);
  const arr = [...ms].sort().reverse();
  return `<div class="monthbar"><button class="icon-btn" data-action="month" data-d="-1" aria-label="${tr('Previous month')}">‹</button>
    <select id="monthSel" aria-label="${tr('Month')}">${arr.map(m => `<option value="${m}" ${m === ui.month ? 'selected' : ''}>${mLabel(m,true)}</option>`).join('')}</select>
    <button class="icon-btn" data-action="month" data-d="1" aria-label="${tr('Next month')}">›</button></div>`;
}
function emptyState(){
  return `<div class="card empty"><h2>${tr("Let's find where your money goes")}</h2>
    <p>${tr('Import a CSV export from your bank (or several, one per account), or add expenses by hand. The app categorises everything, keeps your history and points out the leaks.')}</p>
    <div class="row"><button class="btn primary" data-goto="import">${tr('Import bank CSV')}</button><button class="btn" data-action="openAdd">${tr('Add an expense')}</button><button class="btn" data-action="demo">${tr('Try with demo data')}</button></div></div>`;
}
function backupBanner(){
  if (Store.status === 'error' && !cloud()) return `<div class="banner">${tr("Browser storage isn't available, so changes won't survive a reload.")} <button class="btn" data-action="exportJSON">${tr('Export backup')}</button></div>`;
  if (!state.txns.length || hasDemoData()) return '';
  const lb = state.settings.lastBackup, days = lb ? (Date.now() - new Date(lb)) / 864e5 : Infinity;
  if (days < (cloud() ? 90 : 30)) return '';
  const why = cloud() ? tr('Your data is safe in the database, but a copy of your own is good insurance.') : tr('Your data lives only in this browser — clearing site data would erase it.');
  return `<div class="banner"><span>${lb ? tr('Last backup was {n} days ago.', {n: Math.floor(days)}) : tr('You haven’t made a backup yet.')} ${why}</span><button class="btn" data-action="exportJSON">${tr('Export backup')}</button></div>`;
}
const hasDemoData = () => state.txns.some(t => t.src === 'demo') || state.loans.some(l => l.src === 'demo');
const onlyDemoData = () => hasDemoData() && state.txns.every(t => t.src === 'demo') && state.loans.every(l => l.src === 'demo');
// Shown on every page while example data is loaded, so it's obvious how to get back to a real budget
function demoBanner(){
  if (!hasDemoData()) return '';
  return onlyDemoData()
    ? `<div class="banner info"><span>${tr("You're exploring <b>demo data</b>. When you're ready, start your own budget from scratch.")}</span><button class="btn primary" data-action="clearBudget">${tr('Start my real budget')}</button></div>`
    : `<div class="banner info"><span>${tr('Your budget still contains <b>demo data</b> next to your own.')}</span><button class="btn" data-action="removeDemo">${tr('Remove demo data')}</button></div>`;
}
// A clean slate: default categories and rules, but no budget amounts, no transactions and no loans.
// Personal preferences (currency, goals, history length) are kept.
function freshState(){
  const s = defaultState(), o = state.settings;
  s.categories.forEach(c => c.budget = 0);
  s.settings = {...s.settings, currency: o.currency, savingsGoal: o.savingsGoal, smallThreshold: o.smallThreshold, keepMonths: o.keepMonths, lastBackup: o.lastBackup};
  return s;
}
const vsPrev = (diff, prev) => (diff >= 0 ? '▲ ' : '▼ ') + tr('{amount} vs {month}', {amount: money(Math.abs(diff),0), month: mLabel(prev)});

/* ============================== dashboard ============================== */
function renderDashboard(){
  const v = $('#view');
  if (!state.txns.length){ v.innerHTML = `<div class="pagehead"><h1>${tr('Dashboard')}</h1></div>` + emptyState() + (state.loans.length ? `<div class="grid" style="margin-top:16px">${loansDashCard()}</div>` : ''); return; }
  const m = ui.month, prev = addMonths(m, -1), s = monthStats(m), p = monthStats(prev), goal = state.settings.savingsGoal;
  const dExp = s.exp - p.exp;
  const sp = spendByCat(m);
  const cats = Object.entries(sp).filter(([,x]) => x > .005).sort((a,b) => b[1] - a[1]);
  const I = computeInsights(m);
  const months = lastN(m, 12), stats = months.map(monthStats);
  const budgeted = state.categories.filter(c => c.type === 'expense' && c.budget > 0);
  const rateCls = s.rate == null ? '' : s.rate * 100 >= goal ? 'ok' : s.rate < 0 ? 'bad' : 'warnc';

  v.innerHTML = `${demoBanner()}${backupBanner()}
  <div class="pagehead"><h1>${tr('Dashboard')}</h1>${monthPicker()}</div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span>${tr('Income')}</span><strong>${money(s.inc,0)}</strong><small>${p.n ? vsPrev(s.inc - p.inc, prev) : '&nbsp;'}</small></div>
    <div class="card kpi"><span>${tr('Spending')}</span><strong>${money(s.exp,0)}</strong><small class="${p.n ? (dExp > 0 ? 'bad' : 'ok') : ''}">${p.n ? vsPrev(dExp, prev) : '&nbsp;'}</small></div>
    <div class="card kpi"><span>${tr('Saved this month')}</span><strong style="color:${s.net >= 0 ? 'var(--good)' : 'var(--danger)'}">${money(s.net,0)}</strong><small>${s.sav > 0 ? tr('{amount} moved to savings', {amount: money(s.sav,0)}) : tr('income − spending')}</small></div>
    <div class="card kpi"><span>${tr('Savings rate')}</span><strong>${pct(s.rate)}</strong><small class="${rateCls}">${tr('Goal {n}%', {n: goal})}${s.rate != null && s.rate*100 < goal && I.gap > 0 ? ' · ' + tr('{amount} short', {amount: money(I.gap,0)}) : s.rate != null ? ' · ' + tr('on track') : ''}</small></div>
  </div>
  <div class="grid g2">
    <div class="card"><h2>${tr('Where it went')}</h2><p class="sub">${tr('{month} spending by category', {month: mLabel(m,true)})}</p>
      ${cats.length ? `<div class="chartbox sm"><canvas id="donut"></canvas></div>
      <ul class="catlist" style="margin-top:12px">${cats.map(([id,val]) => { const c = catOf(id); const b = c.budget; const r = b ? val / b : 0;
        return `<li><span class="dot" style="background:${esc(c.color)}"></span><span>${esc(catName(c))}</span><span class="amt">${money(val,0)}</span>
        <span class="meta">${s.exp > 0 ? tr('{n}% of spending', {n: Math.round(val / s.exp * 100)}) : ''}${b ? ` · ${tr('budget {amount}', {amount: money(b,0)})} <span class="bar"><i class="${r > 1 ? 'over' : r > .85 ? 'near' : ''}" style="width:${Math.min(100, r*100)}%"></i></span>` : ''}</span></li>`; }).join('')}</ul>`
      : `<p class="muted">${tr('No spending recorded for this month.')}</p>`}
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><h2>${tr('Last 12 months')}</h2><p class="sub">${tr('Income vs spending, with savings rate')}</p><div class="chartbox"><canvas id="trend"></canvas></div></div>
      <div class="card"><h2>${tr('Biggest savings levers')}</h2><p class="sub">${I.potential > 0 ? tr('Roughly {amount} a year on the table', {amount: `<b style="color:var(--good)">${money(I.potential,0)}</b>`}) : tr('Based on your last 3–12 months')}</p>
        ${I.levers.length ? I.levers.slice(0,3).map((l,i) => `<div class="lever"><span class="n">${i+1}</span><div class="t"><b>${esc(l.title)}</b><small>${esc(l.detail)}</small></div><span class="v">${tr('{amount}/yr', {amount: money(l.save,0)})}</span></div>`).join('') : `<p class="muted small">${tr('Not enough history yet — insights get sharper after 2–3 months of data.')}</p>`}
        <div style="margin-top:10px"><button class="btn" data-goto="insights">${tr('See all leaks →')}</button></div>
      </div>
      ${loansDashCard()}
    </div>
    ${budgeted.length ? `<div class="card span2"><h2>${tr('Budgets')}</h2><p class="sub">${mLabel(m,true)} · ${tr('{n} over budget', {n: budgeted.filter(c => (sp[c.id]||0) > c.budget).length})}</p>
      <div class="grid g2" style="gap:6px 28px">${budgeted.map(c => { const val = sp[c.id] || 0, r = val / c.budget;
        return `<div style="padding:6px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:5px"><span><span class="dot" style="display:inline-block;background:${esc(c.color)};margin-right:6px"></span>${esc(catName(c))}</span><span class="${r > 1 ? '' : 'muted'}" style="${r > 1 ? 'color:var(--danger);font-weight:600' : ''}">${money(val,0)} / ${money(c.budget,0)}</span></div><div class="bar"><i class="${r > 1 ? 'over' : r > .85 ? 'near' : ''}" style="width:${Math.min(100, r*100)}%"></i></div></div>`; }).join('')}</div></div>` : ''}
  </div>`;

  if (cats.length) chart('donut', {type:'doughnut', data:{labels: cats.map(([id]) => catName(catOf(id))), datasets:[{data: cats.map(([,x]) => Math.round(x*100)/100), backgroundColor: cats.map(([id]) => catOf(id).color), borderColor: cssVar('--surface'), borderWidth: 2}]},
    options:{maintainAspectRatio:false, cutout:'62%', plugins:{legend:{display:false}, tooltip:{callbacks:{label: c => ` ${c.label}: ${money(c.raw,0)}`}}}}});
  chart('trend', {data:{labels: months.map(x => mLabel(x)), datasets:[
      {type:'bar', label: tr('Income'), data: stats.map(x => Math.round(x.inc)), backgroundColor: cssVar('--good'), borderRadius:4, order:2},
      {type:'bar', label: tr('Spending'), data: stats.map(x => Math.round(x.exp)), backgroundColor: '#f97316', borderRadius:4, order:2},
      {type:'line', label: tr('Savings rate'), data: stats.map(x => x.rate == null ? null : Math.round(x.rate*100)), yAxisID:'y1', borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), tension:.3, pointRadius:3, spanGaps:true, order:1}]},
    options:{maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
      plugins:{legend:{position:'bottom', labels:{boxWidth:10, boxHeight:10}}, tooltip:{callbacks:{label: c => c.dataset.yAxisID === 'y1' ? ` ${c.dataset.label}: ${tr('{n}%', {n: c.raw})}` : ` ${c.dataset.label}: ${money(c.raw,0)}`}}},
      scales:{x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{callback: v => money(v,0)}}, y1:{position:'right', grid:{display:false}, ticks:{callback: v => tr('{n}%', {n: v})}, suggestedMin:0, suggestedMax:50}}}});
}

/* ============================== insights ============================== */
function renderInsights(){
  const v = $('#view');
  if (!state.txns.length){ v.innerHTML = `<div class="pagehead"><h1>${tr('Leaks & savings')}</h1></div>` + emptyState(); return; }
  const m = ui.month, I = computeInsights(m), S = state.settings;
  const yr = a => `${a}<span style="font-size:16px;font-weight:600">${tr('/yr')}</span>`;
  v.innerHTML = `${demoBanner()}<div class="pagehead"><h1>${tr('Leaks & savings')}</h1>${monthPicker()}</div>
  ${I.uncat ? `<div class="banner info"><span>${trn(I.uncat, '{n} transaction is uncategorised in the last 12 months — categorising it sharpens these insights.', '{n} transactions are uncategorised in the last 12 months — categorising them sharpens these insights.')}</span><button class="btn" data-action="showUncat">${tr('Categorise now')}</button></div>` : ''}
  <div class="grid g2">
    <div class="card span2"><div class="hero"><div><h2>${tr('Estimated savings potential')}</h2><p class="sub mt0">${tr('If you act on the levers below — based on {month} and the months before it.', {month: mLabel(m,true)})}</p></div><div class="big">${yr(money(I.potential,0))}</div></div>
      ${I.levers.length ? I.levers.map((l,i) => `<div class="lever"><span class="n">${i+1}</span><div class="t"><b>${esc(l.title)}</b><small>${esc(l.detail)}</small></div><span class="v">${tr('{amount}/yr', {amount: money(l.save,0)})}</span></div>`).join('') : `<p class="muted">${tr('No obvious leaks found yet. Insights sharpen after 2–3 months of data.')}</p>`}
    </div>
    <div class="card"><h2>${tr('Savings goal')}</h2><p class="sub">${tr('Target: save {n}% of income', {n: S.savingsGoal})}</p>
      ${I.st.inc > 0 ? `<table><tr><td>${tr('Income')}</td><td class="num">${money(I.st.inc,0)}</td></tr><tr><td>${tr('Spending')}</td><td class="num">${money(I.st.exp,0)}</td></tr><tr><td>${tr('Saved')}</td><td class="num"><b>${money(I.st.net,0)}</b> (${pct(I.st.rate)})</td></tr><tr><td>${tr('Goal')}</td><td class="num">${money(I.target,0)}</td></tr></table>
      <p style="margin:12px 0 0">${I.gap > 0 ? `<span class="pill warn">${tr('{amount} short', {amount: money(I.gap,0)})}</span> ${tr('Cutting about {amount} a month would hit your goal.', {amount: `<b>${money(I.gap,0)}</b>`})}` : `<span class="pill good">${tr('On track')}</span> ${tr('You beat your goal by {amount}.', {amount: money(-I.gap,0)})}`}</p>` : `<p class="muted">${tr('No income recorded this month, so the savings rate can’t be calculated.')}</p>`}
    </div>
    <div class="card"><h2>${tr('Small purchases')}</h2><p class="sub">${tr('Each ≤ {amount} — the classic leak', {amount: money(S.smallThreshold)})}</p>
      <div style="display:flex;gap:24px;margin-bottom:10px"><div class="kpi"><span>${tr('This month')}</span><strong>${money(I.smallTotal,0)}</strong><small>${trn(I.smallM.length, '{n} purchase', '{n} purchases')}</small></div><div class="kpi"><span>${tr('Yearly pace')}</span><strong>${money(I.smallAvg*12,0)}</strong><small>${tr('3-month average × 12')}</small></div></div>
      ${I.smallTop.length ? `<table><tr><th>${tr('Where')}</th><th class="num">${tr('Times')}</th><th class="num">${tr('Total')}</th></tr>${I.smallTop.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${x.n}×</td><td class="num">${money(x.total)}</td></tr>`).join('')}</table>` : ''}
    </div>
    <div class="card span2"><h2>${tr('Recurring charges')}</h2><p class="sub">${tr('Charged about once a month for at least 3 of the last 6 months · subscriptions & bills total {amount} (excluding housing, loans & savings)', {amount: `<b>${tr('{amount}/yr', {amount: money(I.recAnnual,0)})}</b>`})}</p>
      ${I.recurring.length ? `<div class="tablewrap"><table><tr><th>${tr('Charge')}</th><th class="hide-sm">${tr('Category')}</th><th class="num">${tr('Monthly')}</th><th class="num">${tr('Yearly')}</th><th class="num">${tr('Last')}</th></tr>
      ${I.recurring.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="hide-sm"><span class="dot" style="display:inline-block;background:${esc(catOf(r.cat).color)};margin-right:6px"></span>${esc(catName(catOf(r.cat)))}</td><td class="num">${money(r.monthly)}</td><td class="num">${money(r.annual,0)}</td><td class="num muted">${dLabel(r.last)}</td></tr>`).join('')}</table></div>
      <p class="small muted" style="margin:10px 0 0">${tr('Ask yourself for each one: did I use it last month? Would I sign up again today?')}</p>` : `<p class="muted">${tr('None detected yet — needs at least 3 months of data.')}</p>`}
    </div>
    <div class="card"><h2>${tr('Over budget')}</h2><p class="sub">${mLabel(m,true)}</p>
      ${I.overBudget.length ? `<table>${I.overBudget.map(o => `<tr><td>${esc(catName(o.cat))}</td><td class="num">${money(o.spent,0)} / ${money(o.budget,0)}</td><td class="num"><span class="pill bad">+${money(o.excess,0)}</span></td></tr>`).join('')}</table>` : `<p class="muted">${state.categories.some(c => c.budget > 0) ? tr('Everything is within budget. 👏') : tr('No budgets set yet.')} <a href="#setup">${tr('Set budgets')}</a></p>`}
    </div>
    <div class="card"><h2>${tr('Rising categories')}</h2><p class="sub">${tr('vs your previous 3-month average')}</p>
      ${I.rising.length ? `<table>${I.rising.map(o => `<tr><td>${esc(catName(o.cat))}</td><td class="num">${money(o.spent,0)} <span class="muted small">${tr('vs {amount}', {amount: money(o.avg,0)})}</span></td><td class="num"><span class="pill warn">+${money(o.diff,0)}</span></td></tr>`).join('')}</table>` : `<p class="muted">${tr('No category jumped noticeably this month.')}</p>`}
    </div>
    <div class="card"><h2>${tr('Top merchants')}</h2><p class="sub">${tr("Where most of {month}'s money went", {month: mLabel(m,true)})}</p>
      ${I.topMerchants.length ? `<table>${I.topMerchants.map(x => `<tr><td>${esc(x.name)}<div class="small muted">${esc(catName(catOf(x.cat)))}</div></td><td class="num muted">${x.n}×</td><td class="num"><b>${money(x.total,0)}</b></td></tr>`).join('')}</table>` : `<p class="muted">${tr('No spending this month.')}</p>`}
    </div>
    <div class="card"><h2>${tr('Bank fees')}</h2><p class="sub">${tr('Last 12 months')}</p>
      <div class="kpi"><strong style="color:${I.fees12 > 0 ? 'var(--danger)' : 'var(--good)'}">${money(I.fees12,0)}</strong><small>${I.fees12 >= 20 ? tr('Worth comparing with a no-fee bank.') : tr('Low — nice.')}</small></div>
    </div>
  </div>`;
}

/* ============================== transactions ============================== */
function catOptions(sel, withAll){
  const groups = [['expense','Spending'],['income','Income'],['transfer','Transfers']];
  return (withAll ? `<option value="">${tr('All categories')}</option>` : '') + groups.map(([ty,label]) => {
    const cs = state.categories.filter(c => c.type === ty).sort((a,b) => (a.id === 'uncat') - (b.id === 'uncat') || catName(a).localeCompare(catName(b), LOCALE()));
    return cs.length ? `<optgroup label="${tr(label)}">${cs.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(catName(c))}</option>`).join('')}</optgroup>` : '';
  }).join('');
}
function renderTransactions(){
  const ms = monthsWithData();
  // only pre-filter on a month the filter can actually show, otherwise the select says "All months" while the list is filtered
  if (ui.tx.month === null) ui.tx.month = ms.includes(ui.month) ? ui.month : '';
  $('#view').innerHTML = `${demoBanner()}<div class="pagehead"><h1>${tr('Transactions')}</h1><div class="btnrow"><button class="btn" data-action="exportCSV">${tr('Export CSV')}</button><button class="btn primary" data-action="openAdd">${tr('+ Add')}</button></div></div>
  <div class="card">
    <div class="filters">
      <select class="inp" id="fMonth"><option value="">${tr('All months')}</option>${ms.map(m => `<option value="${m}" ${m === ui.tx.month ? 'selected' : ''}>${mLabel(m,true)}</option>`).join('')}</select>
      <select class="inp" id="fCat">${catOptions(ui.tx.cat, true)}</select>
      <input class="inp" id="fQ" type="search" placeholder="${tr('Search description or note…')}" value="${esc(ui.tx.q)}">
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
  $('#txList').innerHTML = list.length ? `<div class="summary"><span>${trn(list.length, '{n} transaction', '{n} transactions')}${list.length > 500 ? tr(' (showing 500)') : ''}</span><span>${tr('Spent {out} · Income {inc}', {out: money(out,0), inc: money(inc,0)})}</span></div>
    ${shown.map(t => `<div class="tx"><div class="tx-date">${dLabel(t.date)}</div>
      <div style="min-width:0"><div class="tx-desc" title="${esc(t.desc)}">${esc(t.desc)}</div>${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}<select data-action="setCat" data-id="${esc(t.id)}" aria-label="${tr('Category')}">${catOptions(catOf(t.cat).id)}</select></div>
      <div class="tx-amt ${t.amount > 0 ? 'pos' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount,2)}</div>
      <button class="icon-btn sm" data-action="delTx" data-id="${esc(t.id)}" title="${tr('Delete')}" aria-label="${tr('Delete')}">×</button></div>`).join('')}`
    : `<p class="muted" style="padding:20px 4px">${tr('No transactions match.')} ${state.txns.length ? '' : tr('{link} to get started.', {link: `<a href="#import">${tr('Import a bank CSV')}</a>`})}</p>`;
}
function setCategory(id, cat){
  const t = state.txns.find(x => x.id === id); if (!t) return;
  t.cat = cat;
  const k = merchantKey(t.desc), c = catOf(cat);
  const similar = state.txns.filter(x => x !== t && merchantKey(x.desc) === k && catOf(x.cat).id !== cat);
  if (similar.length && confirm(trn(similar.length, 'Also move {n} other "{merchant}" transaction to {cat}, and categorise future ones automatically?', 'Also move {n} other "{merchant}" transactions to {cat}, and categorise future ones automatically?', {merchant: titleCase(k), cat: catName(c)}))){
    similar.forEach(x => x.cat = cat);
    addRule(k, cat);
    toast(tr('Moved {n} transactions and saved a rule', {n: similar.length + 1}));
    save(); updateTxList(); return;
  }
  save(); toast(tr('Set to {cat}', {cat: catName(c)}));
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
  if (!text.trim()){ toast(tr('That file looks empty'), true); return; }
  const d = detectDelim(text), rows = splitCSV(text, d);
  if (!rows.length){ toast(tr('Couldn’t find any rows in that file — is it a CSV export?'), true); return; }
  const freq = {}; rows.forEach(r => freq[r.length] = (freq[r.length] || 0) + 1);
  const mode = +Object.entries(freq).sort((a,b) => b[1] - a[1] || b[0] - a[0])[0][0];
  if (mode < 2){ toast(tr('Couldn’t find columns in that file — is it a CSV export?'), true); return; }
  let hi = rows.findIndex(r => r.length >= mode);
  const looksData = rows[hi].some(c => parseDate(c)) && rows[hi].some(c => parseAmount(c) != null && !parseDate(c));
  const header = looksData ? rows[hi].map((_, i) => tr('Column {n}', {n: i+1})) : rows[hi].map((h, i) => h || tr('Column {n}', {n: i+1}));
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
    const desc = String(M.desc >= 0 ? (r[M.desc] ?? '') : '').replace(/\s+/g, ' ').trim() || tr('(no description)');
    out.push({id: uid(), date, desc, amount: Math.round(amt * 100) / 100, src:'csv', ...(I.account ? {note: I.account} : {})});
  }
  const ex = new Map(); state.txns.forEach(t => { const k = txKey(t); ex.set(k, (ex.get(k) || 0) + 1); });
  const fresh = []; let dupes = 0;
  for (const t of out){ const k = txKey(t), c = ex.get(k) || 0; if (c > 0){ ex.set(k, c - 1); dupes++; } else { t.cat = autoCat(t); fresh.push(t); } }
  return {fresh, dupes, errors, total: out.length};
}
function renderImport(){
  const v = $('#view'), I = ui.imp;
  let html = `<div class="pagehead"><h1>${tr('Import from your bank')}</h1></div>
  <div class="grid g2">
    <div class="card"><h2>${tr('1 · Choose your bank export')}</h2><p class="sub">${tr(`CSV from your bank's website or app (usually under "Télécharger / Exporter les opérations"). Import each account separately; re-importing overlapping dates is fine — duplicates are skipped.`)}</p>
      <label class="drop" id="drop"><input type="file" id="csvFile" accept=".csv,.txt,.tsv,text/csv" hidden><b>${I ? esc(I.name) : tr('Drop a CSV file here')}</b><small>${I ? tr('Choose another file') : tr('or click to choose a file')}</small></label>
      <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">${tr('…or paste the CSV text')}</summary><textarea class="inp" id="pasteCSV" placeholder="Date;Libellé;Montant&#10;05/10/2026;CB MONOPRIX;-23,40" style="margin-top:8px"></textarea><button class="btn" data-action="pasteImport" style="margin-top:8px">${tr('Read pasted text')}</button></details>
    </div>
    <div class="card"><h2>${tr('Tips')}</h2><ul class="small muted" style="padding-left:18px;margin:0">
      <li>${tr('Most French banks (BNP, Société Générale, Crédit Agricole, LCL, Boursorama, Revolut…) offer CSV export. If yours only offers Excel, open it and "Save as CSV".')}</li>
      <li>${tr(`Expenses should end up <b>negative</b>, income <b>positive</b>. If it's the other way round, tick "Flip signs".`)}</li>
      <li>${tr(`Transfers to your own savings (Livret A, etc.) go to "Savings & own transfers" so they don't count as spending.`)}</li>
      <li>${tr('Loan repayments go to "Loans & credit" — link them to a loan in the Loans tab to see your milestones.')}</li>
      <li>${tr('After importing, fix a few categories in Transactions — the app learns a rule each time.')}</li></ul></div>`;
  if (I){
    const opt = sel => `<option value="-1">—</option>` + I.header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const res = buildImport();
    const dates = res.fresh.map(t => t.date).sort();
    const nf = res.fresh.length;
    html += `<div class="card span2"><h2>${tr('2 · Check the columns')}</h2><p class="sub">${tr("I've guessed the columns — fix any that look wrong in the preview.")}</p>
      <div class="mapgrid">
        <label class="field">${tr('Date')}<select data-imp="date">${opt(I.map.date)}</select></label>
        <label class="field">${tr('Description')}<select data-imp="desc">${opt(I.map.desc)}</select></label>
        <label class="field">${tr('Amount (single column)')}<select data-imp="amount">${opt(I.map.amount)}</select></label>
        <label class="field">${tr('…or Debit column')}<select data-imp="debit" ${I.map.amount >= 0 ? 'disabled' : ''}>${opt(I.map.debit)}</select></label>
        <label class="field">${tr('…and Credit column')}<select data-imp="credit" ${I.map.amount >= 0 ? 'disabled' : ''}>${opt(I.map.credit)}</select></label>
        <label class="field">${tr('Date format')}<select data-impopt="datefmt"><option value="dmy" ${I.datefmt === 'dmy' ? 'selected' : ''}>${tr('DD/MM/YYYY')}</option><option value="mdy" ${I.datefmt === 'mdy' ? 'selected' : ''}>${tr('MM/DD/YYYY')}</option></select></label>
        <label class="field">${tr('Account label (optional)')}<input data-impopt="account" value="${esc(I.account)}" placeholder="${tr('e.g. BNP current')}"></label>
      </div>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" data-impopt="invert" ${I.invert ? 'checked' : ''}> ${tr('Flip signs (my file shows expenses as positive numbers)')}</label>
      <p style="margin:0 0 10px">${trn(nf, '{n} new transaction', '{n} new transactions', {n: `<b>${nf}</b>`})}${dates.length ? tr(' from {from} to {to}', {from: dLabel(dates[0]) + ' ' + dates[0].slice(0,4), to: dLabel(dates[dates.length-1]) + ' ' + dates[dates.length-1].slice(0,4)}) : ''}
        ${res.dupes ? ` · <span class="pill">${tr('{n} already imported', {n: res.dupes})}</span>` : ''}${res.errors ? ` · <span class="pill warn">${tr('{n} rows skipped (no valid date/amount)', {n: res.errors})}</span>` : ''}
        · <span class="pill">${tr('{n} uncategorised', {n: res.fresh.filter(t => t.cat === 'uncat').length})}</span></p>
      ${nf ? `<div class="tablewrap"><table><tr><th>${tr('Date')}</th><th>${tr('Description')}</th><th>${tr('Category')}</th><th class="num">${tr('Amount')}</th></tr>
        ${res.fresh.slice(0, 8).map(t => `<tr><td class="muted" style="white-space:nowrap">${t.date}</td><td>${esc(t.desc)}</td><td><span class="dot" style="display:inline-block;background:${esc(catOf(t.cat).color)};margin-right:6px"></span>${esc(catName(catOf(t.cat)))}</td><td class="num ${t.amount > 0 ? 'pos' : ''}">${money(t.amount,2)}</td></tr>`).join('')}</table></div>
        ${nf > 8 ? `<p class="small muted">${tr('…and {n} more', {n: nf - 8})}</p>` : ''}` : ''}
      <div class="btnrow" style="margin-top:14px"><button class="btn primary" data-action="commitImport" ${nf ? '' : 'disabled'}>${trn(nf, 'Import {n} transaction', 'Import {n} transactions')}</button><button class="btn" data-action="cancelImport">${tr('Cancel')}</button></div>
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
  r.onerror = () => toast(tr('Could not read that file'), true);
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
  toast(tr('Imported {n} transactions', {n: res.fresh.length}) + (res.dupes ? tr(', skipped {n} duplicates', {n: res.dupes}) : '') + (pruned ? tr(', removed {n} older than {months} months', {n: pruned, months: state.settings.keepMonths}) : ''));
  if (unc){ ui.tx = {month:'', cat:'uncat', q:''}; go('transactions'); setTimeout(() => toast(tr('{n} need a category — pick one and the app will remember it', {n: unc})), 3900); }
  else go('dashboard');
}

/* ============================== setup ============================== */
function renderSetup(){
  const S = state.settings, avg = avgSpend(ui.month, 3);
  const cats = state.categories.slice().sort((a,b) => ({expense:0,income:1,transfer:2}[a.type] - {expense:0,income:1,transfer:2}[b.type]));
  const dates = state.txns.map(t => t.date).sort();
  $('#view').innerHTML = `${demoBanner()}<div class="pagehead"><h1>${tr('Budgets & settings')}</h1></div>
  <div class="grid">
    ${cloud() ? familyCard() + accountCard() : ''}
    <div class="card"><h2>${tr('Preferences')}</h2><p class="sub">${tr('Used across the dashboard and insights')}${cloud() ? tr(' · shared with everyone in this budget') : ''}</p>
      <div class="setrow">
        <label class="field">${tr('Currency')}<select data-setting="currency">${CURRENCIES.map(c => `<option ${c === S.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field">${tr('Savings goal (% of income)')}<input type="number" min="0" max="90" step="1" data-setting="savingsGoal" value="${S.savingsGoal}"></label>
        <label class="field">${tr('"Small purchase" threshold')}<input type="number" min="1" step="1" data-setting="smallThreshold" value="${S.smallThreshold}"></label>
        <label class="field">${tr('Keep history')}<select data-setting="keepMonths">${KEEP_OPTIONS.map(([n, l]) => `<option value="${n}" ${n === S.keepMonths ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></label>
      </div>
      <p class="small muted" style="margin:10px 0 0">${tr('"Paid last year" figures on the Loans tab need at least 24 months of history.')}</p>
    </div>
    <div class="card"><div class="pagehead" style="margin-bottom:6px"><div><h2>${tr('Categories & monthly budgets')}</h2><p class="sub mt0">${tr('"3-mo avg" shows what you actually spend, so you can set realistic budgets. Leave budget at 0 for none.')}</p></div>
      <div class="btnrow"><button class="btn" data-action="suggestBudgets">${tr('Suggest budgets')}</button><button class="btn" data-action="addCat">${tr('+ Category')}</button></div></div>
      <div class="tablewrap"><table class="cattable"><tr><th></th><th>${tr('Name')}</th><th class="hide-sm">${tr('Type')}</th><th class="num hide-sm">${tr('3-mo avg')}</th><th class="num">${tr('Budget / mo')}</th><th></th></tr>
      ${cats.map(c => `<tr><td><input type="color" value="${esc(c.color)}" data-cat="${esc(c.id)}" data-field="color" aria-label="${tr('Colour')}"></td>
        <td><input class="inp" value="${esc(catName(c))}" data-cat="${esc(c.id)}" data-field="name"></td>
        <td class="hide-sm"><select class="inp" data-cat="${esc(c.id)}" data-field="type" ${PROTECTED_CATS.has(c.id) ? 'disabled' : ''}><option value="expense" ${c.type === 'expense' ? 'selected' : ''}>${tr('Spending')}</option><option value="income" ${c.type === 'income' ? 'selected' : ''}>${tr('Income')}</option><option value="transfer" ${c.type === 'transfer' ? 'selected' : ''}>${tr('Transfer (ignored)')}</option></select></td>
        <td class="num muted hide-sm">${c.type === 'expense' && avg[c.id] ? money(avg[c.id],0) : '—'}</td>
        <td class="num">${c.type === 'expense' ? `<input class="inp budget" type="number" min="0" step="10" value="${c.budget || 0}" data-cat="${esc(c.id)}" data-field="budget">` : ''}</td>
        <td>${PROTECTED_CATS.has(c.id) ? '' : `<button class="icon-btn sm" data-action="delCat" data-id="${esc(c.id)}" title="${tr('Delete category')}" aria-label="${tr('Delete category')}">×</button>`}</td></tr>`).join('')}
      </table></div>
    </div>
    <div class="card"><div class="pagehead" style="margin-bottom:6px"><div><h2>${tr('Auto-categorisation rules')}</h2><p class="sub mt0">${tr('If a description contains the keyword, it goes to that category. Longer keywords win. {n} rules.', {n: state.rules.length})}</p></div>
      <div class="btnrow"><button class="btn" data-action="recat">${tr('Re-apply to uncategorised')}</button><button class="btn" data-action="addRule">${tr('+ Rule')}</button></div></div>
      <input class="inp" id="ruleQ" type="search" placeholder="${tr('Filter rules…')}" value="${esc(ui.ruleQ)}" style="width:100%;margin-bottom:10px">
      <div class="rules" id="rulesBox"></div>
    </div>
    <div class="card"><h2>${tr('Your data')}</h2><p class="sub">${trn(state.txns.length, '{n} transaction', '{n} transactions')} · ${trn(state.loans.length, '{n} loan', '{n} loans')}${dates.length ? ` · ${dates[0]} → ${dates[dates.length - 1]}` : ''} · ${tr('last backup: {date}', {date: S.lastBackup ? new Date(S.lastBackup).toLocaleDateString(LOCALE()) : tr('never')})}</p>
      <div class="btnrow">
        <button class="btn primary" data-action="exportJSON">${tr('Export backup (.json)')}</button>
        <button class="btn" data-action="restore">${tr('Restore backup')}</button>
        <button class="btn" data-action="exportCSV">${tr('Export transactions (.csv)')}</button>
        ${hasDemoData() ? `<button class="btn" data-action="removeDemo">${tr('Remove demo data')}</button>` : `<button class="btn" data-action="demo">${tr('Load demo data')}</button>`}
        <button class="btn danger" data-action="clearBudget">${tr('Clear this budget')}</button>
      </div>
      <p class="small muted" style="margin:12px 0 0">${cloud() ? tr('Everything is stored in your private Supabase database and shared only with the members of this budget. Moving over from the old single-file version? Export a backup there and use "Restore backup" here.') : tr('Local mode: data is stored only in this browser. To use the app on your phone and computer, export a backup on one and restore it on the other.')}</p>
    </div>
  </div>`;
  updateRules();
}
function updateRules(){
  const q = norm(ui.ruleQ);
  const list = state.rules.map((r, i) => ({...r, i})).filter(r => !q || norm(r.kw).includes(q) || norm(catName(catOf(r.cat))).includes(q));
  $('#rulesBox').innerHTML = list.length ? list.map(r => `<div class="r"><input value="${esc(r.kw)}" data-rule="${r.i}" data-field="kw" aria-label="${tr('Keyword')}"><select data-rule="${r.i}" data-field="cat" aria-label="${tr('Category')}">${catOptions(r.cat)}</select><button class="icon-btn sm" data-action="delRule" data-i="${r.i}" aria-label="${tr('Delete rule')}">×</button></div>`).join('') : `<p class="muted small" style="padding:10px">${tr('No rules match.')}</p>`;
}
function familyCard(){
  const H = Store.household, me = Store.user, owner = H.role === 'owner';
  return `<div class="card"><h2>${tr('Budget & members')}</h2><p class="sub">${tr('Everyone below sees and edits the same transactions, budgets and loans in this budget.')}${Store.households.length > 1 ? tr(' Switch budgets from the menu at the top right.') : ''}</p>
    <div class="setrow" style="align-items:flex-end;margin-bottom:14px">
      <label class="field">${tr('Budget name')}<input class="inp" id="hhName" value="${esc(H.name)}" maxlength="80" ${owner ? '' : 'disabled'}></label>
      <div class="field">${tr('Invite code')}<div class="btnrow" style="align-items:center"><code class="invite">${esc(H.invite_code)}</code><button class="btn" data-action="copyInvite">${tr('Copy invitation')}</button>${owner ? `<button class="btn" data-action="newInvite" title="${tr('The old code stops working')}">${tr('New code')}</button>` : ''}</div></div>
    </div>
    <p class="small muted" style="margin:0 0 12px">${tr('To add someone: send them the invitation. They create an account on this website, then enter the code.')}</p>
    <table>${Store.members.map(m => `<tr><td><b>${esc(m.display_name || (m.email || '').split('@')[0])}</b>${m.user_id === me.id ? ` <span class="pill">${tr('you')}</span>` : ''}<div class="small muted">${esc(m.email || '')}</div></td>
      <td class="num">${m.role === 'owner' ? `<span class="pill good">${tr('owner')}</span>` : ''}</td>
      <td class="num">${m.user_id === me.id ? (owner ? '' : `<button class="btn danger" data-action="leaveFamily">${tr('Leave')}</button>`) : owner ? `<button class="btn danger" data-action="removeMember" data-id="${esc(m.user_id)}">${tr('Remove')}</button>` : ''}</td></tr>`).join('')}</table>
    ${owner ? `<p class="small muted" style="margin:14px 0 8px">${tr('Deleting the budget removes it for every member, with all its transactions and loans.')}</p><button class="btn danger" data-action="deleteBudget">${tr('Delete this budget')}</button>` : ''}
  </div>`;
}
function accountCard(){
  const u = Store.user;
  return `<div class="card"><h2>${tr('Your account')}</h2><p class="sub">${tr('Signed in as {name} · {email}', {name: `<b>${esc(u.name)}</b>`, email: esc(u.email)})}</p>
    <form class="setrow" data-form="changePassword" style="align-items:flex-end">
      <input type="text" name="username" value="${esc(u.email)}" autocomplete="username" hidden>
      <label class="field">${tr('New password')}<input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>
      <div class="btnrow"><button class="btn" type="submit">${tr('Change password')}</button><button class="btn danger" type="button" data-action="signOut">${tr('Sign out')}</button></div>
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
    cleanLoan({name: tr('House – demo bank'), kind: 'house', principal: 240000, rate: 3.4, start_date: `${y - 5}-03-05`, term_months: 300, insurance: 38.5, keyword: 'pret immo 0012345', src: 'demo'}),
    cleanLoan({name: tr('Car – demo finance'), kind: 'car', principal: 24000, rate: 4.9, start_date: `${y - 3}-06-10`, term_months: 60, keyword: 'diac credit auto', src: 'demo'})
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
let gateMode = null, gateArgs = [];
function renderGate(mode, msg, ok){
  gateMode = mode; gateArgs = [msg, ok]; appStarted = false;
  document.body.classList.add('gate');
  Object.values(charts).forEach(c => c.destroy()); charts = {};
  const u = Store.user;
  const err = msg ? `<p class="${ok ? 'formok' : 'formerr'}" role="alert">${esc(msg)}</p>` : `<p class="formerr" role="alert" hidden></p>`;
  const email = (auto) => `<label class="field">${tr('Email')}<input class="inp" name="email" type="email" autocomplete="${auto || 'email'}" required></label>`;
  const min8 = `<small class="muted">${tr('at least 8 characters')}</small>`;
  const views = {
    loading: () => `<div class="gatecard card"><p class="muted" style="margin:0">${esc(msg || tr('Loading…'))}</p></div>`,
    error: () => `<div class="gatecard card"><h1>${tr('Something went wrong')}</h1><p class="sub">${esc(msg)}</p><button class="btn primary" data-action="reload">${tr('Reload')}</button></div>`,
    signin: () => `<div class="gatecard card"><h1>${tr('Sign in')}</h1><p class="sub">${tr("Your family's spending, budgets and loans in one place.")}</p>
      <form data-form="signin">${email('username')}<label class="field">${tr('Password')}<input class="inp" name="password" type="password" autocomplete="current-password" required></label>${err}<button class="btn primary" type="submit">${tr('Sign in')}</button></form>
      <div class="gatelinks"><a href="#" data-gate="forgot">${tr('Forgot password?')}</a><a href="#" data-gate="signup">${tr('Create an account')}</a></div></div>`,
    signup: () => `<div class="gatecard card"><h1>${tr('Create your account')}</h1><p class="sub">${tr('Joining a family budget? Create your account first, then enter the invite code you were sent.')}</p>
      <form data-form="signup"><label class="field">${tr('Your first name')}<input class="inp" name="name" autocomplete="given-name" required maxlength="40"></label>${email()}<label class="field">${tr('Password')} ${min8}<input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>${err}<button class="btn primary" type="submit">${tr('Create account')}</button></form>
      <div class="gatelinks"><a href="#" data-gate="signin">${tr('I already have an account')}</a></div></div>`,
    confirm: () => `<div class="gatecard card"><h1>${tr('Check your inbox')}</h1><p class="sub">${tr('We sent you a link to confirm your email address. Click it, then come back here and sign in.')}</p><button class="btn primary" data-gate="signin">${tr('Go to sign in')}</button></div>`,
    forgot: () => `<div class="gatecard card"><h1>${tr('Reset your password')}</h1><p class="sub">${tr("Enter your email and we'll send you a link to choose a new password.")}</p>
      <form data-form="forgot">${email()}${err}<button class="btn primary" type="submit">${tr('Send reset link')}</button></form>
      <div class="gatelinks"><a href="#" data-gate="signin">${tr('Back to sign in')}</a></div></div>`,
    recovery: () => `<div class="gatecard card"><h1>${tr('Choose a new password')}</h1><p class="sub">${tr('For {email}', {email: esc(u ? u.email : tr('your account'))})}</p>
      <form data-form="recovery"><input type="text" name="username" value="${esc(u ? u.email : '')}" autocomplete="username" hidden><label class="field">${tr('New password')} ${min8}<input class="inp" name="password" type="password" minlength="8" autocomplete="new-password" required></label>${err}<button class="btn primary" type="submit">${tr('Save password')}</button></form></div>`,
    household: () => `<div class="gatecard card wide"><h1>${u ? tr('Welcome, {name}!', {name: esc(u.name)}) : tr('Welcome!')}</h1><p class="sub">${tr('Set up a family budget, or join the one a family member already created.')}</p>
      ${err}
      <div class="grid g2" style="margin-top:12px">
        <form data-form="createFamily" class="card flat"><h2>${tr('Start a new family budget')}</h2><p class="sub">${tr("You'll get an invite code to share with your family.")}</p>
          <label class="field">${tr('Name')}<input class="inp" name="name" maxlength="80" value="${esc(u ? tr('{name}’s family', {name: u.name}) : tr('Our family'))}" required></label><p class="formerr" role="alert" hidden></p><button class="btn primary" type="submit">${tr('Create')}</button></form>
        <form data-form="joinFamily" class="card flat"><h2>${tr('Join your family')}</h2><p class="sub">${tr('Enter the code from the invitation you received.')}</p>
          <label class="field">${tr('Invite code')}<input class="inp" name="code" autocomplete="off" autocapitalize="characters" placeholder="${tr('e.g. 7F3A9C21B0')}" required></label><p class="formerr" role="alert" hidden></p><button class="btn primary" type="submit">${tr('Join')}</button></form>
      </div>
      <div class="gatelinks"><a href="#" data-action="signOut">${tr('Sign out')}</a></div></div>`
  };
  $('#view').innerHTML = `<div class="gatewrap">${views[mode]()}</div>`;
  const first = $('#view input:not([hidden])'); if (first && mode !== 'loading') first.focus();
}
function formMsg(form, msg, ok){
  const p = form.querySelector('.formerr, .formok') || form.parentElement.querySelector('.formerr, .formok');
  if (!p) { toast(msg, !ok); return; }
  p.className = ok ? 'formok' : 'formerr'; p.textContent = msg; p.hidden = !msg;
}
// Supabase and database messages are English: show the known ones in the reader's language
const friendly = e => {
  const m = (e && e.message) || String(e);
  const known = [
    [/Invalid login credentials/i, 'Wrong email or password.'],
    [/Email not confirmed/i, 'Please confirm your email first — check your inbox for the link.'],
    [/already registered|already been registered/i, 'There is already an account with this email. Sign in instead, or reset your password.'],
    [/rate limit|too many/i, 'Too many attempts — please wait a few minutes and try again.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Can’t reach the server. Check your internet connection.'],
    [/Password should be at least/i, 'Use at least 8 characters for your password.'],
    [/invite code was not found/i, 'That invite code was not found — check it with the person who sent it.'],
    [/already a member of this budget/i, 'You are already a member of this budget.'],
    [/Only the owner of this budget can delete it/i, 'Only the owner of this budget can delete it.'],
    [/Only the owner of this budget/i, 'Only the owner of this budget can do this.'],
    [/Please sign in first/i, 'Please sign in first.'],
    [/link is invalid or has expired|otp_expired/i, 'This link is invalid or has expired. Please request a new one.']
  ];
  for (const [re, msg] of known) if (re.test(m)) return tr(msg);
  return m;
};
async function onGateSubmit(form){
  const f = form, kind = f.dataset.form, btn = f.querySelector('button[type=submit]');
  const val = n => (f.elements[n] ? f.elements[n].value.trim() : '');
  btn.disabled = true; formMsg(f, '');
  try {
    if (kind === 'signin'){ const next = await Store.signIn(val('email'), f.elements.password.value); if (next === 'app') return startApp(); renderGate('household'); }
    else if (kind === 'signup'){
      if (f.elements.password.value.length < 8) throw new Error(tr('Use at least 8 characters for your password.'));
      const next = await Store.signUp(val('name'), val('email'), f.elements.password.value);
      renderGate(next === 'confirm' ? 'confirm' : 'household');
    }
    else if (kind === 'forgot'){ await Store.sendReset(val('email')); formMsg(f, tr('If that email has an account, a reset link is on its way.'), true); }
    else if (kind === 'recovery'){
      if (f.elements.password.value.length < 8) throw new Error(tr('Use at least 8 characters for your password.'));
      await Store.updatePassword(f.elements.password.value); toast(tr('Password updated'));
      return (await Store.loadHouseholds()) ? startApp() : renderGate('household');
    }
    else if (kind === 'createFamily'){ await Store.createHousehold(val('name')); toast(tr('Budget created — invite your family from Settings & members')); return startApp(); }
    else if (kind === 'joinFamily'){ await Store.joinHousehold(val('code')); toast(tr('You joined {name}', {name: Store.household.name})); return startApp(); }
    else if (kind === 'changePassword'){
      if (f.elements.password.value.length < 8) throw new Error(tr('Use at least 8 characters for your password.'));
      await Store.updatePassword(f.elements.password.value); f.reset(); toast(tr('Password changed'));
    }
  } catch (e){ formMsg(f, friendly(e)); }
  finally { btn.disabled = false; }
}

/* ============================== app start ============================== */
async function startApp(){
  renderGate('loading', tr('Loading your budget…'));
  let raw;
  try { raw = await Store.loadData(); }
  catch (e){ return renderGate('error', tr('Could not load your data: {error}', {error: friendly(e)})); }
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
  if (cloud() && u){
    av.hidden = false; av.textContent = (u.name || u.email || '?').trim().slice(0, 1).toUpperCase(); av.title = `${u.name} · ${Store.household.name}`;
    renderUserMenu();
  }
  else av.hidden = true;
  const backupLink = `<a href="#setup">${tr('Export a backup')}</a>`;
  $('footer').innerHTML = cloud()
    ? tr('Signed in as {name} · {budget}. Your data is stored in your private database. {link} now and then.', {name: esc(u.name), budget: esc(Store.household.name), link: backupLink})
    : tr('Local mode: your data is saved only in this browser on this device. {link} regularly, and use it to move your data to another device.', {link: backupLink});
  updateSync();
}
// Account menu: who is signed in, every budget they can open (✓ = the one on screen), and account actions
function renderUserMenu(){
  const u = Store.user, cur = Store.household;
  $('#userMenu').innerHTML = `<div class="who"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div>
    <div class="menulabel">${tr('Your budgets')}</div>
    ${Store.households.map(h => `<button type="button" role="menuitemradio" aria-checked="${h.id === cur.id}" data-action="switchBudget" data-id="${esc(h.id)}"><span class="tick" aria-hidden="true">${h.id === cur.id ? '✓' : ''}</span><span class="bname">${esc(h.name)}${h.role === 'owner' ? '' : `<small>${tr('shared with you')}</small>`}</span></button>`).join('')}
    <button type="button" role="menuitem" data-action="createBudget"><span class="tick" aria-hidden="true">+</span>${tr('New budget')}</button>
    <button type="button" role="menuitem" data-action="joinBudget"><span class="tick" aria-hidden="true"></span>${tr('Join a budget with a code')}</button>
    <div class="sep"></div>
    <button type="button" role="menuitem" data-goto="setup">${tr('Settings & members')}</button>
    <button type="button" role="menuitem" data-action="signOut" class="out">${tr('Sign out')}</button>`;
}
// After the budget on screen changed (switched, created, joined, left or deleted): load it, or ask to set one up
function openCurrentBudget(msg){
  if (msg) toast(msg);
  return Store.household ? startApp() : renderGate('household');
}
function updateSync(){
  const el = $('#sync'), s = Store.status;
  el.hidden = !cloud() || !appStarted;
  el.className = 'sync' + (s === 'error' ? ' err' : '');
  el.textContent = s === 'saving' ? tr('Saving…') : s === 'error' ? tr('⚠ Not saved — retry') : tr('✓ Saved');
  el.title = s === 'error' ? tr('Your last changes are not saved yet.') + ' ' + friendly(Store.lastError) : tr('All changes are saved');
}
// Switch the interface language; everything on screen is redrawn in the new language
function setLang(l){
  LANG = l === 'fr' ? 'fr' : 'en';
  try { localStorage.setItem(LANG_KEY, LANG); } catch (e) {}
  for (const k in nfCache) delete nfCache[k];
  applyStaticI18n();
  if (appStarted){ renderChrome(); render(); }
  else if (gateMode) renderGate(gateMode, ...gateArgs);
  if ($('#loanDialog').open) loanHint();
}
Store.on('status', (s, err) => {
  updateSync();
  if (s === 'error') toast(cloud() ? tr('Couldn’t save your changes: {error}', {error: friendly(err)}) : tr('Could not save — browser storage is blocked or full. Export a backup now.'), true);
});
Store.on('remote', cfg => {
  const fresh = migrate({...cfg, txns: state.txns, loans: state.loans});
  state.categories = fresh.categories; state.rules = fresh.rules; state.settings = fresh.settings;
  catMap = null; ruleCache = null;
  toast(tr('Someone else changed the settings at the same time. Their version was kept — please check and redo your last change.'), true);
  render();
});
Store.on('signedOut', () => location.reload());

/* ============================== events ============================== */
function setUserMenu(open){
  $('#userMenu').hidden = !open; $('#userBtn').setAttribute('aria-expanded', String(open));
  if (open) ($('#userMenu [aria-checked=true]') || $('#userMenu [role=menuitem]')).focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#userMenu').hidden){ setUserMenu(false); $('#userBtn').focus(); } });
document.addEventListener('click', e => {
  // the account menu closes on any click except the one that toggles it; a chosen item still runs below
  if (!$('#userMenu').hidden && !e.target.closest('[data-action="userMenu"]')) setUserMenu(false);
  const gl = e.target.closest('[data-gate]'); if (gl){ e.preventDefault(); renderGate(gl.dataset.gate); return; }
  const tab = e.target.closest('#tabs button'); if (tab){ go(tab.dataset.tab); return; }
  const g = e.target.closest('[data-goto]'); if (g){ e.preventDefault(); if (appStarted) go(g.dataset.goto); return; }
  const a = e.target.closest('[data-action]'); if (!a || a.tagName === 'SELECT') return;
  const act = a.dataset.action;
  if (!appStarted && !['reload','signOut','theme','lang'].includes(act)) return;
  switch (act){
    case 'reload': location.reload(); break;
    case 'lang': setLang(LANG === 'fr' ? 'en' : 'fr'); break;
    case 'userMenu': setUserMenu($('#userMenu').hidden); break;
    case 'signOut': e.preventDefault(); (async () => { if (!(await Store.flush()) && !confirm(tr('Some changes are not saved yet. Sign out anyway?'))) return; await Store.signOut(); location.replace(location.pathname); })(); break;
    case 'openAdd': openAdd(); break;
    case 'closeAdd': $('#txDialog').close(); break;
    case 'theme': cycleTheme(); break;
    case 'month': ui.month = addMonths(ui.month, +a.dataset.d); ui.tx.month = null; render(); break;
    case 'demo': {
      if ((state.txns.some(t => t.src !== 'demo') || state.loans.some(l => l.src !== 'demo')) && !confirm(tr('Add demo transactions and loans alongside your real data? You can remove them later in Budgets & settings.'))) return;
      if (cloud() && Store.members.length > 1 && !confirm(tr('Demo data is shared: everyone in this budget will see it until you remove it. Continue?'))) return;
      state.txns = state.txns.filter(t => t.src !== 'demo').concat(genDemo());
      state.loans = state.loans.filter(l => l.src !== 'demo').concat(demoLoans());
      save(); ui.month = addMonths(curMonth(), -1); ui.tx.month = null; toast(tr('Demo data loaded — remove it any time in Budgets & settings')); go('dashboard'); break; }
    case 'removeDemo': state.txns = state.txns.filter(t => t.src !== 'demo'); state.loans = state.loans.filter(l => l.src !== 'demo'); save(); ui.month = monthsWithData()[0] || curMonth(); toast(tr('Demo data removed')); render(); break;
    case 'delTx': { const t = state.txns.find(x => x.id === a.dataset.id); if (t && confirm(tr('Delete "{desc}" ({amount})?', {desc: t.desc, amount: money(t.amount,2)}))){ state.txns = state.txns.filter(x => x !== t); save(); updateTxList(); } break; }
    case 'showUncat': ui.tx = {month:'', cat:'uncat', q:''}; go('transactions'); break;
    case 'pasteImport': { const t = $('#pasteCSV').value; if (t.trim()) startImport(t, tr('Pasted text')); break; }
    case 'commitImport': commitImport(); break;
    case 'cancelImport': ui.imp = null; renderImport(); break;
    case 'exportJSON': {
      const {version, categories, rules, txns, loans, settings} = state;
      download(`money-tracker-backup-${todayISO()}.json`, JSON.stringify({version, categories, rules, txns, loans, settings}, null, 1), 'application/json');
      state.settings.lastBackup = new Date().toISOString(); save(); toast(tr('Backup downloaded')); if (ui.tab !== 'transactions' && ui.tab !== 'import') render(); break; }
    case 'restore': $('#restoreFile').click(); break;
    case 'exportCSV': {
      // a leading = + - @ makes spreadsheets run the cell as a formula: neutralise it in text columns
      const txt = s => /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
      const rows = [[tr('Date'), tr('Description'), tr('Amount'), tr('Category'), tr('Type'), tr('Note')]].concat(state.txns.slice().sort((x,y) => x.date.localeCompare(y.date)).map(t => [t.date, txt(t.desc), t.amount.toFixed(2), txt(catName(catOf(t.cat))), catOf(t.cat).type, txt(t.note || '')]));
      download(`transactions-${todayISO()}.csv`, '\uFEFF' + rows.map(r => r.map(x => /[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(',')).join('\n'), 'text/csv'); break; }
    case 'clearBudget': {
      const demo = onlyDemoData(), later = tr('If you might want this data later, click Cancel and use "Export backup" first.');
      const ok = demo
        ? confirm(tr('Remove the demo data and start your own budget from scratch?'))
        : confirm(cloud()
            ? tr('Clear "{name}" for everyone in it? All transactions, loans, budgets, categories and rules are deleted and it starts again from a clean slate. Its members are kept.', {name: Store.household.name}) + '\n\n' + tr('To keep this data and start a separate budget instead, click Cancel and choose "+ New budget" in the menu at the top right.') + ' ' + later
            : tr('Clear this budget? All transactions, loans, budgets, categories and rules are deleted and it starts again from a clean slate.') + '\n\n' + later)
          && confirm(tr('Really clear it? This cannot be undone.'));
      if (!ok) break;
      state = freshState(); Store.replaceAll(); save();
      ui.month = curMonth(); ui.tx = {month:null, cat:'', q:''}; ui.imp = null;
      toast(demo ? tr('Demo data removed — import a bank CSV or add your first expense') : tr('Budget cleared — import a bank CSV or add your first expense')); go('dashboard'); break; }
    case 'suggestBudgets': { const avg = avgSpend(ui.month, 3); let n = 0; state.categories.forEach(c => { if (c.type === 'expense' && !['uncat','loans'].includes(c.id) && avg[c.id] > 0){ c.budget = Math.max(10, Math.round(avg[c.id] * .9 / 10) * 10); n++; } }); if (!n){ toast(tr('Need some spending data first')); break; } save(); toast(tr('Set {n} budgets to 90% of your 3-month average', {n})); render(); break; }
    case 'addCat': { const name = prompt(tr('New category name')); if (!name || !name.trim()) break; const id = 'c_' + uid().slice(0, 8); state.categories.push({id, name: name.trim().slice(0, 60), color: '#' + Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'), type:'expense', budget:0}); save(); render(); break; }
    case 'delCat': { const c = catOf(a.dataset.id); if (PROTECTED_CATS.has(c.id)) break; const n = state.txns.filter(t => t.cat === c.id).length; if (!confirm(tr('Delete category "{name}"?', {name: catName(c)}) + (n ? ' ' + trn(n, 'Its {n} transaction becomes Uncategorized.', 'Its {n} transactions become Uncategorized.') : ''))) break; state.txns.forEach(t => { if (t.cat === c.id) t.cat = 'uncat'; }); state.rules = state.rules.filter(r => r.cat !== c.id); state.categories = state.categories.filter(x => x.id !== c.id); save(); render(); break; }
    case 'addRule': { const kw = prompt(tr('Keyword to look for in the description (e.g. "monoprix")')); if (!kw || !norm(kw)) break; addRule(kw, 'other'); ui.ruleQ = norm(kw); save(); render(); toast(tr('Rule added — now pick its category')); break; }
    case 'delRule': state.rules.splice(+a.dataset.i, 1); save(); updateRules(); break;
    case 'recat': { let n = 0; state.txns.forEach(t => { if (catOf(t.cat).id === 'uncat'){ const c = matchCat(t.desc); if (c && !(t.amount < 0 && catOf(c).type === 'income')){ t.cat = c; n++; } } }); save(); toast(n ? trn(n, 'Categorised {n} transaction', 'Categorised {n} transactions') : tr('No uncategorised transactions matched a rule')); break; }
    case 'addLoan': openLoan(null, a.dataset.kw); break;
    case 'editLoan': openLoan(a.dataset.id); break;
    case 'delLoan': deleteLoan(a.dataset.id); break;
    case 'closeLoan': $('#loanDialog').close(); break;
    case 'copyInvite': {
      const H = Store.household, text = tr('Join our budget "{name}": open {url}, create an account, then enter the invite code {code}', {name: H.name, url: location.origin + location.pathname, code: H.invite_code});
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(tr('Invitation copied — paste it in a message')), () => prompt(tr('Copy this invitation:'), text)); break; }
    case 'newInvite': if (confirm(tr('Create a new invite code? The current code will stop working.'))) Store.newInviteCode().then(() => { toast(tr('New invite code created')); render(); }, err => toast(friendly(err), true)); break;
    case 'removeMember': { const m = Store.members.find(x => x.user_id === a.dataset.id); if (m && confirm(tr('Remove {name} from "{budget}"? They will no longer see any of its data.', {name: m.display_name || m.email, budget: Store.household.name}))) Store.removeMember(m.user_id).then(() => { toast(tr('Removed')); render(); }, err => toast(friendly(err), true)); break; }
    case 'leaveFamily': { const name = Store.household.name; if (confirm(tr('Leave "{name}"? You will no longer see its data.', {name}))) Store.removeMember(Store.user.id).then(() => openCurrentBudget(tr('You left {name}', {name})), err => toast(friendly(err), true)); break; }
    case 'switchBudget': {
      if (a.dataset.id === Store.household.id) break;
      Store.switchHousehold(a.dataset.id).then(h => openCurrentBudget(tr('Opened {name}', {name: h.name})), err => toast(friendly(err), true)); break; }
    case 'createBudget': {
      const name = prompt(tr('Name of the new budget (for example "Holiday 2027" or "Our flat")'));
      if (!name || !name.trim()) break;
      Store.createHousehold(name.trim().slice(0, 80)).then(() => openCurrentBudget(tr('New budget created — invite others from Settings & members')), err => toast(friendly(err), true)); break; }
    case 'joinBudget': {
      const code = prompt(tr('Enter the invite code you received'));
      if (!code || !code.trim()) break;
      Store.joinHousehold(code).then(h => openCurrentBudget(tr('You joined {name}', {name: h.name})), err => toast(friendly(err), true)); break; }
    case 'deleteBudget': {
      const name = Store.household.name;
      if (!confirm(tr('Delete the budget "{name}" for everyone in it? All its transactions, loans and settings are permanently deleted.', {name})) || !confirm(tr('Really delete "{name}"? This cannot be undone.', {name}))) break;
      Store.deleteHousehold().then(() => openCurrentBudget(tr('Deleted {name}', {name})), err => toast(friendly(err), true)); break; }
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
  if (t.id === 'hhName'){ const name = t.value.trim().slice(0, 80); if (!name) { t.value = Store.household.name; return; } Store.renameHousehold(name).then(() => { toast(tr('Saved')); renderChrome(); }, err => toast(friendly(err), true)); return; }
  if (t.dataset.action === 'setCat'){ setCategory(t.dataset.id, t.value); return; }
  if (t.dataset.imp){ ui.imp.map[t.dataset.imp] = +t.value; if (t.dataset.imp === 'amount' && +t.value < 0 && ui.imp.map.debit < 0){ ui.imp.map.debit = ui.imp.header.findIndex(h => /debit/.test(norm(h))); ui.imp.map.credit = ui.imp.header.findIndex(h => /credit/.test(norm(h))); } renderImport(); return; }
  if (t.dataset.impopt){ const k = t.dataset.impopt; ui.imp[k] = t.type === 'checkbox' ? t.checked : t.value; renderImport(); return; }
  if (t.dataset.setting){
    const k = t.dataset.setting;
    if (k === 'keepMonths'){
      const n = +t.value, cutoff = n ? addMonths(curMonth(), -(n - 1)) + '-01' : null, old = cutoff ? state.txns.filter(x => x.date < cutoff).length : 0;
      if (old && !confirm(cloud() ? tr('This deletes {n} transactions dated before {date} for everyone in this budget. Continue?', {n: old, date: cutoff}) : tr('This deletes {n} transactions dated before {date}. Continue?', {n: old, date: cutoff}))){ t.value = state.settings.keepMonths; return; }
      state.settings.keepMonths = n; const removed = pruneOld(); save(); toast(removed ? tr('Deleted {n} old transactions', {n: removed}) : tr('Saved')); return;
    }
    let val = t.value; if (t.type === 'number') val = Math.max(0, +val || 0);
    if (k === 'savingsGoal') val = Math.min(90, val);
    if (k === 'smallThreshold') val = Math.max(1, val);
    state.settings[k] = val; save(); toast(tr('Saved')); return; }
  if (t.dataset.cat){ const c = state.categories.find(x => x.id === t.dataset.cat); if (!c) return; const f = t.dataset.field;
    if (f === 'type' && PROTECTED_CATS.has(c.id)) return;
    c[f] = f === 'budget' ? Math.max(0, +t.value || 0) : t.value; if (f === 'name' && !c.name.trim()) c.name = tr('Unnamed');
    save(); if (f === 'type') render(); return; }
  if (t.dataset.rule != null){ const r = state.rules[+t.dataset.rule]; if (!r) return; r[t.dataset.field] = t.dataset.field === 'kw' ? norm(t.value) : t.value; save(); return; }
  if (t.id === 'restoreFile'){ const f = t.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const o = JSON.parse(r.result); if (!o || !Array.isArray(o.txns)) throw 0;
        const what = trn(o.txns.length, '{n} transaction', '{n} transactions') + (Array.isArray(o.loans) ? ', ' + trn(o.loans.length, '{n} loan', '{n} loans') : '');
        if (!confirm(cloud() ? tr('Replace the current data for everyone in "{name}" with this backup ({what})?', {name: Store.household.name, what}) : tr('Replace the current data with this backup ({what})?', {what}))) return;
        state = migrate(o); Store.replaceAll(); pruneOld(); save(); ui.month = monthsWithData()[0] || curMonth(); ui.tx.month = null; toast(tr('Backup restored')); go('dashboard'); }
      catch(err){ toast(tr('That file isn’t a valid backup'), true); } };
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
  if (!amt) return fail(tr('Enter an amount, e.g. 12,50'), f.amount);
  if (!f.desc.value.trim()) return fail(tr('Enter a description, e.g. Monoprix'), f.desc);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.value)) return fail(tr('Pick a date'), f.date);
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
  toast(tr('Added {amount} · {cat}', {amount: money(t.amount,2), cat: catName(catOf(t.cat))})); render();
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

/* ============================== theme, language & boot ============================== */
function applyTheme(mode){ if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme; $('#themeBtn').title = tr('Theme: {mode}', {mode: tr(mode || 'auto')}); }
function cycleTheme(){ let cur; try { cur = localStorage.getItem(THEME_KEY) || 'auto'; } catch(e){ cur = document.documentElement.dataset.theme || 'auto'; }
  const next = {auto:'light', light:'dark', dark:'auto'}[cur] || 'auto';
  try { localStorage.setItem(THEME_KEY, next); } catch(e){}
  applyTheme(next); toast(tr('Theme: {mode}', {mode: tr(next)})); render(); }
applyStaticI18n();
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch(e){}
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
if (Store.mode === 'local' && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

(async function boot(){
  renderGate('loading', tr('Connecting…'));
  let r;
  try { r = await Store.init(); } catch (e){ r = {screen: 'error', message: friendly(e)}; }
  if (r.screen === 'app') return startApp();
  renderGate(r.screen, r.message ? friendly({message: r.message}) : '');
})();
