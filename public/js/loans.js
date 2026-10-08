'use strict';
/* Loans & milestones: amortization maths, the Loans tab and the add/edit loan dialog.
   Uses helpers defined in app.js (money, esc, norm, sum, addMonths, …) at call time. */

const LOAN_KINDS = {house: {label: 'House', icon: '🏠'}, car: {label: 'Car', icon: '🚗'}, other: {label: 'Other', icon: '💳'}};

/* ============================== maths ============================== */
function cleanLoan(L){
  if (!L || typeof L !== 'object') return null;
  const principal = Math.round(Number(L.principal) * 100) / 100, term = Math.round(Number(L.term_months));
  if (!(principal > 0) || !(term >= 1 && term <= 600) || !/^\d{4}-\d{2}-\d{2}$/.test(L.start_date)) return null;
  return {
    id: isUUID(L.id) ? L.id : uid(),
    name: String(L.name || 'Loan').trim().slice(0, 80) || 'Loan',
    kind: LOAN_KINDS[L.kind] ? L.kind : 'other',
    principal,
    rate: Math.min(99, Math.max(0, Number(L.rate) || 0)),
    start_date: L.start_date,
    term_months: term,
    payment: Number(L.payment) > 0 ? Math.round(Number(L.payment) * 100) / 100 : null,
    insurance: Math.max(0, Math.round((Number(L.insurance) || 0) * 100) / 100),
    keyword: String(L.keyword || '').trim().slice(0, 60),
    ...(L.src ? {src: String(L.src)} : {})
  };
}
function loanCalcPayment(principal, rate, n){
  const r = rate / 1200;
  return Math.round((r > 0 ? principal * r / (1 - Math.pow(1 + r, -n)) : principal / n) * 100) / 100;
}
// k-th payment date (k = 0 for the first), keeping the day of month where the month allows it
function loanDate(start, k){
  const d = +start.slice(8, 10), m = addMonths(start.slice(0, 7), k), [y, mo] = m.split('-').map(Number);
  return `${m}-${pad(Math.min(d, new Date(y, mo, 0).getDate()))}`;
}
function loanSchedule(L){
  const r = L.rate / 1200, calc = loanCalcPayment(L.principal, L.rate, L.term_months), pay = L.payment || calc;
  const rows = []; let bal = L.principal;
  for (let k = 0; k < L.term_months && bal > 0.005; k++){
    const interest = Math.round(bal * r * 100) / 100;   // banks round each month's interest to the cent
    let principal = Math.min(bal, Math.max(0, Math.round((pay - interest) * 100) / 100));
    if (k === L.term_months - 1) principal = bal;      // last payment clears what is left
    bal = Math.round((bal - principal) * 100) / 100;
    rows.push({k: k + 1, date: loanDate(L.start_date, k), interest, principal, insurance: L.insurance, balance: bal});
  }
  // a typed-in payment that is too small would leave a big final payment: warn about it
  return {pay, calc, rows, tooLow: !!L.payment && L.payment < calc * 0.98};
}
function isoDate(d){ return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function yearAgoISO(){ const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return isoDate(d); }
function loanMatches(L){
  const kw = norm(L.keyword); if (!kw) return [];
  return state.txns.filter(t => t.amount < 0 && (' ' + norm(t.desc) + ' ').includes(' ' + kw + ' '));
}
function loanStats(L){
  const S = loanSchedule(L), rows = S.rows, today = todayISO(), year = +today.slice(0, 4);
  const paid = rows.filter(r => r.date <= today);
  const balance = paid.length ? paid[paid.length - 1].balance : L.principal;
  const agg = rs => ({n: rs.length, paid: sum(rs.map(r => r.interest + r.principal + r.insurance)), interest: sum(rs.map(r => r.interest)), principal: sum(rs.map(r => r.principal)), insurance: sum(rs.map(r => r.insurance))});
  const bank = loanMatches(L);
  const range = (a, b) => ({...agg(rows.filter(r => r.date >= a && r.date <= b)), bank: (ts => ts.length ? {n: ts.length, paid: -sum(ts.map(t => t.amount))} : null)(bank.filter(t => t.date >= a && t.date <= b))});
  const byYear = new Map();
  rows.forEach(r => { const y = r.date.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); });
  const end = rows.length ? rows[rows.length - 1].date : L.start_date;
  return {
    ...S, balance, repaid: L.principal - balance, pct: (L.principal - balance) / L.principal,
    made: paid.length, left: rows.length - paid.length, end, finished: end <= today,
    totalInterest: sum(rows.map(r => r.interest)), interestSoFar: sum(paid.map(r => r.interest)),
    lastYear: {year: year - 1, ...range(`${year - 1}-01-01`, `${year - 1}-12-31`)},
    last12: range(yearAgoISO(), today),
    thisYear: {year, ...range(`${year}-01-01`, today)},
    years: [...byYear].map(([y, rs]) => ({year: y, ...agg(rs), endBalance: rs[rs.length - 1].balance})),
    milestones: loanMilestones(L, rows, today),
    bankCount: bank.length
  };
}
function loanMilestones(L, rows, today){
  if (!rows.length) return [];
  const out = [{label: tr('First payment'), date: rows[0].date}];
  [[.25, 'A quarter repaid'], [.5, 'Halfway: 50% repaid'], [.75, 'Three quarters repaid']].forEach(([p, label]) => {
    const r = rows.find(r => L.principal - r.balance >= L.principal * p - .005);
    if (r) out.push({label: tr(label), date: r.date});
  });
  const turn = rows.find(r => r.principal > r.interest);
  if (turn && turn.k > 1) out.push({label: tr('Turning point: each payment now repays more capital than interest'), date: turn.date});
  out.push({label: tr('Last payment: loan paid off 🎉'), date: rows[rows.length - 1].date, final: true});
  out.sort((a, b) => a.date.localeCompare(b.date));
  out.forEach(m => m.done = m.date <= today);
  return out;
}
function termLabel(n){ const y = Math.floor(n / 12), m = n % 12; return [y ? trn(y, '{n} year', '{n} years') : '', m ? trn(m, '{n} month', '{n} months') : ''].filter(Boolean).join(' '); }
function untilLabel(date){
  const [y, m] = date.split('-').map(Number), now = new Date();
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  return months <= 0 ? tr('this month') : tr('in {time}', {time: termLabel(months)});
}
function upcomingMilestones(limit){
  const out = [];
  for (const L of state.loans){ const s = loanStats(L); const m = s.milestones.find(x => !x.done); if (m) out.push({loan: L, m}); }
  return out.sort((a, b) => a.m.date.localeCompare(b.m.date)).slice(0, limit);
}
// Payments sitting in the "Loans & credit" category that no tracked loan claims yet
function untrackedLoanPayments(){
  const claimed = new Set(state.loans.flatMap(L => loanMatches(L).map(t => t.id)));
  const from12 = yearAgoISO(), ly = String(new Date().getFullYear() - 1), groups = {};
  for (const t of state.txns){
    if (catOf(t.cat).id !== 'loans' || t.amount >= 0 || claimed.has(t.id)) continue;
    const k = merchantKey(t.desc), g = groups[k] = groups[k] || {key: k, name: titleCase(k), n12: 0, last12: 0, lastYear: 0, last: ''};
    if (t.date >= from12){ g.n12++; g.last12 -= t.amount; }
    if (t.date.startsWith(ly)) g.lastYear -= t.amount;
    if (t.date > g.last) g.last = t.date;
  }
  return Object.values(groups).filter(g => g.last12 || g.lastYear).sort((a, b) => b.last12 - a.last12);
}

/* ============================== Loans tab ============================== */
function renderLoans(){
  const v = $('#view'), found = untrackedLoanPayments(), ly = new Date().getFullYear() - 1;
  const head = `<div class="pagehead"><h1>${tr('Loans & milestones')}</h1><button class="btn primary" data-action="addLoan">${tr('+ Add loan')}</button></div>`;
  const foundCard = found.length ? `<div class="card span2"><h2>${tr('Loan payments found in your bank data')}</h2><p class="sub">${tr(`Transactions in "Loans & credit" that aren't linked to a loan below yet`)}</p>
    <div class="tablewrap"><table><tr><th>${tr('Payee')}</th><th class="num">${tr('Last 12 months')}</th><th class="num">${tr('In {year}', {year: ly})}</th><th class="num hide-sm">${tr('Last')}</th><th></th></tr>
    ${found.map(g => `<tr><td><b>${esc(g.name)}</b><div class="small muted">${trn(g.n12, '{n} payment in 12 months', '{n} payments in 12 months')}</div></td><td class="num">${money(g.last12, 0)}</td><td class="num">${g.lastYear ? money(g.lastYear, 0) : '—'}</td><td class="num muted hide-sm">${dLabel(g.last)}</td><td class="num"><button class="btn" data-action="addLoan" data-kw="${esc(g.key)}">${tr('Track this loan')}</button></td></tr>`).join('')}</table></div>
    <p class="small muted" style="margin:10px 0 0">${tr('Tracking a loan adds its contract details (amount, rate, length) so the app can split interest from capital and show your milestones.')}</p></div>` : '';

  if (!state.loans.length){
    v.innerHTML = `${head}
    <div class="grid g2"><div class="card empty span2"><h2>${tr('Track your house and car loans')}</h2>
      <p>${tr("Add each loan with the details from your loan contract: amount borrowed, interest rate, first payment date and length. The app then shows what you paid last year, how much of it was interest, what you still owe, and every milestone until it's paid off.")}</p>
      <div class="row"><button class="btn primary" data-action="addLoan">${tr('+ Add a loan')}</button>${state.txns.some(t => t.src === 'demo') ? '' : `<button class="btn" data-action="demo">${tr('Try with demo data')}</button>`}</div></div>${foundCard}</div>`;
    return;
  }

  const all = state.loans.map(L => ({L, s: loanStats(L)})).sort((a, b) => (a.s.finished - b.s.finished) || b.s.balance - a.s.balance);
  const active = all.filter(x => !x.s.finished);
  const owed = sum(all.map(x => x.s.balance));
  const monthly = sum(active.map(x => x.s.pay + x.L.insurance));
  const paidLY = sum(all.map(x => x.s.lastYear.paid)), paid12 = sum(all.map(x => x.s.last12.paid));
  const free = active.length ? active.map(x => x.s.end).sort().pop() : null;
  const bankLY = all.filter(x => x.s.lastYear.bank);

  v.innerHTML = `${demoBanner()}${head}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><span>${tr('Still owed')}</span><strong>${money(owed, 0)}</strong><small>${trn(active.length, '{n} active loan', '{n} active loans')}</small></div>
    <div class="card kpi"><span>${tr('Paid in {year}', {year: ly})}</span><strong>${money(paidLY, 0)}</strong><small>${tr('{amount} of it interest', {amount: money(sum(all.map(x => x.s.lastYear.interest)), 0)})}</small></div>
    <div class="card kpi"><span>${tr('Paid last 12 months')}</span><strong>${money(paid12, 0)}</strong><small>${bankLY.length ? tr('checked against your bank data below') : tr('per loan schedules')}</small></div>
    <div class="card kpi"><span>${tr('Debt-free')}</span><strong>${free ? mLabel(free.slice(0, 7), true) : tr('✓ Done')}</strong><small>${free ? untilLabel(free) + ' · ' + tr('{amount}/month now', {amount: money(monthly)}) : tr('all loans repaid')}</small></div>
  </div>
  <div class="grid g2">
    <div class="card span2"><h2>${tr('Remaining balance')}</h2><p class="sub">${tr('What you still owe at the end of each year')}</p><div class="chartbox"><canvas id="loanChart"></canvas></div></div>
    ${all.map(({L, s}) => loanCard(L, s)).join('')}
    ${foundCard}
  </div>`;

  // balance at the end of each year, one line per loan
  const y0 = Math.min(...all.map(x => +x.L.start_date.slice(0, 4))), y1 = Math.max(...all.map(x => +x.s.end.slice(0, 4)));
  const years = []; for (let y = y0; y <= y1; y++) years.push(String(y));
  const palette = ['#6366f1', '#f97316', '#0ea5e9', '#db2777', '#16a34a', '#a16207'];
  chart('loanChart', {type: 'line', data: {labels: years, datasets: all.map(({L, s}, i) => {
      const byY = new Map(s.years.map(y => [y.year, y.endBalance]));
      return {label: L.name, data: years.map(y => y < L.start_date.slice(0, 4) ? null : byY.has(y) ? Math.round(byY.get(y)) : (y > s.end.slice(0, 4) ? 0 : null)),
        borderColor: palette[i % palette.length], backgroundColor: palette[i % palette.length], tension: .25, pointRadius: 2, spanGaps: true};
    })},
    options: {maintainAspectRatio: false, interaction: {mode: 'index', intersect: false},
      plugins: {legend: {position: 'bottom', labels: {boxWidth: 10, boxHeight: 10}}, tooltip: {callbacks: {label: c => ` ${c.dataset.label}: ${money(c.raw, 0)}`}}},
      scales: {x: {grid: {display: false}}, y: {beginAtZero: true, ticks: {callback: v => money(v, 0)}}}}});
}

function loanCard(L, s){
  const k = LOAN_KINDS[L.kind], next = s.milestones.find(m => !m.done), month = d => mLabel(d.slice(0, 7), true);
  const line = (label, r) => `<tr><td>${label}</td><td class="num"><b>${money(r.paid, 0)}</b>${r.n ? `<div class="small muted">${tr('{interest} interest · {capital} capital', {interest: money(r.interest, 0), capital: money(r.principal, 0)})}${r.insurance ? ' · ' + tr('{amount} insurance', {amount: money(r.insurance, 0)}) : ''}</div>` : ''}${r.bank ? `<div class="small" style="color:var(--accent)">${trn(r.bank.n, 'Bank data: {amount} in {n} payment', 'Bank data: {amount} in {n} payments', {amount: money(r.bank.paid, 0)})}</div>` : ''}</td></tr>`;
  return `<div class="card loan">
    <div class="loanhead"><span class="loanicon" aria-hidden="true">${k.icon}</span>
      <div><h2>${esc(L.name)}</h2><p class="sub mt0">${tr('{amount} at {rate}%', {amount: money(L.principal, 0), rate: L.rate.toLocaleString(LOCALE(), {maximumFractionDigits: 3})})} · ${termLabel(L.term_months)} · ${tr('{amount}/month', {amount: money(s.pay)})}${L.insurance ? ' + ' + tr('{amount} insurance', {amount: money(L.insurance)}) : ''}</p></div>
      <div class="btnrow"><button class="btn" data-action="editLoan" data-id="${esc(L.id)}">${tr('Edit')}</button><button class="icon-btn sm" data-action="delLoan" data-id="${esc(L.id)}" title="${tr('Delete loan')}" aria-label="${tr('Delete loan')}">×</button></div></div>
    ${s.tooLow ? `<div class="banner" style="margin:12px 0 0">${tr("The monthly payment you entered ({payment}) doesn't repay this loan in {term}. The contract's figure would be about {calc}. Check the amount, rate and length.", {payment: money(L.payment), term: termLabel(L.term_months), calc: money(s.calc)})}</div>` : ''}
    <div class="progress" role="progressbar" aria-valuenow="${Math.round(s.pct * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, s.pct * 100).toFixed(1)}%"></i></div>
    <p class="small" style="margin:0 0 10px"><b>${tr('{n}% repaid', {n: Math.floor(s.pct * 100)})}</b> <span class="muted">· ${tr('{repaid} of {total}', {repaid: money(s.repaid, 0), total: money(L.principal, 0)})} · ${s.finished ? tr('paid off {month}', {month: month(s.end)}) : trn(s.left, '{n} payment left', '{n} payments left') + ' · ' + tr('ends {month}', {month: month(s.end)})}</span></p>
    <table>
      ${line(tr('Paid in {year}', {year: s.lastYear.year}), s.lastYear)}
      ${line(tr('Last 12 months'), s.last12)}
      ${line(tr('{year} so far', {year: s.thisYear.year}), s.thisYear)}
      <tr><td>${tr('Still owed')}</td><td class="num"><b>${money(s.balance, 0)}</b></td></tr>
      <tr><td>${tr('Interest over the whole loan')}</td><td class="num"><b>${money(s.totalInterest, 0)}</b><div class="small muted">${tr('{amount} paid so far', {amount: money(s.interestSoFar, 0)})}</div></td></tr>
    </table>
    <p class="small muted" style="margin:8px 0 0">${L.keyword ? tr('Bank payments matched on "{keyword}": {n} found.', {keyword: esc(L.keyword), n: s.bankCount}) : tr('Tip: add the text that appears on your bank statement (Edit) to compare with your real payments.')}</p>
    <h3>${tr('Milestones')}</h3>
    <ol class="milestones">${s.milestones.map(m => `<li class="${m.done ? 'done' : m === next ? 'next' : ''}"><span class="mdot" aria-hidden="true">${m.done ? '✓' : ''}</span><div><b>${esc(m.label)}</b><small>${month(m.date)}${m.done ? '' : ' · ' + untilLabel(m.date)}</small></div></li>`).join('')}</ol>
    <details style="margin-top:12px"><summary class="small">${tr('Year by year (handy for tax returns)')}</summary>
      <div class="tablewrap" style="margin-top:8px"><table><tr><th>${tr('Year')}</th><th class="num">${tr('Paid')}</th><th class="num">${tr('Interest')}</th><th class="num hide-sm">${tr('Capital')}</th><th class="num">${tr('Owed at year end')}</th></tr>
      ${s.years.map(y => `<tr><td>${y.year}</td><td class="num">${money(y.paid, 0)}</td><td class="num">${money(y.interest, 0)}</td><td class="num hide-sm">${money(y.principal, 0)}</td><td class="num">${money(y.endBalance, 0)}</td></tr>`).join('')}</table></div></details>
  </div>`;
}

// Small summary card for the dashboard
function loansDashCard(){
  if (!state.loans.length) return '';
  const all = state.loans.map(L => ({L, s: loanStats(L)})), ly = new Date().getFullYear() - 1;
  const up = upcomingMilestones(2);
  return `<div class="card"><h2>${tr('Loans')}</h2><p class="sub">${tr('{owed} still owed · {paid} paid in {year}', {owed: money(sum(all.map(x => x.s.balance)), 0), paid: money(sum(all.map(x => x.s.lastYear.paid)), 0), year: ly})}</p>
    ${up.length ? up.map(({loan, m}) => `<div class="lever"><span class="n" aria-hidden="true">${LOAN_KINDS[loan.kind].icon}</span><div class="t"><b>${esc(m.label)}</b><small>${esc(loan.name)} · ${mLabel(m.date.slice(0, 7), true)}</small></div><span class="v" style="color:var(--accent)">${untilLabel(m.date)}</span></div>`).join('') : `<p class="muted small">${tr('All loans are paid off. 🎉')}</p>`}
    <div style="margin-top:10px"><button class="btn" data-goto="loans">${tr('See loans →')}</button></div></div>`;
}

/* ============================== add / edit dialog ============================== */
let editingLoan = null;
function openLoan(id, kw){
  const f = $('#loanForm'), L = id ? state.loans.find(x => x.id === id) : null;
  f.reset(); $('#loanErr').hidden = true; editingLoan = L ? L.id : null;
  $('#loanTitle').textContent = L ? tr('Edit loan') : tr('Add loan');
  const num = v => v == null || v === '' ? '' : String(v).replace('.', LANG === 'fr' ? ',' : '.');
  if (L){
    f.name.value = L.name; f.kind.value = L.kind; f.principal.value = num(L.principal); f.rate.value = num(L.rate);
    f.start_date.value = L.start_date; f.term_months.value = L.term_months; f.payment.value = num(L.payment);
    f.insurance.value = L.insurance ? num(L.insurance) : ''; f.keyword.value = L.keyword || '';
  } else if (kw){
    f.keyword.value = kw; f.name.value = titleCase(kw);
    if (/immo|habitat|maison|logement/.test(kw)) f.kind.value = 'house';
    else if (/auto|voiture|diac|rci|psa|stellantis|toyota|volkswagen|bmw|mercedes/.test(kw)) f.kind.value = 'car';
    // pre-fill the monthly payment with the most recent matching bank payment
    const last = state.txns.filter(t => t.amount < 0 && merchantKey(t.desc) === kw).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) f.payment.value = num(-last.amount);
  }
  loanHint();
  $('#loanDialog').showModal(); f.name.focus();
}
function readLoanForm(){
  const f = $('#loanForm');
  return {
    name: f.name.value.trim(), kind: f.kind.value,
    principal: parseAmount(f.principal.value), rate: f.rate.value.trim() ? parseAmount(f.rate.value) : 0,
    start_date: f.start_date.value, term_months: Math.round(Number(f.term_months.value.replace(',', '.'))),
    payment: f.payment.value.trim() ? parseAmount(f.payment.value) : null,
    insurance: f.insurance.value.trim() ? parseAmount(f.insurance.value) : 0,
    keyword: f.keyword.value.trim()
  };
}
function loanHint(){
  const x = readLoanForm(), h = $('#loanHint');
  if (!(x.principal > 0) || !(x.term_months >= 1) || x.rate == null || x.rate < 0){ h.textContent = tr('Fill in the amount, rate and length to see the monthly payment.'); return; }
  const calc = loanCalcPayment(x.principal, x.rate, x.term_months);
  const total = calc * x.term_months;
  let t = tr('About {amount} per month over {term}, {interest} of interest in total.', {amount: money(calc), term: termLabel(x.term_months), interest: money(Math.max(0, total - x.principal), 0)});
  if (/^\d{4}-\d{2}-\d{2}$/.test(x.start_date)) t += ' ' + tr('Last payment {month}.', {month: mLabel(loanDate(x.start_date, x.term_months - 1).slice(0, 7), true)});
  if (x.payment > 0 && Math.abs(x.payment - calc) > Math.max(1, calc * .01)) t += ' ' + tr('(You entered {amount}, so the schedule uses your figure.)', {amount: money(x.payment)});
  h.textContent = t;
}
function submitLoan(e){
  e.preventDefault();
  const f = e.target, x = readLoanForm(), err = $('#loanErr');
  const failMsg = (msg, field) => { err.textContent = msg; err.hidden = false; field.focus(); };
  if (!x.name) return failMsg(tr('Give the loan a name, e.g. House – Crédit Agricole'), f.name);
  if (!(x.principal > 0)) return failMsg(tr('Enter the amount you borrowed'), f.principal);
  if (x.rate == null || x.rate < 0 || x.rate >= 100) return failMsg(tr('Enter the yearly interest rate, e.g. 3,4 (or 0)'), f.rate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.start_date)) return failMsg(tr('Pick the date of the first monthly payment'), f.start_date);
  if (!(x.term_months >= 1 && x.term_months <= 600)) return failMsg(tr('Enter the length in months, e.g. 300 for 25 years'), f.term_months);
  if (x.payment != null && !(x.payment > 0)) return failMsg(tr('Leave the monthly payment empty, or enter a positive amount'), f.payment);
  if (x.insurance == null || x.insurance < 0) return failMsg(tr('Leave insurance empty, or enter a positive amount'), f.insurance);
  const old = editingLoan ? state.loans.find(l => l.id === editingLoan) : null;
  const L = cleanLoan({...x, id: old ? old.id : uid(), ...(old && old.src ? {src: old.src} : {})});
  if (old) state.loans[state.loans.indexOf(old)] = L; else state.loans.push(L);
  // file the matching bank payments under "Loans & credit" and keep doing so for new imports
  if (L.keyword){
    addRule(L.keyword, 'loans');
    const move = loanMatches(L).filter(t => catOf(t.cat).id !== 'loans');
    if (move.length && confirm(trn(move.length, 'Move {n} matching bank payment to "{cat}"?', 'Move {n} matching bank payments to "{cat}"?', {cat: catName(catOf('loans'))}))) move.forEach(t => t.cat = 'loans');
  }
  save(); $('#loanDialog').close();
  toast(old ? tr('Loan updated') : tr('Loan added'));
  if (ui.tab === 'loans') render(); else go('loans');
}
function deleteLoan(id){
  const L = state.loans.find(x => x.id === id); if (!L) return;
  if (!confirm(tr('Delete the loan "{name}"? Its bank transactions are kept.', {name: L.name}))) return;
  state.loans = state.loans.filter(x => x !== L); save(); toast(tr('Loan deleted')); render();
}
