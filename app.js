/* ============================================================
   Trading Journal by VRFE — VR Financial Educators
   Local-first. Works as a website, a webapp and a Chrome extension.
   Storage: chrome.storage.local in the extension, localStorage on the web.
   UX ideas inspired by Obsidian (command palette, vault sidebar, daily
   notes, tags, [[wikilinks]], backlinks) — implementation is original.
   ============================================================ */
(function () {
  'use strict';

  var BRAND = 'Trading Journal by VRFE (VR Financial Educators)';
  var STORE_KEY = 'vrfe_journal_v2';

  var DEFAULT_RULES = [
    'Stay Disciplined.',
    "Don't Overtrade.",
    'Bhav Bhagwan Che.',
    'Always stick to your plan.',
    'No Stoploss: Path to huge loss.',
    'Always maintain your trading journal.',
    'Cut your losses short, Run your profits.',
    'Be prepared with your Risk/Reward ratio.',
    'Aim for sky, keep your feet on the ground.',
    "Never average a loss, don't add to a losing position."
  ];

  /* ---------------- storage ---------------- */
  var hasChromeStore = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  var store = {
    load: function () {
      return new Promise(function (res) {
        if (hasChromeStore) chrome.storage.local.get(STORE_KEY, function (r) { res(r[STORE_KEY] || null); });
        else { try { res(JSON.parse(localStorage.getItem(STORE_KEY)) || null); } catch (e) { res(null); } }
      });
    },
    save: function (d) {
      if (hasChromeStore) chrome.storage.local.set({ [STORE_KEY]: d });
      else { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { toast('Storage full — export a backup'); } }
    }
  };

  /* ---------------- state ---------------- */
  var state = null;
  var currentKey = keyOf(new Date());
  var weekAnchor = new Date();
  var monthAnchor = new Date();
  var miniAnchor = new Date();
  var view = 'day';
  var scope = 'day';
  var tagFilter = null;
  var eqRange = '30';

  function blankState() {
    return {
      version: 2,
      settings: { name: '', accountSize: '', currency: '₹', autoStamp: 'on', theme: 'light', sbCollapsed: false },
      rules: DEFAULT_RULES.slice(), days: {}
    };
  }
  function blankDay(k) { return { date: k, profit: '', loss: '', reason: '', learnings: '', trades: [], notes: [], createdAt: new Date().toISOString() }; }
  function day(k, create) { if (!state.days[k] && create) state.days[k] = blankDay(k); return state.days[k] || blankDay(k); }
  function dayHasContent(d) {
    if (!d) return false;
    return !!((d.trades && d.trades.length) || (d.notes && d.notes.length) ||
      (d.reason || '').trim() || (d.learnings || '').trim() ||
      (d.profit || '').toString().trim() || (d.loss || '').toString().trim());
  }
  var saveTimer = null;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { store.save(state); }, 200); }
  function saveNow() { store.save(state); }

  /* ---------------- dates ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateOf(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { var x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
  function sameDay(a, b) { return keyOf(a) === keyOf(b); }
  var DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var DOW3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dowIdx(k) { return (dateOf(k).getDay() + 6) % 7; }
  function longDate(k) { var d = dateOf(k); return DOW[dowIdx(k)] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function nowStamp(k) { var d = new Date(); return k + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ---------------- numbers ---------------- */
  function num(v) { if (v == null) return null; var s = String(v).replace(/[,\s₹$€£]/g, '').trim(); if (s === '') return null; var n = Number(s); return isFinite(n) ? n : null; }
  function locale() { return (state.settings.currency || '').indexOf('₹') >= 0 ? 'en-IN' : 'en-US'; }
  function fmtNum(n, dp) { if (n == null || !isFinite(n)) return ''; return n.toLocaleString(locale(), { minimumFractionDigits: dp || 0, maximumFractionDigits: dp === undefined ? 2 : dp }); }
  function money(n) { if (n == null || !isFinite(n)) return '—'; var s = state.settings.currency || ''; return (n < 0 ? '-' : '') + s + fmtNum(Math.abs(n), 2); }
  function moneyK(n) { if (n == null || !isFinite(n)) return '—'; var s = state.settings.currency || '', a = Math.abs(n); var t = a >= 100000 ? fmtNum(a / 100000, 1) + 'L' : a >= 1000 ? fmtNum(a / 1000, 1) + 'k' : fmtNum(a, 0); return (n < 0 ? '-' : '') + s + t; }
  function sgn(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat'; }

  /* ---------------- trade maths ---------------- */
  function calcTrade(t) {
    var entry = num(t.entry), stop = num(t.stop), target = num(t.target), exit = num(t.exit), qty = num(t.qty);
    var dir = t.side === 'Short' ? -1 : 1, acct = num(state.settings.accountSize);
    var risk = (entry != null && stop != null) ? Math.abs(entry - stop) : null;
    var reward = (entry != null && target != null) ? Math.abs(target - entry) : null;
    var rrAuto = (risk && reward != null) ? reward / risk : null;
    var plAuto = (entry != null && exit != null && qty != null) ? (exit - entry) * dir * qty : null;
    var riskAuto = (risk != null && qty != null && acct) ? (risk * qty) / acct * 100 : null;
    var rrMan = num(t.rr), plMan = num(t.pl), riskMan = num(t.riskPct);
    return { rrAuto: rrAuto, plAuto: plAuto, riskAuto: riskAuto,
      rr: rrMan != null ? rrMan : rrAuto, pl: plMan != null ? plMan : plAuto, riskPct: riskMan != null ? riskMan : riskAuto };
  }
  function daySummary(d) {
    var gross = 0, wins = 0, losses = 0, counted = 0, rrSum = 0, rrN = 0, yes = 0, ans = 0, best = null, worst = null, riskSum = 0, riskN = 0;
    (d.trades || []).forEach(function (t) {
      var c = calcTrade(t);
      if (c.pl != null) { gross += c.pl; counted++; if (c.pl > 0) wins++; else if (c.pl < 0) losses++; if (best == null || c.pl > best) best = c.pl; if (worst == null || c.pl < worst) worst = c.pl; }
      if (c.rr != null) { rrSum += c.rr; rrN++; }
      if (c.riskPct != null) { riskSum += c.riskPct; riskN++; }
      if (t.rules) { ans++; if (t.rules === 'Yes') yes++; }
    });
    var p = num(d.profit), l = num(d.loss);
    var net = (p != null || l != null) ? (p || 0) - (l || 0) : (counted ? gross : null);
    return { trades: (d.trades || []).length, counted: counted, gross: counted ? gross : null, net: net,
      wins: wins, losses: losses, winRate: (wins + losses) ? wins / (wins + losses) * 100 : null,
      avgRR: rrN ? rrSum / rrN : null, avgRisk: riskN ? riskSum / riskN : null,
      ruleRate: ans ? yes / ans * 100 : null, best: best, worst: worst };
  }
  function rangeSummary(keys) {
    var net = 0, hasNet = false, trades = 0, wins = 0, losses = 0, rrSum = 0, rrN = 0, yes = 0, ans = 0, g = 0, r = 0, active = 0;
    keys.forEach(function (k) {
      var d = state.days[k]; if (!dayHasContent(d)) return; active++;
      var s = daySummary(d);
      if (s.net != null) { net += s.net; hasNet = true; if (s.net > 0) g++; else if (s.net < 0) r++; }
      trades += s.trades; wins += s.wins; losses += s.losses;
      (d.trades || []).forEach(function (t) { var c = calcTrade(t); if (c.rr != null) { rrSum += c.rr; rrN++; } if (t.rules) { ans++; if (t.rules === 'Yes') yes++; } });
    });
    return { net: hasNet ? net : null, trades: trades, wins: wins, losses: losses,
      winRate: (wins + losses) ? wins / (wins + losses) * 100 : null, avgRR: rrN ? rrSum / rrN : null,
      ruleRate: ans ? yes / ans * 100 : null, greenDays: g, redDays: r, activeDays: active };
  }

  /* ---------------- tags & links ---------------- */
  var TAG_RE = /(^|[\s(>])#([A-Za-z][\w-]*)/g;
  var LINK_RE = /\[\[([^\]]+)\]\]/g;
  function extractTags(text) { var out = [], m; TAG_RE.lastIndex = 0; while ((m = TAG_RE.exec(text || '')) !== null) out.push(m[2].toLowerCase()); return out; }
  function dayText(d) { return [d.reason || '', d.learnings || ''].concat((d.notes || []).map(function (n) { return n.text || ''; })).concat((d.trades || []).map(function (t) { return t.note || ''; })).join('\n'); }
  function dayTags(d) { var s = {}; extractTags(dayText(d)).forEach(function (t) { s[t] = 1; }); return Object.keys(s); }
  function allTags() {
    var counts = {};
    Object.keys(state.days).forEach(function (k) { dayTags(state.days[k]).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).map(function (t) { return { tag: t, n: counts[t] }; });
  }
  function backlinksTo(key) {
    var out = [];
    Object.keys(state.days).forEach(function (k) {
      if (k === key) return;
      var d = state.days[k]; var segs = [];
      [['Reason', d.reason], ['Learnings', d.learnings]].forEach(function (p) { if (p[1]) segs.push([p[0], p[1]]); });
      (d.notes || []).forEach(function (n) { if (n.text) segs.push(['Note', n.text]); });
      segs.forEach(function (seg) {
        LINK_RE.lastIndex = 0; var m;
        while ((m = LINK_RE.exec(seg[1])) !== null) {
          if (m[1].trim() === key) { out.push({ key: k, ctx: seg[1] }); return; }
        }
      });
    });
    return out.sort(function (a, b) { return b.key.localeCompare(a.key); });
  }

  /* ---------------- markdown ---------------- */
  function escapeHTML(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inlineMd(s) {
    s = s.replace(LINK_RE, function (m, p1) { var v = p1.trim(); return '<a class="wikilink" data-link="' + escapeHTML(v) + '">' + escapeHTML(v) + '</a>'; });
    s = s.replace(TAG_RE, function (m, pre, t) { return pre + '<span class="tag" data-tag="' + t.toLowerCase() + '">#' + t + '</span>'; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }
  function renderMd(text) {
    if (!text || !text.trim()) return '';
    var lines = escapeHTML(text).split('\n'), html = [], i = 0;
    function listBlock(re, tag) {
      var items = [];
      while (i < lines.length && re.test(lines[i])) { items.push('<li>' + inlineMd(lines[i].replace(re, '')) + '</li>'); i++; }
      html.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
    }
    while (i < lines.length) {
      var ln = lines[i];
      if (/^\s*$/.test(ln)) { i++; continue; }
      var h = ln.match(/^(#{1,3})\s+(.*)$/);
      if (h) { html.push('<h' + h[1].length + '>' + inlineMd(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^\s*&gt;\s?/.test(ln)) { var q = []; while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) { q.push(inlineMd(lines[i].replace(/^\s*&gt;\s?/, ''))); i++; } html.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue; }
      if (/^\s*[-*]\s+/.test(ln)) { listBlock(/^\s*[-*]\s+/, 'ul'); continue; }
      if (/^\s*\d+\.\s+/.test(ln)) { listBlock(/^\s*\d+\.\s+/, 'ol'); continue; }
      if (/^\s*(---|___|\*\*\*)\s*$/.test(ln)) { html.push('<hr>'); i++; continue; }
      var para = [ln]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s|\s*&gt;)/.test(lines[i])) { para.push(lines[i]); i++; }
      html.push('<p>' + para.map(inlineMd).join('<br>') + '</p>');
    }
    return html.join('');
  }

  /* ---------------- dom helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1900); }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function stat(k, v, cls) { return '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>'; }

  /* ---------------- reusable markdown editor ---------------- */
  function mountMdEditor(container, getVal, setVal, ph) {
    container.innerHTML = '';
    var wrap = el('div', 'md-wrap');
    var viewDiv = el('div', 'md-view');
    viewDiv.setAttribute('data-ph', ph || 'Write…');
    function paint() { var v = getVal(); viewDiv.innerHTML = v && v.trim() ? renderMd(v) : ''; }
    paint();
    viewDiv.addEventListener('click', function (e) {
      if (e.target.classList.contains('wikilink')) { e.stopPropagation(); openLink(e.target.dataset.link); return; }
      if (e.target.classList.contains('tag')) { e.stopPropagation(); filterByTag(e.target.dataset.tag); return; }
      startEdit();
    });
    var ta = null;
    function startEdit() {
      if (ta) return;
      ta = el('textarea', 'md-edit'); ta.value = getVal(); ta.placeholder = ph || '';
      var hint = el('div', 'editing-hint', 'markdown · esc to preview');
      wrap.innerHTML = ''; wrap.appendChild(ta); wrap.appendChild(hint);
      ta.style.height = 'auto'; ta.style.height = Math.max(120, ta.scrollHeight) + 'px';
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('input', function () { setVal(ta.value); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; save(); scheduleSidebar(); });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') { ta.blur(); } });
      ta.addEventListener('blur', function () { setVal(ta.value); ta = null; paint(); wrap.innerHTML = ''; wrap.appendChild(viewDiv); save(); refreshSidebar(); if (view === 'day') renderBacklinks(); });
    }
    wrap.appendChild(viewDiv);
    container.appendChild(wrap);
    return { refresh: paint };
  }

  /* ============================================================
     DAY VIEW
     ============================================================ */
  function renderDay() {
    var d = day(currentKey, false), s = daySummary(d);
    $('#crumbH').textContent = longDate(currentKey);
    $('#crumbS').textContent = s.trades ? s.trades + (s.trades === 1 ? ' trade' : ' trades') : 'Blank page';
    $('#datePick').value = currentKey;
    $$('.chip .cur').forEach(function (e) { e.textContent = state.settings.currency || ''; });
    var pIn = $('#dayProfit'), lIn = $('#dayLoss');
    pIn.value = d.profit || ''; lIn.value = d.loss || '';
    refreshDayNumbers();
    renderTrades(d);
    mountMdEditor($('[data-md="reason"]'), function () { return day(currentKey, false).reason || ''; }, function (v) { day(currentKey, true).reason = v; }, $('[data-md="reason"]').dataset.ph);
    mountMdEditor($('[data-md="learnings"]'), function () { return day(currentKey, false).learnings || ''; }, function (v) { day(currentKey, true).learnings = v; }, $('[data-md="learnings"]').dataset.ph);
    renderNotes(d);
    renderBacklinks();
  }
  function refreshDayNumbers() {
    var d = day(currentKey, false), s = daySummary(d);
    $('#dayProfit').placeholder = s.gross != null && s.gross > 0 ? fmtNum(s.gross, 2) : '0';
    $('#dayLoss').placeholder = s.gross != null && s.gross < 0 ? fmtNum(-s.gross, 2) : '0';
    var net = $('#dayNet'); net.textContent = s.net == null ? '—' : money(s.net); net.className = 'v ' + (s.net == null ? 'flat' : sgn(s.net));
    $('#dayStats').innerHTML = [
      stat('Trades', s.trades || '0'),
      stat('Win rate', s.winRate == null ? '—' : fmtNum(s.winRate, 0) + '%'),
      stat('W / L', s.wins + ' / ' + s.losses),
      stat('Avg R/R', s.avgRR == null ? '—' : fmtNum(s.avgRR, 2)),
      stat('Avg risk', s.avgRisk == null ? '—' : fmtNum(s.avgRisk, 2) + '%'),
      stat('Rules', s.ruleRate == null ? '—' : fmtNum(s.ruleRate, 0) + '%', s.ruleRate == null ? '' : s.ruleRate >= 80 ? 'pos' : s.ruleRate < 50 ? 'neg' : ''),
      stat('Best', s.best == null ? '—' : moneyK(s.best), 'pos'),
      stat('Worst', s.worst == null ? '—' : moneyK(s.worst), 'neg')
    ].join('');
    $('#crumbS').textContent = s.trades ? s.trades + (s.trades === 1 ? ' trade' : ' trades') : 'Blank page';
  }

  function renderTrades(d) { var b = $('#tradeBody'); b.innerHTML = ''; (d.trades || []).forEach(function (t, i) { b.appendChild(tradeRow(t, i)); }); $('#tradeEmpty').classList.toggle('hidden', !!(d.trades && d.trades.length)); }
  function tradeRow(t, idx) {
    var tr = el('tr'); tr.dataset.id = t.id;
    tr.appendChild(el('td', 'rownum', String(idx + 1)));
    function txt(field, opts) {
      opts = opts || {}; var td = el('td', opts.cls || ''); var inp = el('input');
      inp.value = t[field] || ''; inp.placeholder = opts.ph || '';
      if (opts.numeric) inp.inputMode = 'decimal';
      if (opts.calcKey) { td.className = (opts.cls || '') + ' cell-calc auto'; inp.dataset.calc = opts.calcKey; }
      inp.dataset.f = field;
      inp.addEventListener('input', function () {
        t[field] = inp.value;
        if (opts.stampExit && inp.value.trim() && !t.exitTime && state.settings.autoStamp === 'on') { t.exitTime = nowTime(); var ex = tr.querySelector('[data-f="exitTime"]'); if (ex) ex.value = t.exitTime; }
        updateRowCalc(tr, t); refreshDayNumbers(); save();
      });
      td.appendChild(inp); tr.appendChild(td); return inp;
    }
    txt('entryTime', { ph: 'HH:MM' });
    txt('symbol', { ph: 'NIFTY' });
    var tdSide = el('td'), sel = el('select');
    ['Long', 'Short'].forEach(function (v) { var o = el('option', null, v); o.value = v; if ((t.side || 'Long') === v) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { t.side = sel.value; updateRowCalc(tr, t); refreshDayNumbers(); save(); });
    tdSide.appendChild(sel); tr.appendChild(tdSide);
    txt('qty', { numeric: true, ph: '0', cls: 'num' });
    txt('entry', { numeric: true, ph: '0.00', cls: 'num' });
    txt('stop', { numeric: true, ph: '0.00', cls: 'num' });
    txt('target', { numeric: true, ph: '0.00', cls: 'num' });
    txt('exit', { numeric: true, ph: '0.00', cls: 'num', stampExit: true });
    txt('exitTime', { ph: 'HH:MM' });
    txt('rr', { numeric: true, calcKey: 'rr', cls: 'num' });
    txt('pl', { numeric: true, calcKey: 'pl', cls: 'num' });
    txt('riskPct', { numeric: true, calcKey: 'riskPct', cls: 'num' });
    var tdR = el('td'), rs = el('select', 'rules-sel');
    [['', '—'], ['Yes', 'Yes'], ['No', 'No'], ['Partly', 'Partly']].forEach(function (p) { var o = el('option', null, p[1]); o.value = p[0]; if ((t.rules || '') === p[0]) o.selected = true; rs.appendChild(o); });
    function paint() { rs.className = 'rules-sel ' + (t.rules === 'Yes' ? 'yes' : t.rules === 'No' ? 'no' : t.rules === 'Partly' ? 'partly' : ''); }
    paint(); rs.addEventListener('change', function () { t.rules = rs.value; paint(); refreshDayNumbers(); save(); });
    tdR.appendChild(rs); tr.appendChild(tdR);
    txt('note', { ph: 'optional' });
    var tdDel = el('td', 'del no-print'), del = el('button', 'del-btn', '✕'); del.title = 'Delete trade';
    del.addEventListener('click', function () { var d = day(currentKey, true); d.trades = d.trades.filter(function (x) { return x.id !== t.id; }); save(); renderDay(); refreshSidebar(); toast('Trade removed'); });
    tdDel.appendChild(del); tr.appendChild(tdDel);
    updateRowCalc(tr, t); return tr;
  }
  function updateRowCalc(tr, t) {
    var c = calcTrade(t);
    function set(key, val, dp) { var inp = tr.querySelector('[data-calc="' + key + '"]'); if (!inp) return; inp.placeholder = val == null ? '—' : fmtNum(val, dp); inp.parentNode.classList.toggle('auto', !inp.value); }
    set('rr', c.rrAuto, 2); set('pl', c.plAuto, 2); set('riskPct', c.riskAuto, 2);
    var plInp = tr.querySelector('[data-calc="pl"]'); if (plInp) plInp.style.color = c.pl == null ? '' : c.pl > 0 ? 'var(--green)' : c.pl < 0 ? 'var(--rose)' : '';
  }
  function addTrade() {
    var d = day(currentKey, true);
    d.trades.push({ id: uid(), entryTime: state.settings.autoStamp === 'on' && currentKey === keyOf(new Date()) ? nowTime() : '', symbol: '', side: 'Long', qty: '', entry: '', stop: '', target: '', exit: '', exitTime: '', rr: '', pl: '', riskPct: '', rules: '', note: '' });
    save(); if (view !== 'day') show('day'); else { renderTrades(d); refreshDayNumbers(); }
    var rows = $('#tradeBody').children, last = rows[rows.length - 1];
    if (last) { var i = last.querySelector('input[data-f="symbol"]'); if (i) i.focus(); }
    refreshSidebar();
  }

  function renderNotes(d) { var list = $('#noteList'); list.innerHTML = ''; (d.notes || []).forEach(function (n) { list.appendChild(noteRow(n)); }); $('#noteEmpty').classList.toggle('hidden', !!(d.notes && d.notes.length)); }
  function noteRow(n) {
    var row = el('div', 'note');
    var stamp = el('div', 'note-stamp'), si = el('input'); si.type = 'datetime-local'; si.value = n.ts || ''; si.title = 'Timestamp — edit freely';
    si.addEventListener('input', function () { n.ts = si.value; save(); });
    stamp.appendChild(si);
    var body = el('div', 'note-body');
    mountMdEditor(body, function () { return n.text || ''; }, function (v) { n.text = v; }, 'Write what happened, what you saw, how you felt… #tags [[links]]');
    var del = el('button', 'del-btn no-print', '✕'); del.title = 'Delete note';
    del.addEventListener('click', function () { var d = day(currentKey, true); d.notes = d.notes.filter(function (x) { return x.id !== n.id; }); save(); renderNotes(d); refreshSidebar(); toast('Note removed'); });
    row.appendChild(stamp); row.appendChild(body); row.appendChild(del); return row;
  }
  function addNote() {
    var d = day(currentKey, true); d.notes.push({ id: uid(), ts: nowStamp(currentKey), text: '' });
    save(); if (view !== 'day') show('day'); else renderNotes(d);
    var wrap = $('#noteList').lastChild; if (wrap) { var v = wrap.querySelector('.md-view'); if (v) v.click(); }
  }

  function renderBacklinks() {
    var bl = backlinksTo(currentKey), card = $('#backlinkCard');
    if (!bl.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    $('#blSub').textContent = bl.length + (bl.length === 1 ? ' day links here' : ' days link here');
    var box = $('#backlinks'); box.innerHTML = '';
    bl.forEach(function (b) {
      var it = el('div', 'bl-item');
      it.innerHTML = '<div class="bl-day">' + b.key + ' · ' + DOW3[dowIdx(b.key)] + '</div><div class="bl-ctx">' + escapeHTML(b.ctx.replace(/\[\[[^\]]+\]\]/g, function (m) { return '§' + m + '§'; })).replace(/§(\[\[[^\]]+\]\])§/g, '<mark>$1</mark>') + '</div>';
      it.addEventListener('click', function () { goDay(b.key); show('day'); });
      box.appendChild(it);
    });
  }

  function openLink(link) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(link)) { goDay(link); show('day'); return; }
    openCmdk(); $('#cmdkInput').value = link; renderCmdk(link);
  }
  function filterByTag(tag) { tagFilter = tag === tagFilter ? null : tag; refreshSidebar(); show('analytics'); toast(tagFilter ? 'Filtered by #' + tag : 'Filter cleared'); }

  /* ============================================================
     WEEK / MONTH
     ============================================================ */
  function weekKeys(a) { var s = weekStart(a), out = []; for (var i = 0; i < 7; i++) out.push(keyOf(addDays(s, i))); return out; }
  function renderWeek() {
    var keys = weekKeys(weekAnchor), a = dateOf(keys[0]), b = dateOf(keys[6]);
    $('#crumbH').textContent = 'Week';
    $('#crumbS').textContent = a.getDate() + ' ' + MON[a.getMonth()].slice(0, 3) + ' – ' + b.getDate() + ' ' + MON[b.getMonth()].slice(0, 3) + ' ' + b.getFullYear();
    var r = rangeSummary(keys);
    $('#weekStats').innerHTML = [
      stat('Net P&L', r.net == null ? '—' : money(r.net), r.net == null ? '' : sgn(r.net)),
      stat('Trades', r.trades), stat('Win rate', r.winRate == null ? '—' : fmtNum(r.winRate, 0) + '%'),
      stat('Avg R/R', r.avgRR == null ? '—' : fmtNum(r.avgRR, 2)), stat('Rules', r.ruleRate == null ? '—' : fmtNum(r.ruleRate, 0) + '%'),
      stat('Green / Red', r.greenDays + ' / ' + r.redDays)
    ].join('');
    var html = '<thead><tr><th>Day</th><th>Date</th><th>Trades</th><th>W / L</th><th>Avg R/R</th><th>Rules</th><th>Net P&amp;L</th><th>Learnings</th></tr></thead><tbody>';
    var total = 0, any = false;
    keys.forEach(function (k) {
      var d = state.days[k], has = dayHasContent(d), s = d ? daySummary(d) : null, dt = dateOf(k);
      if (s && s.net != null) { total += s.net; any = true; }
      html += '<tr class="clickable" data-key="' + k + '"><td>' + DOW[dowIdx(k)] + '</td><td>' + dt.getDate() + ' ' + MON[dt.getMonth()].slice(0, 3) + '</td>' +
        '<td>' + (has ? s.trades : '—') + '</td><td>' + (has ? s.wins + ' / ' + s.losses : '—') + '</td>' +
        '<td>' + (has && s.avgRR != null ? fmtNum(s.avgRR, 2) : '—') + '</td><td>' + (has && s.ruleRate != null ? fmtNum(s.ruleRate, 0) + '%' : '—') + '</td>' +
        '<td class="' + (has && s.net != null ? sgn(s.net) : '') + '" style="font-weight:700">' + (has && s.net != null ? money(s.net) : '—') + '</td>' +
        '<td style="max-width:300px;color:var(--ink-3)">' + escapeHTML(((d && d.learnings) || '').replace(/[#*>\[\]]/g, '').slice(0, 80)) + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td colspan="6">Week total</td><td class="' + (any ? sgn(total) : '') + '">' + (any ? money(total) : '—') + '</td><td></td></tr></tfoot>';
    var table = $('#weekTable'); table.innerHTML = html;
    $$('tr.clickable', table).forEach(function (tr) { tr.addEventListener('click', function () { goDay(tr.dataset.key); show('day'); }); });
  }
  function monthKeys(a) { var y = a.getFullYear(), m = a.getMonth(), last = new Date(y, m + 1, 0).getDate(), out = []; for (var i = 1; i <= last; i++) out.push(keyOf(new Date(y, m, i))); return out; }
  function renderMonth() {
    var y = monthAnchor.getFullYear(), m = monthAnchor.getMonth();
    $('#crumbH').textContent = MON[m] + ' ' + y; $('#crumbS').textContent = 'Click a day to open it';
    var r = rangeSummary(monthKeys(monthAnchor));
    $('#monthStats').innerHTML = [
      stat('Net P&L', r.net == null ? '—' : money(r.net), r.net == null ? '' : sgn(r.net)),
      stat('Trading days', r.activeDays), stat('Trades', r.trades),
      stat('Win rate', r.winRate == null ? '—' : fmtNum(r.winRate, 0) + '%'), stat('Avg R/R', r.avgRR == null ? '—' : fmtNum(r.avgRR, 2)),
      stat('Rules', r.ruleRate == null ? '—' : fmtNum(r.ruleRate, 0) + '%'), stat('Green / Red', r.greenDays + ' / ' + r.redDays)
    ].join('');
    var cal = $('#calendar'); cal.innerHTML = '';
    DOW3.forEach(function (x) { cal.appendChild(el('div', 'dow', x)); });
    var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate(), today = new Date();
    for (var i = 0; i < lead; i++) cal.appendChild(el('div', 'cell mute'));
    for (var dnum = 1; dnum <= daysIn; dnum++) {
      var dt = new Date(y, m, dnum), k = keyOf(dt), d = state.days[k], has = dayHasContent(d), s = has ? daySummary(d) : null;
      var cls = 'cell' + (sameDay(dt, today) ? ' today' : '') + (has && s.net != null ? ' ' + sgn(s.net) : '');
      var cell = el('div', cls);
      cell.appendChild(el('div', 'dnum', String(dnum)));
      if (has && s.net != null) cell.appendChild(el('div', 'dpl ' + sgn(s.net), moneyK(s.net)));
      else if (has) cell.appendChild(el('div', 'dpl flat', '—'));
      if (has) cell.appendChild(el('div', 'dmeta', s.trades + (s.trades === 1 ? ' trade' : ' trades') + (s.ruleRate != null ? ' · ' + fmtNum(s.ruleRate, 0) + '%' : '')));
      (function (kk) { cell.addEventListener('click', function () { goDay(kk); show('day'); }); })(k);
      cal.appendChild(cell);
    }
    var tail = (7 - ((lead + daysIn) % 7)) % 7; for (var j = 0; j < tail; j++) cal.appendChild(el('div', 'cell mute'));
  }

  /* ============================================================
     ANALYTICS
     ============================================================ */
  function renderAnalytics() {
    $('#crumbH').textContent = 'Analytics'; $('#crumbS').textContent = tagFilter ? 'Filtered by #' + tagFilter : 'Performance overview';
    var allKeys = Object.keys(state.days).filter(function (k) { return dayHasContent(state.days[k]); }).sort();
    if (tagFilter) allKeys = allKeys.filter(function (k) { return dayTags(state.days[k]).indexOf(tagFilter) >= 0; });
    var cutoff = null;
    if (eqRange !== 'all') cutoff = keyOf(addDays(new Date(), -parseInt(eqRange, 10)));
    var keys = cutoff ? allKeys.filter(function (k) { return k >= cutoff; }) : allKeys;
    $('#eqSub').textContent = 'Cumulative net P&L' + (tagFilter ? ' · #' + tagFilter : '') + ' · ' + keys.length + ' days';
    drawEquity(keys);
    var r = rangeSummary(keys);
    var profitFactor = (function () { var gp = 0, gl = 0; keys.forEach(function (k) { (state.days[k].trades || []).forEach(function (t) { var c = calcTrade(t); if (c.pl > 0) gp += c.pl; else if (c.pl < 0) gl -= c.pl; }); }); return gl ? gp / gl : (gp ? Infinity : null); })();
    var expectancy = r.trades ? (r.net || 0) / r.trades : null;
    $('#anStats').innerHTML = [
      stat('Net P&L', r.net == null ? '—' : money(r.net), r.net == null ? '' : sgn(r.net)),
      stat('Trades', r.trades), stat('Win rate', r.winRate == null ? '—' : fmtNum(r.winRate, 0) + '%'),
      stat('Avg R/R', r.avgRR == null ? '—' : fmtNum(r.avgRR, 2)),
      stat('Profit factor', profitFactor == null ? '—' : (profitFactor === Infinity ? '∞' : fmtNum(profitFactor, 2)), profitFactor != null && profitFactor >= 1 ? 'pos' : profitFactor != null ? 'neg' : ''),
      stat('Expectancy / trade', expectancy == null ? '—' : moneyK(expectancy), expectancy == null ? '' : sgn(expectancy)),
      stat('Rules followed', r.ruleRate == null ? '—' : fmtNum(r.ruleRate, 0) + '%'),
      stat('Green / Red', r.greenDays + ' / ' + r.redDays)
    ].join('');
    renderBreakdown(keys);
  }
  function drawEquity(keys) {
    var box = $('#equity');
    if (!keys.length) { box.innerHTML = '<div class="eq-empty">No trades in this range yet.</div>'; return; }
    var pts = [], cum = 0;
    keys.forEach(function (k) { var s = daySummary(state.days[k]); if (s.net != null) { cum += s.net; pts.push({ k: k, y: cum }); } });
    if (!pts.length) { box.innerHTML = '<div class="eq-empty">No completed P&L in this range yet.</div>'; return; }
    var W = 900, H = 150, padY = 12;
    var ys = pts.map(function (p) { return p.y; }).concat([0]);
    var min = Math.min.apply(null, ys), max = Math.max.apply(null, ys), span = (max - min) || 1;
    function X(i) { return pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W; }
    function Y(v) { return H - padY - ((v - min) / span) * (H - padY * 2); }
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
    var area = 'M0 ' + Y(pts[0].y).toFixed(1) + ' ' + pts.map(function (p, i) { return 'L' + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ') + ' L' + W + ' ' + Y(pts[pts.length - 1].y).toFixed(1) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z';
    var zeroY = Y(0);
    var last = pts[pts.length - 1];
    box.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--teal)" stop-opacity="0.28"/><stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>' +
      '<line class="eq-zero" x1="0" y1="' + zeroY.toFixed(1) + '" x2="' + W + '" y2="' + zeroY.toFixed(1) + '"/>' +
      '<path class="eq-area" d="' + area + '"/><path class="eq-line" d="' + line + '"/>' +
      '<circle class="eq-dot" cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(last.y).toFixed(1) + '" r="3.5"/>' +
      '</svg>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-4);margin-top:4px">' +
      '<span>' + pts[0].k + '</span><span style="font-weight:700;color:' + (last.y >= 0 ? 'var(--green)' : 'var(--rose)') + '">' + money(last.y) + '</span><span>' + last.k + '</span></div>';
  }
  function renderBreakdown(keys) {
    var sym = {}, tg = {};
    keys.forEach(function (k) {
      var d = state.days[k];
      (d.trades || []).forEach(function (t) {
        var c = calcTrade(t), name = (t.symbol || '').trim() || '—';
        if (!sym[name]) sym[name] = { n: 0, pl: 0, w: 0, l: 0 };
        sym[name].n++; if (c.pl != null) { sym[name].pl += c.pl; if (c.pl > 0) sym[name].w++; else if (c.pl < 0) sym[name].l++; }
      });
      var s = daySummary(d);
      dayTags(d).forEach(function (t) { if (!tg[t]) tg[t] = { days: 0, pl: 0 }; tg[t].days++; if (s.net != null) tg[t].pl += s.net; });
    });
    function tbl(node, head, rows) { node.innerHTML = '<thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" style="color:var(--ink-4)">Nothing yet</td></tr>') + '</tbody>'; }
    var symRows = Object.keys(sym).sort(function (a, b) { return sym[b].pl - sym[a].pl; }).slice(0, 12).map(function (name) {
      var x = sym[name]; return '<tr><td style="font-weight:600">' + escapeHTML(name) + '</td><td>' + x.n + '</td><td>' + x.w + ' / ' + x.l + '</td><td class="' + sgn(x.pl) + '" style="font-weight:700">' + money(x.pl) + '</td></tr>';
    });
    tbl($('#bySymbol'), ['Symbol', 'Trades', 'W / L', 'Net P&amp;L'], symRows);
    var tagRows = Object.keys(tg).sort(function (a, b) { return tg[b].pl - tg[a].pl; }).slice(0, 12).map(function (name) {
      return '<tr class="clickable" data-tag="' + name + '"><td><span class="tag" style="cursor:pointer">#' + escapeHTML(name) + '</span></td><td>' + tg[name].days + '</td><td class="' + sgn(tg[name].pl) + '" style="font-weight:700">' + money(tg[name].pl) + '</td></tr>';
    });
    tbl($('#byTag'), ['Tag', 'Days', 'Net P&amp;L'], tagRows);
    $$('#byTag tr.clickable').forEach(function (tr) { tr.addEventListener('click', function () { filterByTag(tr.dataset.tag); }); });
  }

  /* ============================================================
     RULES
     ============================================================ */
  function renderRules() {
    $('#crumbH').textContent = "Trader's Rules"; $('#crumbS').textContent = state.rules.length + ' rules';
    var ul = $('#rulesList'); ul.innerHTML = '';
    state.rules.forEach(function (r, i) {
      var li = el('li');
      li.appendChild(el('span', 'bullet', '●'));
      var inp = el('input'); inp.value = r; inp.addEventListener('input', function () { state.rules[i] = inp.value; save(); });
      li.appendChild(inp);
      var del = el('button', 'del-btn no-print', '✕'); del.addEventListener('click', function () { state.rules.splice(i, 1); save(); renderRules(); });
      li.appendChild(del); ul.appendChild(li);
    });
  }

  /* ============================================================
     EXPORT
     ============================================================ */
  function scopeKeys() {
    if (scope === 'day') return [currentKey];
    if (scope === 'week') return weekKeys(dateOf(currentKey));
    if (scope === 'month') return monthKeys(dateOf(currentKey));
    return Object.keys(state.days).sort();
  }
  function activeKeys() { return scopeKeys().filter(function (k) { return dayHasContent(state.days[k]); }); }
  function scopeLabel() {
    if (scope === 'day') return currentKey;
    if (scope === 'week') { var ks = weekKeys(dateOf(currentKey)); return ks[0] + '_to_' + ks[6]; }
    if (scope === 'month') { var d = dateOf(currentKey); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    return 'all';
  }
  function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
  function tradeCells(t) {
    var c = calcTrade(t);
    return { time: t.entryTime || '', symbol: t.symbol || '', side: t.side || 'Long', qty: t.qty || '', entry: t.entry || '', stop: t.stop || '', target: t.target || '', exit: t.exit || '', exitTime: t.exitTime || '',
      rr: c.rr == null ? '' : fmtNum(c.rr, 2), pl: c.pl == null ? '' : fmtNum(c.pl, 2), risk: c.riskPct == null ? '' : fmtNum(c.riskPct, 2), rules: t.rules || '', note: t.note || '', plRaw: c.pl };
  }
  function toMarkdown() {
    var keys = activeKeys(), cur = state.settings.currency || '', L = [];
    L.push('---'); L.push('title: "Trading Journal — ' + scopeLabel() + '"');
    if (state.settings.name) L.push('trader: "' + state.settings.name + '"');
    L.push('source: "' + BRAND + '"'); L.push('exported: ' + new Date().toISOString()); L.push('tags: [trading, journal, vrfe]'); L.push('---'); L.push('');
    L.push('# Trading Journal by VRFE'); L.push('*VR Financial Educators*'); L.push('');
    if (keys.length > 1) {
      var r = rangeSummary(keys);
      L.push('## Summary'); L.push(''); L.push('| Metric | Value |'); L.push('| --- | --- |');
      L.push('| Days journalled | ' + r.activeDays + ' |'); L.push('| Net P&L | ' + (r.net == null ? '—' : cur + fmtNum(r.net, 2)) + ' |');
      L.push('| Trades | ' + r.trades + ' |'); L.push('| Win rate | ' + (r.winRate == null ? '—' : fmtNum(r.winRate, 0) + '%') + ' |');
      L.push('| Avg R/R | ' + (r.avgRR == null ? '—' : fmtNum(r.avgRR, 2)) + ' |'); L.push('| Rules followed | ' + (r.ruleRate == null ? '—' : fmtNum(r.ruleRate, 0) + '%') + ' |');
      L.push('| Green / Red days | ' + r.greenDays + ' / ' + r.redDays + ' |'); L.push('');
    }
    if (!keys.length) L.push('_No entries in this range._');
    keys.forEach(function (k) {
      var d = state.days[k], s = daySummary(d);
      L.push('## [[' + k + ']] — ' + DOW[dowIdx(k)]); L.push('');
      var p = num(d.profit), l = num(d.loss);
      var prof = p != null ? p : (s.gross > 0 ? s.gross : 0), loss = l != null ? l : (s.gross < 0 ? -s.gross : 0);
      L.push('**Day ended in:** Profit ' + cur + fmtNum(prof, 2) + ' / Loss ' + cur + fmtNum(loss, 2) + '  ·  **Net P&L:** ' + (s.net == null ? '—' : cur + fmtNum(s.net, 2))); L.push('');
      L.push('**Trades:** ' + s.trades + '  ·  **Win rate:** ' + (s.winRate == null ? '—' : fmtNum(s.winRate, 0) + '%') + '  ·  **Avg R/R:** ' + (s.avgRR == null ? '—' : fmtNum(s.avgRR, 2)) + '  ·  **Rules followed:** ' + (s.ruleRate == null ? '—' : fmtNum(s.ruleRate, 0) + '%')); L.push('');
      if (d.trades && d.trades.length) {
        L.push('| # | Entry Time | Symbol | Side | Qty | Entry | Stop | Target | Exit | Exit Time | R/R | P&L | % Risked | Followed Rules | Note |');
        L.push('| --: | --- | --- | --- | --: | --: | --: | --: | --: | --- | --: | --: | --: | --- | --- |');
        d.trades.forEach(function (t, i) { var c = tradeCells(t); L.push('| ' + [i + 1, c.time, c.symbol, c.side, c.qty, c.entry, c.stop, c.target, c.exit, c.exitTime, c.rr, c.pl, c.risk ? c.risk + '%' : '', c.rules, c.note].map(mdCell).join(' | ') + ' |'); });
        L.push('');
      }
      if ((d.reason || '').trim()) { L.push('### Reason'); L.push(''); L.push(d.reason.trim()); L.push(''); }
      if ((d.learnings || '').trim()) { L.push('### Learnings'); L.push(''); L.push(d.learnings.trim()); L.push(''); }
      if (d.notes && d.notes.length) { L.push('### Notes'); L.push(''); d.notes.forEach(function (n) { L.push('- **' + (n.ts || '').replace('T', ' ') + '** — ' + String(n.text || '').replace(/\n/g, ' ')); }); L.push(''); }
      L.push('---'); L.push('');
    });
    L.push("## Trader's Rules"); L.push(''); state.rules.forEach(function (r) { L.push('- ' + r); }); L.push('');
    L.push('*Exported from ' + BRAND + '*');
    return L.join('\n');
  }
  function csvEsc(v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV() {
    var rows = [['Date', 'Day', '#', 'Entry Time', 'Symbol', 'Side', 'Qty', 'Entry Price', 'Stop Loss', 'Target Price', 'Exit Price', 'Exit Time', 'R/R', 'P&L', '% Account Risked', 'Did I Follow My Rules', 'Note', 'Day Net P&L']];
    activeKeys().forEach(function (k) {
      var d = state.days[k], s = daySummary(d);
      if (!d.trades || !d.trades.length) { rows.push([k, DOW[dowIdx(k)], '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', s.net == null ? '' : s.net.toFixed(2)]); return; }
      d.trades.forEach(function (t, i) { var c = tradeCells(t); rows.push([k, DOW[dowIdx(k)], i + 1, c.time, c.symbol, c.side, c.qty, c.entry, c.stop, c.target, c.exit, c.exitTime, c.rr, c.pl, c.risk, c.rules, c.note, i === 0 ? (s.net == null ? '' : s.net.toFixed(2)) : '']); });
    });
    return rows.map(function (r) { return r.map(csvEsc).join(','); }).join('\r\n');
  }
  function toDayCSV() {
    var rows = [['Date', 'Day', 'Trades', 'Wins', 'Losses', 'Win Rate %', 'Gross P&L', 'Day Profit', 'Day Loss', 'Net P&L', 'Avg R/R', 'Avg % Risked', 'Rules Followed %', 'Tags', 'Reason', 'Learnings', 'Notes']];
    activeKeys().forEach(function (k) {
      var d = state.days[k], s = daySummary(d), p = num(d.profit), l = num(d.loss);
      rows.push([k, DOW[dowIdx(k)], s.trades, s.wins, s.losses, s.winRate == null ? '' : s.winRate.toFixed(0), s.gross == null ? '' : s.gross.toFixed(2),
        p == null ? (s.gross > 0 ? s.gross.toFixed(2) : '') : p.toFixed(2), l == null ? (s.gross < 0 ? (-s.gross).toFixed(2) : '') : l.toFixed(2),
        s.net == null ? '' : s.net.toFixed(2), s.avgRR == null ? '' : s.avgRR.toFixed(2), s.avgRisk == null ? '' : s.avgRisk.toFixed(2), s.ruleRate == null ? '' : s.ruleRate.toFixed(0),
        dayTags(d).map(function (t) { return '#' + t; }).join(' '), d.reason || '', d.learnings || '', (d.notes || []).map(function (n) { return '[' + (n.ts || '').replace('T', ' ') + '] ' + n.text; }).join(' | ')]);
    });
    return rows.map(function (r) { return r.map(csvEsc).join(','); }).join('\r\n');
  }
  function toHTMLDoc() {
    var cur = state.settings.currency || '', keys = activeKeys(), h = '';
    h += '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    h += '<head><meta charset="utf-8"><title>Trading Journal by VRFE — ' + scopeLabel() + '</title><style>' +
      'body{font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0F172A;max-width:1080px;margin:24px auto;padding:0 16px}' +
      'h1{font-size:22px;margin:0 0 2px}h2{font-size:17px;margin:26px 0 6px;color:#0D9488;border-bottom:1px solid #E2E8F0;padding-bottom:4px}' +
      'h3{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#0D9488;margin:16px 0 4px}' +
      '.sub{color:#64748B;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px}' +
      'table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px}th{background:#F1F5F9;border:1px solid #E2E8F0;padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase}' +
      'td{border:1px solid #E2E8F0;padding:6px 8px}.pos{color:#0E9F6E;font-weight:700}.neg{color:#E11D48;font-weight:700}' +
      '.meta{background:#F1F5F9;padding:8px 12px;border-radius:8px;display:inline-block;margin:4px 0;font-size:13px}ul{margin:6px 0 0 18px}p{margin:6px 0;white-space:pre-wrap}' +
      '.foot{margin-top:30px;color:#64748B;font-size:12px;border-top:1px solid #E2E8F0;padding-top:10px}</style></head><body>';
    h += '<h1>Trading Journal by VRFE</h1><div class="sub">VR Financial Educators' + (state.settings.name ? ' &middot; ' + escapeHTML(state.settings.name) : '') + '</div>';
    if (keys.length > 1) {
      var r = rangeSummary(keys);
      h += '<h2>Summary &mdash; ' + escapeHTML(scopeLabel()) + '</h2><table><tr><th>Days</th><th>Net P&amp;L</th><th>Trades</th><th>Win rate</th><th>Avg R/R</th><th>Rules</th><th>Green / Red</th></tr><tr>' +
        '<td>' + r.activeDays + '</td><td class="' + (r.net == null ? '' : sgn(r.net)) + '">' + (r.net == null ? '—' : cur + fmtNum(r.net, 2)) + '</td><td>' + r.trades + '</td>' +
        '<td>' + (r.winRate == null ? '—' : fmtNum(r.winRate, 0) + '%') + '</td><td>' + (r.avgRR == null ? '—' : fmtNum(r.avgRR, 2)) + '</td><td>' + (r.ruleRate == null ? '—' : fmtNum(r.ruleRate, 0) + '%') + '</td><td>' + r.greenDays + ' / ' + r.redDays + '</td></tr></table>';
    }
    if (!keys.length) h += '<p>No entries in this range.</p>';
    keys.forEach(function (k) {
      var d = state.days[k], s = daySummary(d), p = num(d.profit), l = num(d.loss);
      var prof = p != null ? p : (s.gross > 0 ? s.gross : 0), loss = l != null ? l : (s.gross < 0 ? -s.gross : 0);
      h += '<h2>' + k + ' &mdash; ' + DOW[dowIdx(k)] + '</h2><div class="meta"><strong>Day ended in:</strong> Profit ' + cur + fmtNum(prof, 2) + ' / Loss ' + cur + fmtNum(loss, 2) + ' &middot; <strong>Net:</strong> <span class="' + (s.net == null ? '' : sgn(s.net)) + '">' + (s.net == null ? '—' : cur + fmtNum(s.net, 2)) + '</span> &middot; Rules: ' + (s.ruleRate == null ? '—' : fmtNum(s.ruleRate, 0) + '%') + '</div>';
      if (d.trades && d.trades.length) {
        h += '<table><tr><th>#</th><th>Entry Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Stop</th><th>Target</th><th>Exit</th><th>Exit Time</th><th>R/R</th><th>P&amp;L</th><th>% Risked</th><th>Rules</th><th>Note</th></tr>';
        d.trades.forEach(function (t, i) { var c = tradeCells(t); h += '<tr><td>' + (i + 1) + '</td><td>' + escapeHTML(c.time) + '</td><td>' + escapeHTML(c.symbol) + '</td><td>' + escapeHTML(c.side) + '</td><td>' + escapeHTML(c.qty) + '</td><td>' + escapeHTML(c.entry) + '</td><td>' + escapeHTML(c.stop) + '</td><td>' + escapeHTML(c.target) + '</td><td>' + escapeHTML(c.exit) + '</td><td>' + escapeHTML(c.exitTime) + '</td><td>' + escapeHTML(c.rr) + '</td><td class="' + (c.plRaw == null ? '' : sgn(c.plRaw)) + '">' + escapeHTML(c.pl) + '</td><td>' + (c.risk ? escapeHTML(c.risk) + '%' : '') + '</td><td>' + escapeHTML(c.rules) + '</td><td>' + escapeHTML(c.note) + '</td></tr>'; });
        h += '</table>';
      }
      if ((d.reason || '').trim()) h += '<h3>Reason</h3><p>' + escapeHTML(d.reason) + '</p>';
      if ((d.learnings || '').trim()) h += '<h3>Learnings</h3><p>' + escapeHTML(d.learnings) + '</p>';
      if (d.notes && d.notes.length) { h += '<h3>Notes</h3><ul>'; d.notes.forEach(function (n) { h += '<li><strong>' + escapeHTML((n.ts || '').replace('T', ' ')) + '</strong> &mdash; ' + escapeHTML(n.text) + '</li>'; }); h += '</ul>'; }
    });
    h += "<h2>Trader's Rules</h2><ul>"; state.rules.forEach(function (r) { h += '<li>' + escapeHTML(r) + '</li>'; }); h += '</ul>';
    h += '<div class="foot">Exported from ' + BRAND + ' &middot; ' + new Date().toLocaleString() + '</div></body></html>';
    return h;
  }
  function buildExport(kind) {
    if (kind === 'md') return { text: toMarkdown(), mime: 'text/markdown;charset=utf-8', ext: 'md' };
    if (kind === 'csv') return { text: '﻿' + toCSV(), mime: 'text/csv;charset=utf-8', ext: 'csv' };
    if (kind === 'daycsv') return { text: '﻿' + toDayCSV(), mime: 'text/csv;charset=utf-8', ext: 'csv', tag: 'daily' };
    if (kind === 'xls') return { text: toHTMLDoc(), mime: 'application/vnd.ms-excel;charset=utf-8', ext: 'xls' };
    if (kind === 'html') return { text: toHTMLDoc(), mime: 'text/html;charset=utf-8', ext: 'html' };
    if (kind === 'json') return { text: JSON.stringify(state, null, 2), mime: 'application/json', ext: 'json' };
  }
  function download(kind) {
    var e = buildExport(kind), name = 'VRFE-Trading-Journal_' + scopeLabel() + (e.tag ? '_' + e.tag : '') + '.' + e.ext;
    var blob = new Blob([e.text], { type: e.mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('Downloaded ' + name);
  }
  function copyOut(kind) {
    var e = buildExport(kind), done = function () { toast('Copied to clipboard'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(e.text).then(done, function () { fallbackCopy(e.text, done); });
    else fallbackCopy(e.text, done);
  }
  function fallbackCopy(text, cb) { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); cb(); } catch (e) { toast('Copy failed'); } ta.remove(); }

  /* ============================================================
     SIDEBAR
     ============================================================ */
  function renderMiniCal() {
    var y = miniAnchor.getFullYear(), m = miniAnchor.getMonth();
    $('#mcTitle').textContent = MON[m].slice(0, 3) + ' ' + y;
    var grid = $('#mcGrid'); grid.innerHTML = '';
    DOW3.forEach(function (x) { grid.appendChild(el('div', 'mc-dow', x[0])); });
    var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate(), today = new Date();
    for (var i = 0; i < lead; i++) grid.appendChild(el('div', 'mc-day mute'));
    for (var dn = 1; dn <= daysIn; dn++) {
      var dt = new Date(y, m, dn), k = keyOf(dt), d = state.days[k], has = dayHasContent(d), s = has ? daySummary(d) : null;
      var cls = 'mc-day' + (has ? ' has' : '') + (k === currentKey ? ' sel' : '') + (sameDay(dt, today) ? ' today' : '') + (has && s.net != null ? ' ' + sgn(s.net) : '');
      var b = el('button', cls, String(dn));
      (function (kk) { b.addEventListener('click', function () { goDay(kk); show('day'); }); })(k);
      grid.appendChild(b);
    }
  }
  function renderDayList() {
    var box = $('#dayList'); box.innerHTML = '';
    var keys = Object.keys(state.days).filter(function (k) { return dayHasContent(state.days[k]); }).sort().reverse().slice(0, 14);
    if (!keys.length) { box.appendChild(el('div', 'li-sub', '')).style.padding = '2px 16px 8px'; box.lastChild.textContent = 'No entries yet'; return; }
    keys.forEach(function (k) {
      var d = state.days[k], s = daySummary(d);
      var it = el('div', 'list-item' + (k === currentKey ? ' active' : ''));
      it.appendChild(el('span', 'li-dot ' + (s.net == null ? '' : sgn(s.net))));
      var main = el('div', 'li-main');
      main.appendChild(el('div', 'li-title', DOW3[dowIdx(k)] + ' ' + dateOf(k).getDate() + ' ' + MON[dateOf(k).getMonth()].slice(0, 3)));
      main.appendChild(el('div', 'li-sub', s.trades + (s.trades === 1 ? ' trade' : ' trades')));
      it.appendChild(main);
      if (s.net != null) { var v = el('div', 'li-val ' + sgn(s.net), moneyK(s.net)); it.appendChild(v); }
      (function (kk) { it.addEventListener('click', function () { goDay(kk); show('day'); }); })(k);
      box.appendChild(it);
    });
  }
  function renderTagList() {
    var box = $('#tagList'); box.innerHTML = '';
    var tags = allTags();
    if (!tags.length) { var e = el('div', 'li-sub'); e.style.padding = '2px 16px'; e.textContent = 'Add #tags in notes'; box.appendChild(e); return; }
    tags.slice(0, 24).forEach(function (t) {
      var c = el('div', 'tag-chip' + (t.tag === tagFilter ? ' active' : ''));
      c.innerHTML = '#' + escapeHTML(t.tag) + ' <span class="n">' + t.n + '</span>';
      c.addEventListener('click', function () { filterByTag(t.tag); });
      box.appendChild(c);
    });
  }
  var sbTimer = null;
  function scheduleSidebar() { clearTimeout(sbTimer); sbTimer = setTimeout(refreshSidebar, 400); }
  function refreshSidebar() { renderMiniCal(); renderDayList(); renderTagList(); }

  /* ============================================================
     COMMAND PALETTE
     ============================================================ */
  var cmdkSel = 0, cmdkItems = [];
  function commands() {
    return [
      { g: 'Navigate', ic: 'cal', t: 'Go to today', hint: 'T', run: function () { goDay(keyOf(new Date())); show('day'); } },
      { g: 'Navigate', ic: 'arrow', t: 'Previous day', run: function () { goDay(keyOf(addDays(dateOf(currentKey), -1))); show('day'); } },
      { g: 'Navigate', ic: 'arrow', t: 'Next day', run: function () { goDay(keyOf(addDays(dateOf(currentKey), 1))); show('day'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Day', run: function () { show('day'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Week', run: function () { show('week'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Month', run: function () { show('month'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Analytics', run: function () { show('analytics'); } },
      { g: 'Navigate', ic: 'view', t: "Open Trader's Rules", run: function () { show('rules'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Export', run: function () { show('export'); } },
      { g: 'Navigate', ic: 'view', t: 'Open Settings', run: function () { show('settings'); } },
      { g: 'Create', ic: 'plus', t: 'Add trade', hint: 'N', run: addTrade },
      { g: 'Create', ic: 'plus', t: 'Add note', run: addNote },
      { g: 'Export', ic: 'down', t: 'Export this day as Markdown', run: function () { scope = 'day'; download('md'); } },
      { g: 'Export', ic: 'down', t: 'Export this month as CSV', run: function () { scope = 'month'; download('csv'); } },
      { g: 'Export', ic: 'down', t: 'Download full JSON backup', run: function () { scope = 'all'; download('json'); } },
      { g: 'App', ic: 'moon', t: 'Toggle light / dark theme', run: toggleTheme },
      { g: 'App', ic: 'view', t: tagFilter ? 'Clear tag filter (#' + tagFilter + ')' : 'Clear tag filter', run: function () { tagFilter = null; refreshSidebar(); if (view === 'analytics') renderAnalytics(); } },
      { g: 'App', ic: 'plus', t: 'Load demo week', run: function () { loadDemo(); } }
    ];
  }
  var CMDK_ICONS = {
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', view: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', down: '<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>', day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7.4-7.4A2 2 0 0 1 2.6 12V4.6A2 2 0 0 1 4.6 2.6H12a2 2 0 0 1 1.2.4l7.4 7.4a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'
  };
  function svgIc(name) { return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (CMDK_ICONS[name] || CMDK_ICONS.view) + '</svg>'; }
  function openCmdk() { $('#cmdkBack').classList.remove('hidden'); var inp = $('#cmdkInput'); inp.value = ''; renderCmdk(''); setTimeout(function () { inp.focus(); }, 10); }
  function closeCmdk() { $('#cmdkBack').classList.add('hidden'); }
  function renderCmdk(q) {
    q = (q || '').trim(); var list = $('#cmdkList'); cmdkItems = [];
    var groups = [];
    if (q[0] === '>') {
      var qq = q.slice(1).trim().toLowerCase();
      commands().filter(function (c) { return !qq || c.t.toLowerCase().indexOf(qq) >= 0; }).forEach(function (c) { cmdkItems.push(c); });
      groups = groupItems(cmdkItems);
    } else if (q[0] === '#') {
      var tq = q.slice(1).trim().toLowerCase();
      allTags().filter(function (t) { return !tq || t.tag.indexOf(tq) >= 0; }).forEach(function (t) { cmdkItems.push({ g: 'Tags', ic: 'tag', t: '#' + t.tag, hint: t.n + ' days', run: function () { filterByTag(t.tag); } }); });
      groups = groupItems(cmdkItems);
    } else {
      var dm = q.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dm) cmdkItems.push({ g: 'Jump', ic: 'cal', t: 'Open ' + q, run: function () { goDay(q); show('day'); } });
      // matching days by content/date
      var ql = q.toLowerCase();
      var dayKeys = Object.keys(state.days).filter(function (k) { return dayHasContent(state.days[k]); }).sort().reverse();
      dayKeys.forEach(function (k) {
        if (cmdkItems.length > 40) return;
        var d = state.days[k], hay = (k + ' ' + longDate(k) + ' ' + dayText(d)).toLowerCase();
        if (!ql || hay.indexOf(ql) >= 0) {
          var s = daySummary(d);
          cmdkItems.push({ g: 'Daily notes', ic: 'cal', t: DOW3[dowIdx(k)] + ' ' + k, sub: (s.trades + ' trades' + (s.net != null ? ' · ' + money(s.net) : '')), run: function () { goDay(k); show('day'); } });
        }
      });
      commands().filter(function (c) { return ql && c.t.toLowerCase().indexOf(ql) >= 0; }).slice(0, 6).forEach(function (c) { cmdkItems.push(c); });
      if (!q) cmdkItems.unshift({ g: 'Suggested', ic: 'plus', t: 'Add trade', hint: 'N', run: addTrade });
      groups = groupItems(cmdkItems);
    }
    if (!cmdkItems.length) { list.innerHTML = '<div class="cmdk-empty">No matches. Type <strong>&gt;</strong> for commands.</div>'; return; }
    cmdkSel = 0;
    var html = '';
    groups.forEach(function (grp) {
      html += '<div class="cmdk-group">' + grp.name + '</div>';
      grp.items.forEach(function (it) {
        html += '<div class="cmdk-row" data-i="' + it._i + '">' + svgIc(it.ic) + '<div class="t">' + escapeHTML(it.t) + (it.sub ? '<small>' + escapeHTML(it.sub) + '</small>' : '') + '</div>' + (it.hint ? '<span class="hint">' + it.hint + '</span>' : '') + '</div>';
      });
    });
    list.innerHTML = html;
    $$('.cmdk-row', list).forEach(function (r) {
      r.addEventListener('mouseenter', function () { cmdkSel = +r.dataset.i; paintSel(); });
      r.addEventListener('click', function () { runCmdk(+r.dataset.i); });
    });
    paintSel();
  }
  function groupItems(items) {
    items.forEach(function (it, i) { it._i = i; });
    var order = [], map = {};
    items.forEach(function (it) { var g = it.g || 'Other'; if (!map[g]) { map[g] = { name: g, items: [] }; order.push(map[g]); } map[g].items.push(it); });
    return order;
  }
  function paintSel() { $$('.cmdk-row').forEach(function (r) { r.classList.toggle('sel', +r.dataset.i === cmdkSel); }); var s = $('.cmdk-row.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); }
  function runCmdk(i) { var it = cmdkItems[i]; if (!it) return; closeCmdk(); it.run(); }

  /* ============================================================
     SETTINGS / DEMO
     ============================================================ */
  function renderSettings() {
    $('#crumbH').textContent = 'Settings'; $('#crumbS').textContent = 'Preferences & data';
    $('#setName').value = state.settings.name || ''; $('#setAccount').value = state.settings.accountSize || '';
    $('#setCurrency').value = state.settings.currency || ''; $('#setStamp').value = state.settings.autoStamp || 'on';
  }
  function loadDemo() {
    var samples = [
      { sym: 'NIFTY 22500 CE', side: 'Long', qty: 75, e: 142.5, s: 120, tg: 195, x: 188, t1: '09:32', t2: '10:14', r: 'Yes', n: 'Gap-up continuation off VWAP', reason: 'Index opened above previous day high with strong breadth. Took the retest of VWAP as the entry. #breakout #vwap [[NIFTY]]', learn: 'Held to target instead of booking early. **Repeat this:** let the runner run when structure is intact. #patience' },
      { sym: 'BANKNIFTY 48000 PE', side: 'Long', qty: 30, e: 210, s: 178, tg: 290, x: 176, t1: '11:05', t2: '11:41', r: 'No', n: 'Chased the breakdown, no retest', reason: 'Bank Nifty broke the range low. Entered late without waiting for the pullback. #breakdown', learn: 'Entered without my confirmation candle — the rule I break most. #fomo #revenge no entry without the retest.' },
      { sym: 'RELIANCE', side: 'Long', qty: 250, e: 2890, s: 2862, tg: 2960, x: 2947, t1: '09:48', t2: '14:20', r: 'Yes', n: 'Flag breakout on daily', reason: 'Clean daily flag with rising volume. Sized to 0.7% risk. #breakout #swing [[RELIANCE]]', learn: 'Position sizing felt comfortable all day. Keep risk under 1% and the mind stays clear. #risk' },
      { sym: 'TATASTEEL', side: 'Short', qty: 400, e: 178.4, s: 181.2, tg: 171, x: 172.6, t1: '10:22', t2: '13:05', r: 'Yes', n: 'Lower high into supply', reason: 'Metals weak, stock made a lower high right at the supply zone. #short #supply', learn: 'Patience paid. Waited 40 minutes for the setup instead of forcing a trade at open. #patience' },
      { sym: 'HDFCBANK', side: 'Long', qty: 150, e: 1642, s: 1628, tg: 1682, x: 1631, t1: '09:20', t2: '09:58', r: 'Partly', n: 'Stopped out, choppy open', reason: 'Tried the opening range breakout but the range was too wide for my stop. #orb', learn: 'Do not trade the ORB when the first 15-min candle is wider than my average stop. #fomo Overtraded, then sat out — correct.' }
    ];
    var added = 0, i = 0, cursor = new Date();
    while (added < 5 && i < 14) {
      var dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        var k = keyOf(cursor), d = blankDay(k), picks = [samples[added % samples.length]];
        if (added % 2 === 0) picks.push(samples[(added + 2) % samples.length]);
        picks.forEach(function (p) { d.trades.push({ id: uid(), entryTime: p.t1, symbol: p.sym, side: p.side, qty: String(p.qty), entry: String(p.e), stop: String(p.s), target: String(p.tg), exit: String(p.x), exitTime: p.t2, rr: '', pl: '', riskPct: '', rules: p.r, note: p.n }); });
        d.reason = picks[0].reason; d.learnings = picks[0].learn;
        d.notes.push({ id: uid(), ts: k + 'T09:05', text: 'Pre-market: levels marked, risk for the day capped at 2% of capital. #plan' });
        d.notes.push({ id: uid(), ts: k + 'T15:35', text: 'Post-market review done. ' + (added % 2 === 0 ? 'Followed the plan. #discipline' : 'One impulsive entry — flagged above. #fomo') });
        state.days[k] = d; added++;
      }
      cursor = addDays(cursor, -1); i++;
    }
    if (!num(state.settings.accountSize)) state.settings.accountSize = '500000';
    saveNow(); refreshSidebar(); renderSettings(); toast('Demo week loaded'); show('month');
  }

  /* ============================================================
     VIEW SWITCHING
     ============================================================ */
  function show(v) {
    view = v;
    ['day', 'week', 'month', 'analytics', 'rules', 'export', 'settings'].forEach(function (x) { var s = document.getElementById('view-' + x); if (s) s.classList.toggle('hidden', x !== v); });
    $$('#sbNav .sb-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    if (v === 'day') renderDay();
    if (v === 'week') { weekAnchor = dateOf(currentKey); renderWeek(); }
    if (v === 'month') { monthAnchor = dateOf(currentKey); renderMonth(); }
    if (v === 'analytics') renderAnalytics();
    if (v === 'rules') renderRules();
    if (v === 'export') { renderExportCrumb(); $('#preview').classList.add('hidden'); }
    if (v === 'settings') renderSettings();
    $('#content').scrollTop = 0;
    if (window.innerWidth <= 760) $('#app').classList.remove('sb-open');
  }
  function renderExportCrumb() { $('#crumbH').textContent = 'Export'; $('#crumbS').textContent = 'Markdown · CSV · Excel · HTML · JSON'; }
  function goDay(k) { currentKey = k; miniAnchor = dateOf(k); refreshSidebar(); if (view === 'day') renderDay(); }
  function toggleTheme() { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.settings.theme; save(); }

  /* ============================================================
     EVENTS
     ============================================================ */
  function wire() {
    $$('#sbNav .sb-item').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
    $('#sbToggle').addEventListener('click', function () {
      if (window.innerWidth <= 760) { $('#app').classList.toggle('sb-open'); }
      else { state.settings.sbCollapsed = !state.settings.sbCollapsed; $('#app').classList.toggle('sb-collapsed', state.settings.sbCollapsed); save(); }
    });
    $('#scrim').addEventListener('click', function () { $('#app').classList.remove('sb-open'); });
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#navToday').addEventListener('click', function () { goDay(keyOf(new Date())); show('day'); });
    $('#sbNewDay').addEventListener('click', function () { goDay(keyOf(new Date())); show('day'); });
    $('#navPrev').addEventListener('click', function () { goDay(keyOf(addDays(dateOf(currentKey), -1))); show('day'); });
    $('#navNext').addEventListener('click', function () { goDay(keyOf(addDays(dateOf(currentKey), 1))); show('day'); });
    $('#datePick').addEventListener('change', function (e) { if (e.target.value) { goDay(e.target.value); show('day'); } });
    $('#mcPrev').addEventListener('click', function () { miniAnchor = new Date(miniAnchor.getFullYear(), miniAnchor.getMonth() - 1, 1); renderMiniCal(); });
    $('#mcNext').addEventListener('click', function () { miniAnchor = new Date(miniAnchor.getFullYear(), miniAnchor.getMonth() + 1, 1); renderMiniCal(); });

    $('#cmdkOpen').addEventListener('click', openCmdk);
    $('#cmdkOpen2').addEventListener('click', openCmdk);
    $('#addTradeTop').addEventListener('click', addTrade);
    $('#addTrade2').addEventListener('click', addTrade);
    $('#addNote').addEventListener('click', addNote);

    $('#dayProfit').addEventListener('input', function (e) { day(currentKey, true).profit = e.target.value; refreshDayNumbers(); save(); scheduleSidebar(); });
    $('#dayLoss').addEventListener('input', function (e) { day(currentKey, true).loss = e.target.value; refreshDayNumbers(); save(); scheduleSidebar(); });

    $$('#eqSeg button').forEach(function (b) { b.addEventListener('click', function () { eqRange = b.dataset.eq; $$('#eqSeg button').forEach(function (x) { x.classList.toggle('active', x === b); }); renderAnalytics(); }); });

    $('#addRule').addEventListener('click', function () { state.rules.push(''); save(); renderRules(); var ins = $$('#rulesList input'); if (ins.length) ins[ins.length - 1].focus(); });
    $('#resetRules').addEventListener('click', function () { if (!confirm('Replace your rules with the default VRFE list?')) return; state.rules = DEFAULT_RULES.slice(); save(); renderRules(); toast('Defaults restored'); });

    $$('#scopeSeg button').forEach(function (b) { b.addEventListener('click', function () { scope = b.dataset.scope; $$('#scopeSeg button').forEach(function (x) { x.classList.toggle('active', x === b); }); var pv = $('#preview'); if (!pv.classList.contains('hidden') && pv.dataset.kind) pv.textContent = buildExport(pv.dataset.kind).text; }); });
    $$('[data-dl]').forEach(function (b) { b.addEventListener('click', function () { download(b.dataset.dl); }); });
    $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyOut(b.dataset.copy); }); });
    $$('[data-prev]').forEach(function (b) { b.addEventListener('click', function () { var pv = $('#preview'); pv.dataset.kind = b.dataset.prev; pv.textContent = buildExport(b.dataset.prev).text; pv.classList.remove('hidden'); pv.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }); });

    $('#setName').addEventListener('input', function (e) { state.settings.name = e.target.value; save(); });
    $('#setAccount').addEventListener('input', function (e) { state.settings.accountSize = e.target.value; save(); });
    $('#setCurrency').addEventListener('input', function (e) { state.settings.currency = e.target.value; save(); if (view === 'day') refreshDayNumbers(); });
    $('#setStamp').addEventListener('change', function (e) { state.settings.autoStamp = e.target.value; save(); });

    $('#btnBackup').addEventListener('click', function () { var s = scope; scope = 'all'; download('json'); scope = s; });
    $('#btnRestore').addEventListener('click', function () { $('#restoreFile').click(); });
    $('#restoreFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () {
        try {
          var data = JSON.parse(r.result); if (!data || !data.days) throw 0;
          state = Object.assign(blankState(), data); state.settings = Object.assign(blankState().settings, data.settings || {});
          if (!Array.isArray(state.rules) || !state.rules.length) state.rules = DEFAULT_RULES.slice();
          saveNow(); document.documentElement.dataset.theme = state.settings.theme || 'light';
          applySidebarCollapsed(); refreshSidebar(); show('day'); toast('Journal restored');
        } catch (err) { toast('That file could not be read'); }
      };
      r.readAsText(f); e.target.value = '';
    });
    $('#btnDemo').addEventListener('click', function () { if (Object.keys(state.days).length && !confirm('Add demo entries to the last 5 weekdays? Existing entries on those days will be replaced.')) return; loadDemo(); });
    $('#btnClearDay').addEventListener('click', function () { if (!confirm('Erase everything on ' + longDate(currentKey) + '?')) return; delete state.days[currentKey]; saveNow(); refreshSidebar(); show('day'); toast('Day cleared'); });
    $('#btnClearAll').addEventListener('click', function () { if (!confirm('Erase every day, trade and note? This cannot be undone.')) return; if (!confirm('Really erase the whole journal? Export a backup first if unsure.')) return; var rules = state.rules, settings = state.settings; state = blankState(); state.rules = rules; state.settings = settings; saveNow(); refreshSidebar(); show('day'); toast('Journal erased'); });

    // command palette keys
    $('#cmdkInput').addEventListener('input', function (e) { renderCmdk(e.target.value); });
    $('#cmdkInput').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdkSel = Math.min(cmdkItems.length - 1, cmdkSel + 1); paintSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkSel = Math.max(0, cmdkSel - 1); paintSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmdk(cmdkSel); }
      else if (e.key === 'Escape') { closeCmdk(); }
    });
    $('#cmdkBack').addEventListener('click', function (e) { if (e.target === $('#cmdkBack')) closeCmdk(); });

    document.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openCmdk(); return; }
      if ($('#cmdkBack').classList.contains('hidden') === false) return;
      if (e.target.matches('input, textarea, select') || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { goDay(keyOf(addDays(dateOf(currentKey), -1))); show('day'); }
      else if (e.key === 'ArrowRight') { goDay(keyOf(addDays(dateOf(currentKey), 1))); show('day'); }
      else if (e.key === 't' || e.key === 'T') { goDay(keyOf(new Date())); show('day'); }
      else if (e.key === 'n' || e.key === 'N') { addTrade(); e.preventDefault(); }
      else if (e.key === '/') { e.preventDefault(); openCmdk(); }
    });
  }
  function applySidebarCollapsed() { if (window.innerWidth > 760) $('#app').classList.toggle('sb-collapsed', !!state.settings.sbCollapsed); }

  /* ============================================================
     BOOT
     ============================================================ */
  store.load().then(function (saved) {
    state = saved && saved.days ? saved : blankState();
    state.settings = Object.assign(blankState().settings, state.settings || {});
    if (!Array.isArray(state.rules) || !state.rules.length) state.rules = DEFAULT_RULES.slice();
    document.documentElement.dataset.theme = state.settings.theme || 'light';
    $('#storeInfo').textContent = hasChromeStore ? 'Saved in extension' : 'Saved in this browser';
    wire(); applySidebarCollapsed(); refreshSidebar(); show('day');
  });
})();
