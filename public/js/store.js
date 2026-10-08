'use strict';
/*
 * Data layer.
 *  - cloud mode (Supabase configured): email + password login, one shared family budget per user,
 *    changes are diffed against what the server last confirmed and pushed in the background.
 *  - local mode (no config, or ?local in the URL): everything stays in this browser's localStorage.
 * The UI (app.js) owns `state`; it calls Store.save() after every change, exactly like before.
 */
const Store = (() => {
  const cfg = window.APP_CONFIG || {};
  const LOCAL_KEY = 'moneyLeakTracker.v1';
  const forceLocal = /[?&]local\b/.test(location.search);
  const mode = (cfg.supabaseUrl && cfg.supabaseKey && !forceLocal) ? 'cloud' : 'local';
  const initialHash = location.hash;   // read before supabase-js consumes the auth tokens in it

  let sb = null, getState = () => null;
  let user = null, household = null, households = [], members = [];
  let synced = emptySynced(), wipeRemote = false;
  let loadedFor = null;   // id of the budget whose data is in `state`; nothing is saved while it differs from `household`
  let timer = null, running = null, dirty = false, status = mode === 'cloud' ? 'saved' : 'local', lastError = null, lastLoad = 0;
  const listeners = {status: [], remote: [], signedOut: []};
  const emit = (k, ...a) => listeners[k].forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

  function emptySynced(){ return {txns: new Map(), loans: new Map(), config: null, version: 0}; }
  function setStatus(s, err){ status = s; lastError = err || null; emit('status', s, err); }
  function fail(error){ if (error) throw new Error(error.message || String(error)); }
  const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

  // JSON with sorted object keys: Postgres jsonb reorders keys, so plain JSON.stringify would see false changes
  function stable(v){
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v ?? null);
  }

  /* ---------- row mapping ---------- */
  const txSnap = t => JSON.stringify([t.date, t.desc, Number(t.amount), t.cat || 'uncat', t.note || null, t.src || null]);
  const txToRow = (t, hid) => ({id: t.id, household_id: hid, date: t.date, description: t.desc, amount: t.amount, category: t.cat || 'uncat', note: t.note || null, src: t.src || null});
  const txFromRow = r => ({id: r.id, date: r.date, desc: r.description ?? '', amount: Number(r.amount), cat: r.category, ...(r.note ? {note: r.note} : {}), ...(r.src ? {src: r.src} : {})});
  const LOAN_COLS = ['name', 'kind', 'principal', 'rate', 'start_date', 'term_months', 'payment', 'insurance', 'keyword', 'src'];
  const loanNorm = l => LOAN_COLS.map(k => ['principal', 'rate', 'term_months', 'insurance'].includes(k) ? Number(l[k]) || 0 : k === 'payment' ? (Number(l[k]) || null) : (l[k] || null));
  const loanSnap = l => JSON.stringify(loanNorm(l));
  const loanToRow = (l, hid) => { const v = loanNorm(l), row = {id: l.id, household_id: hid}; LOAN_COLS.forEach((k, i) => row[k] = v[i]); return row; };
  const loanFromRow = r => ({id: r.id, name: r.name, kind: r.kind, principal: Number(r.principal), rate: Number(r.rate), start_date: r.start_date, term_months: Number(r.term_months), payment: r.payment == null ? null : Number(r.payment), insurance: Number(r.insurance) || 0, keyword: r.keyword || '', ...(r.src ? {src: r.src} : {})});
  const configOf = s => ({version: s.version, categories: s.categories, rules: s.rules, settings: s.settings});

  /* ---------- auth ---------- */
  function toUser(u){ return u ? {id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0]} : null; }
  function cleanUrl(){ if (/access_token|error_description|type=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }

  async function init(){
    if (mode === 'local') return {screen: 'app'};
    if (!window.supabase || !window.supabase.createClient) return {screen: 'error', message: tr('The login service could not be loaded. Check your internet connection, then reload the page.')};
    const hashParams = new URLSearchParams(initialHash.slice(1));
    let recovery = hashParams.get('type') === 'recovery';
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit'}});
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      // never await Supabase calls inside this callback (it can deadlock), defer instead
      if (event === 'SIGNED_OUT' && user) setTimeout(() => emit('signedOut'), 0);
    });
    const {data, error} = await sb.auth.getSession();
    cleanUrl();
    if (error) return {screen: 'signin', message: error.message};
    if (!data.session) return {screen: 'signin', message: hashParams.get('error_description') ? hashParams.get('error_description').replace(/\+/g, ' ') : ''};
    user = toUser(data.session.user);
    if (recovery) return {screen: 'recovery'};
    await loadHouseholds();
    return {screen: household ? 'app' : 'household'};
  }
  async function signIn(email, password){
    const {data, error} = await sb.auth.signInWithPassword({email, password}); fail(error);
    user = toUser(data.user); await loadHouseholds();
    return household ? 'app' : 'household';
  }
  async function signUp(name, email, password){
    const {data, error} = await sb.auth.signUp({email, password, options: {data: {name}, emailRedirectTo: location.origin + location.pathname}}); fail(error);
    if (!data.session) return 'confirm';                 // email confirmation is switched on
    user = toUser(data.user); return 'household';
  }
  async function sendReset(email){ const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname}); fail(error); }
  async function updatePassword(password){ const {error} = await sb.auth.updateUser({password}); fail(error); }
  async function signOut(){ if (sb) { user = null; await sb.auth.signOut(); } }

  /* ---------- budgets (households) ---------- */
  const currentKey = () => 'moneyLeakTracker.budget.' + user.id;
  // Every budget this user can open; the current one is `prefer`, else the last one used here, else the oldest.
  async function loadHouseholds(prefer){
    const {data, error} = await sb.from('household_members').select('role, joined_at, households(id, name, invite_code)').eq('user_id', user.id).order('joined_at'); fail(error);
    households = (data || []).filter(r => r.households).map(r => ({...r.households, role: r.role}));
    let saved = null; try { saved = localStorage.getItem(currentKey()); } catch (e) {}
    household = households.find(h => h.id === prefer) || households.find(h => h.id === saved) || households[0] || null;
    synced = emptySynced(); wipeRemote = false; loadedFor = null;
    if (household){ remember(); await loadMembers(); } else members = [];
    return household;
  }
  function remember(){ try { localStorage.setItem(currentKey(), household.id); } catch (e) {} }
  async function loadMembers(){
    const {data, error} = await sb.from('household_members').select('user_id, role, display_name, email, joined_at').eq('household_id', household.id).order('joined_at'); fail(error);
    members = data || [];
    return members;
  }
  // Unsaved changes belong to the budget they were made in, so push them before opening another one.
  async function saveFirst(){ if (household && !(await flush())) throw new Error(tr('Your last changes are not saved yet. Check your connection and try again.')); }
  async function switchHousehold(id){
    await saveFirst();
    const h = households.find(x => x.id === id); if (!h) throw new Error(tr('Budget not found'));
    household = h; synced = emptySynced(); wipeRemote = false; loadedFor = null; remember();
    await loadMembers();
    return household;
  }
  async function createHousehold(name){ await saveFirst(); const {data, error} = await sb.rpc('create_household', {p_name: name}); fail(error); return loadHouseholds(data); }
  async function joinHousehold(code){ await saveFirst(); const {data, error} = await sb.rpc('join_household', {p_code: code}); fail(error); return loadHouseholds(data); }
  async function newInviteCode(){ const {data, error} = await sb.rpc('new_invite_code', {p_household: household.id}); fail(error); household.invite_code = data; return data; }
  async function renameHousehold(name){ const {error} = await sb.from('households').update({name}).eq('id', household.id); fail(error); household.name = name; }
  async function deleteHousehold(){
    clearTimeout(timer); dirty = false; while (running) await running;   // nothing left to save in a budget being deleted
    const {error} = await sb.rpc('delete_household', {p_household: household.id}); fail(error);
    try { localStorage.removeItem(currentKey()); } catch (e) {}
    return loadHouseholds();
  }
  // Leave the current budget (userId = you) or, as its owner, remove someone else from it.
  async function removeMember(userId){
    if (userId === user.id) await saveFirst();
    const {data, error} = await sb.from('household_members').delete().eq('household_id', household.id).eq('user_id', userId).select('user_id'); fail(error);
    if (!data || !data.length) throw new Error(tr('You are not allowed to do this.'));
    if (userId === user.id){ try { localStorage.removeItem(currentKey()); } catch (e) {} return loadHouseholds(); }
    await loadMembers();
  }

  /* ---------- loading ---------- */
  async function fetchAll(table, cols){
    const out = [];
    for (let from = 0; ; from += 1000){
      const {data, error} = await sb.from(table).select(cols).eq('household_id', household.id).order('date').order('id').range(from, from + 999); fail(error);
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  async function loadData(){
    if (mode === 'local'){
      try { const r = localStorage.getItem(LOCAL_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
    }
    const [hh, txRows, loanRes] = await Promise.all([
      sb.from('households').select('id, name, invite_code, config, config_version').eq('id', household.id).single(),
      fetchAll('transactions', 'id, date, description, amount, category, note, src'),
      sb.from('loans').select('*').eq('household_id', household.id).order('created_at'),
      loadMembers()
    ]);
    fail(hh.error); fail(loanRes.error);
    Object.assign(household, {name: hh.data.name, invite_code: hh.data.invite_code});
    const txns = txRows.map(txFromRow), loans = (loanRes.data || []).map(loanFromRow);
    // remember exactly what the server holds, so later saves only send real changes
    synced = emptySynced();
    txns.forEach(t => synced.txns.set(t.id, txSnap(t)));
    loans.forEach(l => synced.loans.set(l.id, loanSnap(l)));
    synced.config = hh.data.config ? stable(hh.data.config) : null;
    synced.version = hh.data.config_version;
    lastLoad = Date.now(); loadedFor = household.id;
    return {...(hh.data.config || {}), txns, loans};
  }

  /* ---------- saving ---------- */
  function save(){
    if (mode === 'local'){
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(getState())); if (status !== 'local') setStatus('local'); }
      catch (e) { setStatus('error', e); }
      return;
    }
    if (!household || loadedFor !== household.id) return;   // another budget is being opened: its data isn't loaded yet
    dirty = true; setStatus('saving');
    clearTimeout(timer); timer = setTimeout(kick, 400);
  }
  function kick(){
    // With nothing to send the loop below would finish synchronously, clearing `running` before it is even
    // assigned, and a settled promise would then stay in `running` forever (saving stops, flush() spins).
    if (running || !dirty) return;
    running = (async () => {
      try { while (dirty) { dirty = false; await push(); } setStatus('saved'); }
      catch (e) { dirty = true; console.error(e); setStatus('error', e); }
      finally { running = null; }
    })();
  }
  async function flush(){
    if (mode === 'local') return status !== 'error';
    clearTimeout(timer);
    if (dirty && !running) kick();
    while (running) await running;
    return !dirty;
  }
  // Erase everything the family has on the server before the next push (used by "Erase everything" and "Restore")
  function replaceAll(){ if (mode === 'cloud') wipeRemote = true; }

  async function push(){
    const s = getState(), hid = household.id;
    if (loadedFor !== hid) return;
    if (wipeRemote){
      for (const t of ['transactions', 'loans']) { const {error} = await sb.from(t).delete().eq('household_id', hid); fail(error); }
      synced.txns.clear(); synced.loans.clear(); wipeRemote = false;
    }
    await pushTable('transactions', s.txns, synced.txns, txSnap, t => txToRow(t, hid));
    await pushTable('loans', s.loans, synced.loans, loanSnap, l => loanToRow(l, hid));
    const cfgObj = configOf(s), cfgStr = stable(cfgObj);
    if (cfgStr !== synced.config){
      const {data, error} = await sb.from('households').update({config: cfgObj, config_version: synced.version + 1})
        .eq('id', hid).eq('config_version', synced.version).select('config, config_version'); fail(error);
      if (data.length){ synced.config = cfgStr; synced.version = data[0].config_version; }
      else await configConflict();
    }
  }
  async function pushTable(table, list, seen, snap, toRow){
    const live = new Set(), upserts = [];
    for (const item of list){ live.add(item.id); const sn = snap(item); if (seen.get(item.id) !== sn) upserts.push([item.id, sn, toRow(item)]); }
    const deletes = [...seen.keys()].filter(id => !live.has(id));
    for (const part of chunks(deletes, 100)){
      const {error} = await sb.from(table).delete().in('id', part); fail(error);
      part.forEach(id => seen.delete(id));
    }
    for (const part of chunks(upserts, 500)){
      const {error} = await sb.from(table).upsert(part.map(x => x[2])); fail(error);
      part.forEach(([id, sn]) => seen.set(id, sn));
    }
  }
  // Someone else saved categories/rules/settings since we loaded: keep theirs and tell the user.
  async function configConflict(){
    const {data, error} = await sb.from('households').select('config, config_version').eq('id', household.id).single(); fail(error);
    synced.config = data.config ? stable(data.config) : null;
    synced.version = data.config_version;
    emit('remote', data.config || {});
  }

  return {
    mode, init, signIn, signUp, sendReset, updatePassword, signOut,
    loadHouseholds, switchHousehold, createHousehold, joinHousehold, newInviteCode, renameHousehold, deleteHousehold, removeMember, loadMembers,
    loadData, save, flush, replaceAll,
    bind(fn){ getState = fn; },
    on(k, fn){ listeners[k].push(fn); },
    get user(){ return user; }, get household(){ return household; }, get households(){ return households; }, get members(){ return members; },
    get status(){ return status; }, get lastError(){ return lastError; }, get lastLoad(){ return lastLoad; },
    get pending(){ return dirty || !!running; }
  };
})();
