/* ===== Midnight Garnet 💫 進捗管理 ===== */
(() => {
'use strict';

const CFG = window.MG_CONFIG || {};
const DEMO = !CFG.GAS_URL;
const GOOGLE = !DEMO && !!CFG.GOOGLE_CLIENT_ID;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const STATUS_LABEL = { open: '進行中', done: '完了', failed: '完了不可', closed: '強制終了' };
const STEP_LABEL = { done: '完了', current: '進行中', waiting: '待機中', failed: '完了不可', closed: '強制終了' };

// ---------- 小道具 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = s => esc(s)
  .replace(/https:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  .replace(/\n/g, '<br>');

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const md = s => { if (!s) return ''; const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const daysLeft = s => Math.round((parseYmd(s) - parseYmd(today())) / 864e5);
const timeLabel = iso => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return ymd(d) === today() ? t : `${d.getMonth() + 1}/${d.getDate()} ${t}`;
};

// ---------- 状態 ----------
const S = {
  token: store.get('mg_token'),
  me: null, members: [], tasks: [], projects: [], chat: {},
  view: 'calendar', filter: 'mine',
  month: today().slice(0, 7), day: today(),
  events: [], avail: [], shifts: [], shiftImages: [], ideas: [],
  calMode: 'month', freeMode: 3,
  adminToken: null, adminTab: 'tasks', editSlots: null,
  detail: null, projStack: [], poll: null, os: null,
};
const mem = id => S.members.find(m => m.id === id) || { id, name: id, color: '#888888' };
const splitIds = str => String(str || '').split(',').filter(Boolean);
const ids = t => splitIds(t.assignee);
const isMine = t => !!S.me && ids(t).includes(S.me.id);
const isAdminMode = () => !!S.adminToken;
const canAct = t => isMine(t) || isAdminMode();
const isOverdue = t => t.status === 'open' && t.deadline < today();
const dueText = t => {
  const d = daysLeft(t.deadline);
  return d < 0 ? `${-d}日遅れ` : d === 0 ? '今日まで' : d === 1 ? '明日まで' : `あと${d}日`;
};
const statusBadge = s => `<span class="badge s-${s}">${STATUS_LABEL[s] || STEP_LABEL[s] || s}</span>`;
const upsertTask = t => {
  const i = S.tasks.findIndex(x => x.id === t.id);
  if (i >= 0) S.tasks[i] = t; else S.tasks.push(t);
};
const namesOf = list => list.length === S.members.length && list.length > 1 ? '全員' : list.map(id => mem(id).name).join('・');
const colorVars = list => {
  const cols = list.map(id => mem(id).color);
  if (!cols.length) cols.push('#888888');
  const g = cols.length > 1 ? `linear-gradient(135deg,${cols.join(',')})` : cols[0];
  return `--c:${cols[0]};--g:${g}`;
};
const whoChips = list => `<span class="whos">${list.map(id => `<span class="who" style="--c:${mem(id).color}">${esc(mem(id).name)}</span>`).join('')}</span>`;

// ---------- 作品（アルバム・曲） ----------
const proj = id => S.projects.find(p => p.id === id) || null;
const stepsOf = pid => S.tasks.filter(t => t.projectId === pid).sort((a, b) => Number(a.order) - Number(b.order));
const songsOf = aid => S.projects.filter(p => p.type === 'song' && p.parentId === aid)
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
function stepState(t, steps) {
  if (t.status !== 'open') return t.status;
  steps = steps || stepsOf(t.projectId);
  const earlierOpen = steps.some(s => Number(s.order) < Number(t.order) && s.status === 'open');
  return earlierOpen ? 'waiting' : 'current';
}
function progressOf(tasks) {
  const live = tasks.filter(t => t.status !== 'closed');
  if (!live.length) return { pct: 0, done: 0, total: 0 };
  const done = live.filter(t => t.status === 'done').length;
  return { pct: Math.round(done / live.length * 100), done, total: live.length };
}
const allStepsOfAlbum = aid => stepsOf(aid).concat(...songsOf(aid).map(s => stepsOf(s.id)));
function projLabel(t) {
  const p = proj(t.projectId); if (!p) return '';
  const steps = stepsOf(p.id);
  const n = steps.findIndex(s => s.id === t.id) + 1;
  const album = p.type === 'song' && p.parentId ? proj(p.parentId) : null;
  return `${album ? esc(album.name) + ' › ' : ''}<b>${esc(p.name)}</b>${n ? ` · STEP ${n}/${steps.length}` : ''}`;
}

// ---------- 提出物（作曲シート・歌詞） ----------
const KIND_LABEL = { '': '提出物なし（Dropboxは任意）', composition: '作曲シート（時間・パート）', lyrics: '歌詞' };
const subOf = t => { try { return t && t.submission ? JSON.parse(t.submission) : null; } catch (e) { return null; } };
const artistOf = id => mem(id).artist || mem(id).name;
function normTime(v) {
  const m = String(v || '').trim().replace(/[：；;]/g, ':').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m || Number(m[2]) > 59) return null;
  return ('0' + m[1]).slice(-2) + ':' + m[2];
}
/** 曲の中で、いちばん新しく提出された作曲シート／歌詞のステップ */
const lastDone = (pid, kind) => stepsOf(pid).filter(t => t.kind === kind && t.status === 'done' && subOf(t)).pop() || null;
/** 歌詞だけを一つにつなげる（区切りごとに1行空ける） */
const joinLyrics = sub => (sub && sub.sections || []).map(x => String(x.text || '').trim()).filter(Boolean).join('\n\n');
function creditsOf(pid) {
  const steps = stepsOf(pid);
  const pick = (kind, word) => {
    let list = steps.filter(t => t.kind === kind);
    if (!list.length) list = steps.filter(t => t.title.includes(word));
    const out = [];
    list.forEach(t => ids(t).forEach(id => { if (!out.includes(id)) out.push(id); }));
    return S.members.map(m => m.id).filter(id => out.includes(id));
  };
  return { lyrics: pick('lyrics', '作詞'), music: pick('composition', '作曲') };
}
const isSongComplete = pid => { const st = stepsOf(pid); return st.length > 0 && st.every(t => t.status === 'done' || t.status === 'closed'); };

function compSheetHtml(sub, url) {
  return `<div class="sheet-card">
    <div class="sc-row"><span class="lbl">仮タイトル</span><b>${esc(sub.tempTitle)}</b></div>
    ${sub.taste ? `<div class="sc-row"><span class="lbl">テイスト</span><span>${esc(sub.taste)}</span></div>` : ''}
    <ol class="timecode">${(sub.sections || []).map(x => `<li><time>${esc(x.time)}</time><b>${esc(x.label)}</b></li>`).join('')}</ol>
    ${url || sub.url ? `<a class="btn ghost sm" href="${esc(url || sub.url)}" target="_blank" rel="noopener">デモ音源を開く（Dropbox）</a>` : ''}
  </div>`;
}
function lyricsHtml(sub, withSections) {
  const joined = joinLyrics(sub);
  return `<div class="lyrics-card">
    ${withSections ? (sub.sections || []).filter(x => x.text).map(x => `<div class="ly-sec"><div class="ly-head">${x.time ? `<time>${esc(x.time)}〜</time>` : ''}${esc(x.label)}</div><p>${esc(x.text).replace(/\n/g, '<br>')}</p></div>`).join('')
      : `<pre class="ly-out" id="lyOut">${esc(joined)}</pre>`}
    <button class="btn gem sm" data-act="copyLyrics" data-text="${esc(joined)}">歌詞だけをコピー</button>
  </div>`;
}
function creditsHtml(pid) {
  const c = creditsOf(pid);
  const line = list => list.length ? list.map(id => `<span class="artist" style="--c:${mem(id).color}">${esc(artistOf(id))}</span>`).join('<span class="amp">&amp;</span>') : '<span class="muted">—</span>';
  return `<div class="credits">
    <div class="kind">CREDITS</div>
    <div class="cr-row"><span class="lbl">作詞</span><div>${line(c.lyrics)}</div></div>
    <div class="cr-row"><span class="lbl">作曲</span><div>${line(c.music)}</div></div>
  </div>`;
}

async function copyText(text, msg = 'コピーしました') {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
    ta.remove();
    toast(ok ? msg : 'コピーできませんでした。もう一度お試しください', ok ? '' : 'err');
  }
}

// ---------- 通信 ----------
async function api(action, data = {}) {
  const payload = Object.assign({ action, token: S.token }, S.adminToken ? { adminToken: S.adminToken } : {}, data);
  let res;
  try {
    if (DEMO) res = await Mock.call(payload);
    else {
      const r = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
      res = await r.json();
    }
  } catch (e) {
    throw new Error('通信できませんでした。電波の良いところでもう一度お試しください');
  }
  if (!res.ok) {
    if (res.error === 'AUTH') { signOutLocal(); throw new Error('もう一度ログインしてください'); }
    if (res.error === 'ADMIN') { S.adminToken = null; closeAdmin(); throw new Error('管理者画面の有効期限が切れました。もう一度パスワードを入れてください'); }
    throw new Error(res.error || 'エラーが発生しました');
  }
  return res;
}

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2800);
}

async function busy(btn, fn, label = '送信中…') {
  let old;
  if (btn) { btn.disabled = true; if (label) { old = btn.innerHTML; btn.textContent = label; } }
  try { return await fn(); }
  catch (e) { toast(e.message, 'err'); }
  finally { if (btn) { btn.disabled = false; if (label && old != null) btn.innerHTML = old; } }
}

// ---------- 起動・ログイン ----------
async function boot() {
  $('#demoHint').innerHTML = DEMO
    ? 'デモモードで表示中<br><b>DEMO1</b>＝かつにい ／ <b>DEMO2</b>＝みつ ／ <b>DEMO3</b>＝けんぼー'
    : '';
  initPush();
  $('#gLogin').hidden = !GOOGLE;
  $('#loginForm').hidden = GOOGLE;
  const idToken = takeGoogleRedirect();
  if (idToken) { showLogin(); return googleLogin(idToken); }
  if (!S.token) return showLogin();
  try { await load(); }
  catch (e) { if (!S.token) return showLogin(); toast(e.message, 'err'); }
  showApp();
}

function applyBoot(r) {
  if (r.me) S.me = r.me;
  if (r.members) S.members = r.members;
  if (r.tasks) S.tasks = r.tasks;
  if (r.projects) S.projects = r.projects;
  if (r.chat) S.chat = r.chat;
  ['events', 'avail', 'shifts', 'shiftImages', 'ideas'].forEach(k => { if (r[k]) S[k] = r[k]; });
}
async function load() {
  applyBoot(await api('bootstrap'));
  linkPush();
}
function refreshAll() {
  render();
  renderProj();
  renderAdmin();
  if (S.detail) renderDetail();
}

function showLogin() {
  $('#app').hidden = true; $('#detail').hidden = true; $('#proj').hidden = true; $('#admin').hidden = true; $('#login').hidden = false;
}
function showApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  render();
  openFromHash();
}

async function finishLogin(r) {
  S.token = r.token; store.set('mg_token', r.token);
  await load();
  $('#code').value = '';
  $('#pickBox').hidden = true; $('#gLogin').hidden = !GOOGLE;
  showApp();
  toast(`ようこそ、${S.me.name}さん 💫`);
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginForm button');
  await busy(btn, async () => finishLogin(await api('login', { code: $('#code').value })), 'ログイン中…');
});

// ----- Googleでログイン（Googleの画面へ移動 → #id_token=… 付きで戻ってくる） -----
function siteUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
$('#gBtn').addEventListener('click', () => {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('mg_nonce', nonce);
  const q = new URLSearchParams({
    client_id: CFG.GOOGLE_CLIENT_ID, redirect_uri: siteUrl(), response_type: 'id_token',
    scope: 'openid email', nonce, prompt: 'select_account',
  });
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
});
function takeGoogleRedirect() {
  if (!GOOGLE) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('id_token') && !h.has('error')) return null;
  history.replaceState(null, '', siteUrl());
  if (h.has('error')) { toast('Googleログインがキャンセルされました', 'err'); return null; }
  const tok = h.get('id_token');
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (!p.nonce || p.nonce !== store.get('mg_nonce')) throw 0;
  } catch (e) { toast('Googleログインに失敗しました。もう一度お試しください', 'err'); return null; }
  store.del('mg_nonce');
  return tok;
}
async function googleLogin(credential) {
  await busy($('#gBtn'), async () => {
    const r = await api('googleLogin', { credential });
    if (!r.needPick) return finishLogin(r);
    $('#gLogin').hidden = true; $('#pickBox').hidden = false;
    $('#pickEmail').textContent = r.email;
    $('#pickList').innerHTML = r.choices.map(m =>
      `<button class="btn" type="button" data-pick="${esc(m.id)}"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</button>`).join('');
    $$('#pickList [data-pick]').forEach(b => b.addEventListener('click', () =>
      busy(b, async () => finishLogin(await api('pickMember', { pickToken: r.pickToken, memberId: b.dataset.pick })), 'ログイン中…')));
  }, 'ログイン中…');
}

function signOutLocal() {
  S.token = null; S.me = null; S.adminToken = null; store.del('mg_token');
  stopPoll(); S.detail = null; S.projStack = [];
  syncLock();
  showLogin();
}
async function logout() {
  try { await api('logout'); } catch (e) {}
  if (S.os) { try { await S.os.logout(); } catch (e) {} }
  signOutLocal();
}
function syncLock() {
  document.body.classList.toggle('lock', !$('#detail').hidden || !$('#proj').hidden || !$('#admin').hidden);
}

// ---------- メイン画面 ----------
function render() {
  if (!S.me) return;
  $('#meChip').innerHTML = `<button class="me" data-act="nav" data-view="settings"><i style="--c:${mem(S.me.id).color}"></i>${esc(S.me.name)}${isAdminMode() ? '<b class="adm">ADMIN</b>' : ''}</button>`;
  $$('.tabbar [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  const v = { calendar: viewCalendar, works: viewWorks, tasks: viewTasks, settings: viewSettings }[S.view] || viewCalendar;
  $('#view').innerHTML = v();
}

// ---------- 空き時間の計算 ----------
const SLOT0 = 16; // 8:00から表示（データは0:00〜24:00の30分×48コマ）
const slotTime = i => i >= 48 ? '24:00' : `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`;
const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const availRow = (mid, date) => (S.avail.find(a => a.memberId === mid && a.date === date) || {}).slots || '0'.repeat(48);
const shiftsOn = (mid, date) => S.shifts.filter(x => x.memberId === mid && x.date === date).sort((a, b) => a.start.localeCompare(b.start));
function stateArr(mid, date, slots) {
  const base = (slots || availRow(mid, date)).split('').map(c => c === '1' ? 'ok' : c === '2' ? 'ng' : 'u');
  shiftsOn(mid, date).forEach(sh => {
    const a = toMin(sh.start), b = toMin(sh.end);
    for (let i = 0; i < 48; i++) if (i * 30 < b && i * 30 + 30 > a) base[i] = 'shift';
  });
  return base;
}
function rangesOf(arr, pred) {
  const out = []; let st = -1;
  for (let i = SLOT0; i <= 48; i++) {
    const hit = i < 48 && pred(arr[i]);
    if (hit && st < 0) st = i;
    if (!hit && st >= 0) { out.push([st, i]); st = -1; }
  }
  return out.map(([a, b]) => `${slotTime(a)}〜${slotTime(b)}`);
}
/** 共通して集まれる時間帯。mode=3:全員 / mode=2:2人以上 */
function commonRanges(date, mode) {
  const st = S.members.map(m => ({ id: m.id, s: stateArr(m.id, date) }));
  const out = []; let cur = null;
  for (let i = SLOT0; i <= 48; i++) {
    const who = i < 48 ? st.filter(x => x.s[i] === 'ok').map(x => x.id) : [];
    const ok = mode === 3 ? who.length === S.members.length : who.length >= 2;
    const key = ok ? who.join(',') : '';
    if (cur && cur.key === key && key) { cur.end = i + 1; continue; }
    if (cur) out.push(cur);
    cur = key ? { key, who, start: i, end: i + 1 } : null;
  }
  return out.map(r => Object.assign(r, { from: slotTime(r.start), to: slotTime(r.end), mins: (r.end - r.start) * 30 }));
}
const eventsOn = date => S.events.filter(e => e.date === date).sort((a, b) => a.start.localeCompare(b.start));

function viewCalendar() {
  return `
  <div class="segtabs">${[['month', 'カレンダー'], ['free', '空き時間・共通時間']].map(([k, l]) =>
    `<button class="${S.calMode === k ? 'on' : ''}" data-act="calMode" data-m="${k}">${l}</button>`).join('')}</div>
  ${shiftBanner()}
  ${S.calMode === 'free' ? viewFree() : viewMonth()}`;
}

function myShiftTask() {
  return S.tasks.find(t => t.kind === 'shift' && t.status === 'open' && isMine(t)) || null;
}
function shiftBanner() {
  const t = myShiftTask();
  if (!t) return '';
  const month = (subOf(t) || {}).month || '';
  return `<div class="banner ${isOverdue(t) ? 'late' : ''}">
    <div><b>${esc(t.title)}</b><small>${md(t.deadline)}まで・${dueText(t)}</small></div>
    <button class="btn gem sm" data-act="form" data-form="shift" data-month="${esc(month)}">提出する</button>
  </div>`;
}

function viewMonth() {
  const [y, m] = S.month.split('-').map(Number);
  const startPad = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const byDay = {};
  S.tasks.forEach(t => { (byDay[t.deadline] = byDay[t.deadline] || []).push(t); });

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const list = byDay[ds] || [];
    const evs = eventsOn(ds);
    const wd = (startPad + d - 1) % 7;
    const dots = list.slice(0, 3).map(t =>
      `<i class="dot ${t.status !== 'open' ? 'off' : ''} ${isOverdue(t) ? 'late' : ''}" style="${colorVars(ids(t))}"></i>`).join('')
      + (list.length > 3 ? `<em>+${list.length - 3}</em>` : '');
    const evm = evs.slice(0, 2).map(e => `<i class="evm" style="${colorVars(splitIds(e.participants))}"></i>`).join('');
    cells += `<button class="cell ${ds === today() ? 'today' : ''} ${ds === S.day ? 'sel' : ''} ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}" data-act="day" data-day="${ds}"><span>${d}</span>${evm ? `<div class="evms">${evm}</div>` : ''}<div class="dots">${dots}</div></button>`;
  }
  const dayList = (byDay[S.day] || []).slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
  const evs = eventsOn(S.day);
  const isThisMonth = S.month === today().slice(0, 7);

  return `
  <div class="cal-head">
    <button class="icon-btn" data-act="month" data-d="-1" aria-label="前の月">‹</button>
    <h2>${y}.${pad(m)}</h2>
    ${isThisMonth ? '' : '<button class="icon-btn today-btn" data-act="today">今日</button>'}
    <button class="icon-btn" data-act="month" data-d="1" aria-label="次の月">›</button>
  </div>
  <div class="legend">${S.members.map(x => `<span><i style="--c:${x.color}"></i>${esc(x.name)}</span>`).join('')}<span><i class="evm" style="--g:#fff;--c:#fff"></i>予定</span></div>
  <div class="cal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>

  <div class="day-head">
    <h3>${md(S.day)}</h3>
    <div class="day-btns">
      <button class="btn gem sm" data-act="form" data-form="event" data-date="${S.day}">＋ 予定</button>
      <button class="btn ghost sm" data-act="availEdit" data-date="${S.day}">空き時間を入力</button>
    </div>
  </div>
  <h3 class="sec">予定</h3>
  ${evs.length ? evs.map(eventCard).join('') : '<p class="empty-msg">この日の予定はありません</p>'}
  <h3 class="sec">メンバーの状況</h3>
  <div class="status-list">${S.members.map(mm => memberDay(mm, S.day)).join('')}</div>
  <h3 class="sec">この日が納期のタスク</h3>
  ${dayList.length ? dayList.map(card).join('') : '<p class="empty-msg">この日が納期のタスクはありません</p>'}`;
}

function memberDay(mm, date) {
  const arr = stateArr(mm.id, date);
  const ok = rangesOf(arr, v => v === 'ok');
  const ng = rangesOf(arr, v => v === 'ng');
  const sh = shiftsOn(mm.id, date).map(x => `${x.start}〜${x.end}${x.note ? `（${esc(x.note)}）` : ''}`);
  const parts = [];
  if (sh.length) parts.push(`<span class="st-sh">シフト ${sh.join('、')}</span>`);
  if (ok.length) parts.push(`<span class="st-ok">◯ ${ok.join('、')}</span>`);
  if (ng.length) parts.push(`<span class="st-ng">✕ ${ng.join('、')}</span>`);
  return `<div class="mday"><span class="who" style="--c:${mm.color}">${esc(mm.name)}</span><div>${parts.join('') || '<span class="muted">未入力</span>'}</div></div>`;
}

function eventCard(e) {
  const parts = splitIds(e.participants);
  return `<button class="ev-card" data-act="event" data-id="${esc(e.id)}" style="${colorVars(parts)}">
    <div class="ev-time"><b>${esc(e.start)}</b><span>${esc(e.end)}</span></div>
    <div class="ev-main">
      <div class="ev-title">${esc(e.title)}</div>
      ${e.place ? `<div class="ev-place">📍 ${esc(e.place)}</div>` : ''}
      ${whoChips(parts)}
    </div>
  </button>`;
}

function viewFree() {
  const date = S.day;
  const mode = S.freeMode;
  const cols = S.members.map(m => ({ m, s: stateArr(m.id, date) }));
  let grid = '';
  for (let i = SLOT0; i < 48; i++) {
    const who = cols.filter(c => c.s[i] === 'ok').length;
    const hit = mode === 3 ? who === cols.length : who >= 2;
    grid += `<div class="tl-t">${i % 2 === 0 ? slotTime(i) : ''}</div>`
      + cols.map(c => `<div class="tl-c s-${c.s[i]}" style="--c:${c.m.color}"></div>`).join('')
      + `<div class="tl-c tl-common ${hit ? 'hit' : ''}"></div>`;
  }
  const ranges = commonRanges(date, mode);
  const soon = [];
  for (let k = 0; k < 14; k++) {
    const d = addDays(today(), k);
    commonRanges(d, mode).filter(r => r.mins >= 60).forEach(r => soon.push(Object.assign({ date: d }, r)));
  }
  const rangeBtn = (r, d) => `<button class="range" data-act="form" data-form="event" data-date="${d}" data-start="${r.from}" data-end="${r.to}" data-who="${r.key}">
      <span class="r-time">${d !== date ? `<small>${md(d)}</small>` : ''}${r.from}〜${r.to}</span>
      <span class="r-who">${mode === 3 ? '3人そろう' : whoChips(r.who)}</span>
      <span class="r-go">予定を入れる ›</span></button>`;
  return `
  <div class="date-nav">
    <button class="icon-btn" data-act="dayShift" data-d="-1" aria-label="前の日">‹</button>
    <h2>${md(date)}</h2>
    <button class="icon-btn" data-act="dayShift" data-d="1" aria-label="次の日">›</button>
  </div>
  <div class="seg mode-seg">
    <button class="${mode === 3 ? 'on' : ''}" data-act="freeMode" data-m="3">3人そろう時間</button>
    <button class="${mode === 2 ? 'on' : ''}" data-act="freeMode" data-m="2">2人以上の時間</button>
  </div>
  <div class="tl-wrap">
    <div class="tl" style="--n:${cols.length}">
      <div class="tl-h"></div>${cols.map(c => `<div class="tl-h" style="color:${c.m.color}">${esc(c.m.name)}</div>`).join('')}<div class="tl-h">共通</div>
      ${grid}
    </div>
    <div class="tl-legend"><span><i class="s-ok"></i>集まれる</span><span><i class="s-ng"></i>集まれない</span><span><i class="s-shift"></i>シフト</span><span><i class="s-u"></i>未入力</span></div>
  </div>
  <button class="btn ghost sm" style="margin-top:10px" data-act="availEdit" data-date="${date}">自分の空き時間を入力（${md(date)}）</button>
  <h3 class="sec">${md(date)}の共通の時間</h3>
  ${ranges.length ? ranges.map(r => rangeBtn(r, date)).join('') : `<p class="empty-msg">${mode === 3 ? '3人そろう' : '2人以上そろう'}時間はまだありません。<br>「集まれる」を入力した時間だけで計算しています。</p>`}
  <h3 class="sec">この先2週間（1時間以上そろう時間）</h3>
  ${soon.length ? soon.slice(0, 20).map(r => rangeBtn(r, r.date)).join('') : '<p class="empty-msg">見つかりませんでした</p>'}`;
}

function card(t) {
  const list = ids(t);
  const p = t.status === 'done' ? 100 : (Number(t.progress) || 0);
  const late = isOverdue(t);
  const n = (S.chat[t.id] || {}).n || 0;
  const st = t.projectId ? stepState(t) : t.status;
  return `<button class="card ${t.status} ${late ? 'late' : ''}" style="${colorVars(list)}" data-act="open" data-id="${esc(t.id)}">
    <div class="card-top">
      ${whoChips(list)}
      <span class="due ${late ? 'late' : ''}">${md(t.deadline)}${t.status === 'open' ? '・' + dueText(t) : ''}</span>
    </div>
    ${t.projectId ? `<div class="card-proj">♪ ${projLabel(t)}</div>` : ''}
    <div class="card-title">${esc(t.title)}</div>
    ${t.status === 'open' && t.progressNote ? `<div class="card-note">${esc(t.progressNote)}</div>` : ''}
    <div class="bar"><i style="width:${p}%"></i></div>
    <div class="card-foot">
      <span>${t.status === 'open' ? p + '%' + (st === 'waiting' ? '　<span class="badge s-waiting">前のステップ待ち</span>' : '') : statusBadge(t.status)}</span>
      ${n ? `<span>💬 ${n}</span>` : ''}
    </div>
  </button>`;
}

function viewWorks() {
  const albums = S.projects.filter(p => p.type === 'album').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const singles = S.projects.filter(p => p.type === 'song' && !p.parentId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `
  <h2 class="page-title">作品</h2>
  <div class="works-actions">
    <button class="btn ghost sm" data-act="form" data-form="song">＋ 曲を作る</button>
    <button class="btn ghost sm" data-act="form" data-form="album">＋ アルバムを作る</button>
  </div>
  ${albums.length ? `<h3 class="sec">アルバム</h3>${albums.map(albumCard).join('')}` : ''}
  ${singles.length ? `<h3 class="sec">曲（シングル）</h3>${singles.map(songCard).join('')}` : ''}
  ${!albums.length && !singles.length ? '<p class="empty-msg">まだ作品がありません。<br>「曲を作る」から、作曲 → 作詞 → レコーディング… の順番でタスクを作れます。</p>' : ''}`;
}

function currentLine(steps) {
  const cur = steps.find(s => stepState(s, steps) === 'current');
  if (!cur) {
    if (!steps.length) return '<span class="muted">ステップがまだありません</span>';
    return steps.every(s => s.status !== 'open') ? '<span class="lbl">ALL DONE</span> すべてのステップが終わりました 💫' : '';
  }
  const n = steps.indexOf(cur) + 1;
  return `<span class="lbl">NOW · STEP ${n}/${steps.length}</span><b>${esc(cur.title)}</b>${whoChips(ids(cur))}<span class="${isOverdue(cur) ? 'due late' : 'due'}">${md(cur.deadline)}・${dueText(cur)}</span>`;
}
function diamonds(steps) {
  return `<div class="diamonds">${steps.map(s => {
    const st = stepState(s, steps);
    return `<i class="dia ${st} ${isOverdue(s) ? 'late' : ''}" title="${esc(s.title)}"></i>`;
  }).join('')}</div>`;
}

function songCard(p) {
  const steps = stepsOf(p.id);
  const pr = progressOf(steps);
  return `<button class="pcard" data-act="proj" data-id="${esc(p.id)}">
    <div class="kind">SONG</div>
    <div class="pname">${esc(p.name)}</div>
    <div class="pmeta"><span>${pr.total}ステップ中 ${pr.done} 完了</span><b>${pr.pct}%</b></div>
    ${diamonds(steps)}
    <div class="cur">${currentLine(steps)}</div>
  </button>`;
}

function albumCard(a) {
  const songs = songsOf(a.id);
  const pr = progressOf(allStepsOfAlbum(a.id));
  return `<div class="pcard album">
    <button class="block-btn" data-act="proj" data-id="${esc(a.id)}" style="display:block;width:100%;text-align:left">
      <div class="kind">ALBUM</div>
      <div class="pname">${esc(a.name)}</div>
      <div class="pmeta"><span>${songs.length}曲 ・ ${pr.total}ステップ中 ${pr.done} 完了</span><b>${pr.pct}%</b></div>
      <div class="bar"><i style="width:${pr.pct}%"></i></div>
    </button>
    ${songs.length ? `<div class="song-list">${songs.map(s => {
      const steps = stepsOf(s.id);
      const sp = progressOf(steps);
      const cur = steps.find(x => stepState(x, steps) === 'current');
      return `<button class="song-row" data-act="proj" data-id="${esc(s.id)}">
        <span class="sn">♪ ${esc(s.name)}</span><span class="sp">${sp.pct}%</span>
        <span class="ss">${cur ? `いま：${esc(cur.title)}（${esc(namesOf(ids(cur)))}）` : steps.length ? '完了' : 'ステップなし'}</span>
      </button>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function viewTasks() {
  const filters = [['mine', '自分の担当'], ['personal', '個人タスク'], ['all', '進行中すべて'], ['late', '遅延中'], ['done', '終了']];
  let list;
  if (S.filter === 'mine') list = S.tasks.filter(t => isMine(t) && t.status === 'open');
  else if (S.filter === 'personal') list = S.tasks.filter(t => isMine(t) && !t.projectId && t.status === 'open');
  else if (S.filter === 'all') list = S.tasks.filter(t => t.status === 'open');
  else if (S.filter === 'late') list = S.tasks.filter(isOverdue);
  else list = S.tasks.filter(t => t.status !== 'open');
  list = list.slice().sort(S.filter === 'done'
    ? (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))
    : (a, b) => a.deadline.localeCompare(b.deadline));
  const lateN = S.tasks.filter(isOverdue).length;
  const empty = {
    mine: '担当中のタスクはありません',
    personal: '曲・アルバムに入っていない、自分のタスクはありません',
    all: '進行中のタスクはありません',
    late: '遅れているタスクはありません 💫',
    done: '終了したタスクはまだありません',
  }[S.filter];
  return `
  <div class="chips">${filters.map(([k, l]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}${k === 'late' && lateN ? `<b>${lateN}</b>` : ''}</button>`).join('')}</div>
  ${list.length ? list.map(card).join('') : `<p class="empty-msg">${empty}</p>`}`;
}

function viewSettings() {
  const push = pushState();
  return `
  <h2 class="page-title">設定</h2>
  <div class="panel">
    <h3><span class="who" style="--c:${mem(S.me.id).color}">${esc(S.me.name)}</span></h3>
    <p class="muted small">ログイン中です。この端末ではログアウトするまでログイン状態が続きます。</p>
  </div>
  <div class="panel">
    <h3>通知</h3>
    <p class="muted">${push.text}</p>
    ${push.button ? '<button class="btn gem" data-act="push">通知をオンにする</button>' : ''}
    ${push.hint ? `<p class="hint">${push.hint}</p>` : ''}
    <p class="hint">届く通知：タスク・曲・予定の追加／締め切り前日の朝9時／完了（次のステップの担当つき）・遅延・中止の報告／毎月のシフト表提出</p>
  </div>
  ${ideasPanel()}
  <button class="btn ghost" data-act="logout">ログアウト</button>
  ${DEMO ? '<p class="hint center">デモモードで表示中です。データは再読み込みで元に戻ります。</p>' : ''}`;
}

// ---------- アルバム・曲の画面 ----------
function openProj(id, push = true) {
  if (!proj(id)) return toast('曲・アルバムが見つかりません', 'err');
  if (push) S.projStack.push(id); else S.projStack = [id];
  $('#proj').hidden = false;
  $('#pBody').scrollTop = 0;
  syncLock();
  renderProj();
}
function projBack() {
  S.projStack.pop();
  if (!S.projStack.length) { $('#proj').hidden = true; syncLock(); render(); return; }
  renderProj();
}

function renderProj() {
  const id = S.projStack[S.projStack.length - 1];
  if (!id || $('#proj').hidden) return;
  const p = proj(id);
  if (!p) { S.projStack.pop(); return projBack(); }
  $('#pTitle').textContent = p.name;
  const body = $('#pBody');
  const top = body.scrollTop;

  if (p.type === 'album') {
    const songs = songsOf(p.id);
    const own = stepsOf(p.id);
    const pr = progressOf(allStepsOfAlbum(p.id));
    body.innerHTML = `<div class="d-inner">
      <div class="p-summary">
        <div class="kind">ALBUM</div>
        <div class="pname">${esc(p.name)}</div>
        <div class="pct"><b>${pr.pct}</b>%</div>
        <div class="bar lg"><i style="width:${pr.pct}%"></i></div>
        <div class="pmeta"><span>${songs.length}曲 ・ ${pr.total}ステップ中 ${pr.done} 完了</span></div>
      </div>
      <div class="p-tools">
        <button class="btn gem sm" data-act="form" data-form="song" data-parent="${esc(p.id)}">＋ 曲を追加</button>
        <button class="btn ghost sm" data-act="form" data-form="task" data-project="${esc(p.id)}">＋ 全体タスク</button>
        <button class="btn ghost sm wide" data-act="form" data-form="rename" data-project="${esc(p.id)}">名前を変更</button>
      </div>
      <h3 class="sec">収録曲</h3>
      ${songs.length ? songs.map(songCard).join('') : '<p class="empty-msg">まだ曲がありません</p>'}
      <h3 class="sec">アルバム全体のタスク（ジャケット・入稿など）</h3>
      ${own.length ? stepTimeline(own) : '<p class="empty-msg">アルバム全体のタスクはありません</p>'}
    </div>`;
  } else {
    const album = p.parentId ? proj(p.parentId) : null;
    const steps = stepsOf(p.id);
    const pr = progressOf(steps);
    body.innerHTML = `<div class="d-inner">
      ${album ? `<div class="crumb">💿 <button data-act="proj" data-id="${esc(album.id)}">${esc(album.name)}</button> › ♪ ${esc(p.name)}</div>` : ''}
      <div class="p-summary">
        <div class="kind">SONG</div>
        <div class="pname">${esc(p.name)}</div>
        ${(() => { const c = subOf(lastDone(p.id, 'composition')); return c ? `<div class="pmeta" style="margin-bottom:6px"><span>仮タイトル「${esc(c.tempTitle)}」${c.taste ? '・' + esc(c.taste) : ''}</span></div>` : ''; })()}
        <div class="pct"><b>${pr.pct}</b>%</div>
        <div class="bar lg"><i style="width:${pr.pct}%"></i></div>
        <div class="cur">${currentLine(steps)}</div>
      </div>
      ${isSongComplete(p.id) ? creditsHtml(p.id) : ''}
      <h3 class="sec">ステップ（上から順番に進みます）</h3>
      ${steps.length ? stepTimeline(steps) : '<p class="empty-msg">ステップがまだありません</p>'}
      ${(() => { const c = lastDone(p.id, 'composition'); return c ? `<h3 class="sec">作曲シート</h3>${compSheetHtml(subOf(c), c.deliverableUrl)}` : ''; })()}
      ${(() => { const l = lastDone(p.id, 'lyrics'); return l ? `<h3 class="sec">歌詞</h3>${lyricsHtml(subOf(l), false)}` : ''; })()}
      <div class="p-tools">
        <button class="btn gem sm" data-act="form" data-form="task" data-project="${esc(p.id)}">＋ ステップを追加</button>
        <button class="btn ghost sm" data-act="form" data-form="rename" data-project="${esc(p.id)}">名前を変更</button>
      </div>
    </div>`;
  }
  body.scrollTop = top;
}

function stepTimeline(steps) {
  return `<ol class="steps">${steps.map((s, i) => {
    const st = stepState(s, steps);
    const p = s.status === 'done' ? 100 : (Number(s.progress) || 0);
    const icon = s.status === 'done' ? '✓' : s.status === 'failed' ? '!' : s.status === 'closed' ? '×' : i + 1;
    return `<li class="st-${st}">
      <div class="node"><span><i>${icon}</i></span></div>
      <button class="step-body" data-act="open" data-id="${esc(s.id)}">
        <div class="step-top"><b>${esc(s.title)}</b>${statusBadge(st)}</div>
        <div class="step-meta">${whoChips(ids(s))}<span class="${isOverdue(s) ? 'late' : ''}">${md(s.deadline)}${s.status === 'open' ? '・' + dueText(s) : ''}</span>${s.status === 'open' ? `<span>${p}%</span>` : ''}</div>
        ${s.status === 'open' && p ? `<div class="bar"><i style="width:${p}%"></i></div>` : ''}
      </button>
      <div class="step-move">
        <button data-act="move" data-id="${esc(s.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="上へ">▲</button>
        <button data-act="move" data-id="${esc(s.id)}" data-dir="1" ${i === steps.length - 1 ? 'disabled' : ''} aria-label="下へ">▼</button>
      </div>
    </li>`;
  }).join('')}</ol>`;
}

async function moveStep(btn) {
  await busy(btn, async () => {
    applyBoot(await api('moveStep', { id: btn.dataset.id, dir: btn.dataset.dir }));
    refreshAll();
  }, null);
}

// ---------- タスク詳細 ----------
async function openDetail(id) {
  S.detail = { id, task: S.tasks.find(t => t.id === id) || null, messages: null };
  $('#detail').hidden = false;
  syncLock();
  $('#dBody').scrollTop = 0;
  $('#dBody').dataset.count = '';
  $('#msgInput').value = ''; autosize($('#msgInput'));
  try { if (location.hash !== '#task=' + id) history.replaceState(null, '', '#task=' + id); } catch (e) {}
  renderDetail();
  await refreshDetail();
  startPoll();
}

function closeDetail() {
  S.detail = null; stopPoll();
  $('#detail').hidden = true;
  syncLock();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  render();
  renderProj();
}

async function refreshDetail() {
  if (!S.detail) return;
  const id = S.detail.id;
  try {
    const r = await api('getTask', { id });
    if (S.detail && S.detail.id === id) applyDetail(r, false);
  } catch (e) {
    if (S.detail && !S.detail.task) { toast(e.message, 'err'); closeDetail(); }
  }
}

function applyDetail(r, toBottom) {
  if (!S.detail) return;
  S.detail.task = r.task;
  S.detail.messages = r.messages;
  upsertTask(r.task);
  S.chat[r.task.id] = { n: r.messages.filter(m => m.type === 'chat').length };
  renderDetail(toBottom);
}

function renderDetail(toBottom) {
  const d = S.detail; if (!d) return;
  const body = $('#dBody');
  const t = d.task;
  if (!t) { $('#dTitle').textContent = '読み込み中…'; body.innerHTML = '<div class="loading"><i></i></div>'; return; }

  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  const prev = body.dataset.count;
  const count = d.messages ? String(d.messages.length) : '';

  $('#dTitle').textContent = t.title;
  const list = ids(t), c = mem(t.createdBy);
  const p = t.status === 'done' ? 100 : (Number(t.progress) || 0);
  const late = isOverdue(t);
  const p0 = proj(t.projectId);
  const steps = p0 ? stepsOf(p0.id) : [];
  const st = p0 ? stepState(t, steps) : t.status;
  const blocker = st === 'waiting' ? steps.find(s => Number(s.order) < Number(t.order) && s.status === 'open') : null;

  const acts = [];
  if (t.status === 'open' && canAct(t) && t.kind === 'shift') {
    acts.push(`<button class="btn gem sm wide" data-act="form" data-form="shift" data-month="${esc((subOf(t) || {}).month || '')}">シフト表の画像を提出</button>`);
    acts.push('<button class="btn danger sm wide" data-act="sheet" data-form="issue">遅延の報告</button>');
  } else if (t.status === 'open' && canAct(t)) {
    acts.push('<button class="btn gem sm wide" data-act="sheet" data-form="progress">進捗を報告する</button>');
    acts.push('<button class="btn outline sm" data-act="sheet" data-form="complete">✓ 完了報告</button>');
    acts.push('<button class="btn danger sm" data-act="sheet" data-form="issue">遅延・中止の報告</button>');
  }
  if (isAdminMode()) {
    acts.push(`<button class="btn ghost sm ${t.status === 'open' ? '' : 'wide'}" data-act="sheet" data-form="edit">✎ 編集（管理者）</button>`);
    if (t.status === 'open') acts.push('<button class="btn danger sm" data-act="sheet" data-form="close">強制終了</button>');
  }

  const resultTitle = { done: '✅ 完了報告', failed: '⚠️ 完了できない理由', closed: '🛑 強制終了' }[t.status];
  const sub = subOf(t);
  const subBlock = t.kind === 'shift' ? '' : sub && t.status === 'done' ? `
    <h3 class="sec">${t.kind === 'composition' ? '作曲シート' : '提出された歌詞'}</h3>
    ${t.kind === 'composition' ? compSheetHtml(sub, t.deliverableUrl) : lyricsHtml(sub, true)}
    ${canAct(t) ? `<button class="btn ghost sm" style="margin-top:8px" data-act="sheet" data-form="resubmit">✎ ${t.kind === 'composition' ? '作曲シート' : '歌詞'}を編集</button>` : ''}` : '';
  const result = t.status !== 'open' ? `
    <div class="d-result r-${t.status}">
      <h4>${resultTitle}</h4>
      ${t.resultNote ? `<p>${linkify(t.resultNote)}</p>` : ''}
      ${t.deliverableUrl && t.kind !== 'composition' ? `<a class="btn gem sm" href="${esc(t.deliverableUrl)}" target="_blank" rel="noopener">提出物を開く（Dropbox）</a>` : ''}
    </div>${subBlock}` : '';

  const msgs = d.messages == null
    ? '<div class="loading"><i></i></div>'
    : (d.messages.length ? d.messages.map(msgHtml).join('') : '<p class="empty-msg">まだメッセージはありません</p>');

  body.innerHTML = `<div class="d-inner">
    ${p0 ? `<div class="crumb">♪ <button data-act="toProj" data-id="${esc(p0.id)}">${projLabel(t)}</button></div>` : ''}
    <div class="d-meta">
      ${p0 ? statusBadge(st) : statusBadge(t.status)}${late ? '<span class="badge s-late">遅延中</span>' : ''}
      <dl>
        <div><dt>担当</dt><dd>${whoChips(list)}</dd></div>
        <div><dt>依頼</dt><dd><span class="who" style="--c:${c.color}">${esc(c.name)}</span></dd></div>
        <div><dt>納期</dt><dd class="${late ? 'late-t' : ''}">${md(t.deadline)}${t.status === 'open' ? `<small>${dueText(t)}</small>` : ''}</dd></div>
      </dl>
    </div>
    ${t.kind && t.kind !== 'shift' && t.status === 'open' ? `<p class="wait kind-note">完了するときに<b>${t.kind === 'composition' ? '作曲シート（仮タイトル・テイスト・時間とパート）' : '歌詞（作曲シートの時間ごと）'}</b>を提出します</p>` : ''}
    ${blocker ? `<p class="wait">前のステップ「${esc(blocker.title)}」（${esc(namesOf(ids(blocker)))}）が終わるのを待っています</p>` : ''}
    ${t.content ? `<div class="d-content">${linkify(t.content)}</div>` : ''}
    <div class="d-progress">
      <div class="lbl">PROGRESS</div>
      <div class="pct"><b>${p}</b>%</div>
      <div class="bar lg"><i style="width:${p}%"></i></div>
      ${t.progressNote ? `<p>${linkify(t.progressNote)}</p>` : '<p class="muted">まだ途中報告はありません</p>'}
    </div>
    ${result}
    ${acts.length ? `<div class="d-actions">${acts.join('')}</div>` : ''}
    <h3 class="sec">チャット</h3>
    <div class="msgs">${msgs}</div>
  </div>`;
  body.dataset.count = count;
  if (toBottom || (prev && count !== prev && nearBottom)) body.scrollTop = body.scrollHeight;
}

function msgHtml(m) {
  const a = mem(m.author);
  const mine = S.me && m.author === S.me.id;
  const time = `<time>${timeLabel(m.createdAt)}</time>`;
  if (m.type === 'system' || m.type === 'admin') {
    return `<div class="m-sys ${m.type}">${linkify(m.text)}${time}</div>`;
  }
  if (m.type === 'chat') {
    return `<div class="m ${mine ? 'mine' : ''}">${mine ? '' : `<div class="m-name" style="color:${a.color}">${esc(a.name)}</div>`}<div class="bubble">${linkify(m.text)}</div>${time}</div>`;
  }
  const head = { progress: `進捗 ${esc(m.progress)}%`, done: '✅ 完了報告', delay: '⏰ 遅延の報告', failed: '⚠️ 完了できない報告' }[m.type] || '';
  return `<div class="m-card t-${m.type}">
    <div class="mc-head"><span class="who" style="--c:${a.color}">${esc(a.name)}</span><b>${head}</b>${time}</div>
    ${m.type === 'progress' ? `<div class="bar"><i style="width:${Number(m.progress) || 0}%"></i></div>` : ''}
    ${m.text ? `<p>${linkify(m.text)}</p>` : ''}
  </div>`;
}

function startPoll() {
  stopPoll();
  S.poll = setInterval(() => { if (document.visibilityState === 'visible') refreshDetail(); }, 8000);
}
function stopPoll() { if (S.poll) clearInterval(S.poll); S.poll = null; }

function openFromHash() {
  const m = location.hash.match(/task=([\w-]+)/);
  if (m && S.me) openDetail(m[1]);
}

// ---------- チャット送信 ----------
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
$('#msgInput').addEventListener('input', e => autosize(e.target));
$('#msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const ta = $('#msgInput');
  const text = ta.value.trim();
  if (!text || !S.detail) return;
  await busy($('#composer .send'), async () => {
    const r = await api('postMessage', { taskId: S.detail.id, type: 'chat', text });
    ta.value = ''; autosize(ta);
    applyDetail(r, true);
  }, null);
});

// ---------- フォーム（ボトムシート） ----------
const sheetHead = title => `<div class="sheet-head"><h3>${title}</h3><button type="button" class="icon-btn" data-act="closeSheet" aria-label="閉じる">✕</button></div>`;
const memberSeg = (name, selected) => `<div class="seg">${S.members.map(m =>
  `<label class="seg-i"><input type="checkbox" name="${name}" value="${m.id}" ${selected.includes(m.id) ? 'checked' : ''}><span style="--c:${m.color}">${esc(m.name)}</span></label>`).join('')}</div>`;
const projectOptions = selected => {
  const opts = ['<option value="">なし（個人タスク）</option>'];
  S.projects.filter(p => p.type === 'album').forEach(a => {
    opts.push(`<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>💿 ${esc(a.name)}（全体タスク）</option>`);
    songsOf(a.id).forEach(s => opts.push(`<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>　♪ ${esc(s.name)}</option>`));
  });
  S.projects.filter(p => p.type === 'song' && !p.parentId).forEach(s =>
    opts.push(`<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>♪ ${esc(s.name)}</option>`));
  return opts.join('');
};

const kindSelect = (cls, value, name = '') => `<select class="${cls}" ${name ? `name="${name}"` : ''} aria-label="提出物の種類">${Object.keys(KIND_LABEL).map(k => `<option value="${k}" ${k === value ? 'selected' : ''}>提出：${KIND_LABEL[k]}</option>`).join('')}</select>`;
function stepRow(i, title, assignees, deadline, kind = '') {
  return `<div class="srow" data-row>
    <div class="srow-head"><span class="num"><i>${i}</i></span>
      <input class="st-title" maxlength="80" value="${esc(title)}" placeholder="ステップ名（例：作曲）" aria-label="ステップ名">
      <button type="button" class="icon-btn" data-act="delRow" aria-label="このステップを削除">✕</button></div>
    ${memberSeg('_', assignees)}
    <input type="date" class="st-date" value="${deadline}" aria-label="納期">
    ${kindSelect('st-kind', kind)}
  </div>`;
}
function renumberRows() { $$('#sheet [data-row] .num i').forEach((n, i) => { n.textContent = i + 1; }); }

const FORMS = {
  chooser() {
    return `${sheetHead('なにを追加しますか？')}
    <div class="chooser">
      <button class="choice" data-act="form" data-form="event" data-date="${S.day >= today() ? S.day : today()}"><span class="ic"><i>◆</i></span><span><b>予定</b><small>スタジオ・打ち合わせなど、みんなのカレンダーに入れる予定</small></span></button>
      <button class="choice" data-act="form" data-form="task"><span class="ic"><i>✓</i></span><span><b>個人タスク</b><small>曲に入らない、ひとつのタスク（今までどおり）</small></span></button>
      <button class="choice" data-act="form" data-form="song"><span class="ic"><i>♪</i></span><span><b>曲（ステップで管理）</b><small>作曲 → 作詞 → レコーディング → ミックス → 提出 のように順番で管理</small></span></button>
      <button class="choice" data-act="form" data-form="album"><span class="ic"><i>◎</i></span><span><b>アルバム</b><small>複数の曲と、ジャケットなど全体のタスクをまとめる</small></span></button>
    </div>`;
  },
  task(_, opts = {}) {
    const p = opts.project ? proj(opts.project) : null;
    const steps = p ? stepsOf(p.id) : [];
    const last = steps.length ? steps[steps.length - 1].deadline : '';
    const def = last && last >= today() ? addDays(last, 7) : (S.view === 'calendar' && S.day >= today() ? S.day : addDays(today(), 7));
    const title = p ? (p.type === 'song' ? `「${esc(p.name)}」にステップを追加` : `「${esc(p.name)}」に全体タスクを追加`) : 'タスクを追加';
    return `<form data-form="task">${sheetHead(title)}
      <label>題名<input name="title" maxlength="80" required placeholder="${p ? '例：マスタリング' : '例：歌詞のメモをまとめる'}"></label>
      <label>内容<textarea name="content" rows="3" maxlength="2000" placeholder="やること・参考URL・注意点など"></textarea></label>
      <div class="field">担当（複数選べます）${memberSeg('assignee', [S.me.id])}</div>
      <label>納期（この日までに完成）<input type="date" name="deadline" required value="${def}"></label>
      <label>曲・アルバム<select name="projectId">${projectOptions(p ? p.id : '')}</select></label>
      <label>提出物の種類${kindSelect('', '', 'kind')}</label>
      ${p ? '<p class="hint" style="margin-top:-6px">いちばん最後のステップとして追加されます。順番はあとから▲▼で変えられます。</p>' : ''}
      <button class="btn gem" type="submit">追加して3人に通知</button>
    </form>`;
  },
  song(_, opts = {}) {
    const me = S.me.id;
    const all = S.members.map(m => m.id);
    const others = all.filter(id => id !== me);
    const tpl = [['作曲', [me], 'composition'], ['作詞', others, 'lyrics'], ['レコーディング', all, ''], ['ミックス', [me], ''], ['提出物の提出', [me], '']];
    const albums = S.projects.filter(p => p.type === 'album');
    return `<form data-form="song">${sheetHead('曲を作る')}
      <label>曲名<input name="name" maxlength="60" required placeholder="例：Midnight Garnet（仮）"></label>
      <label>アルバム<select name="parentId"><option value="">なし（シングル）</option>${albums.map(a => `<option value="${esc(a.id)}" ${a.id === opts.parent ? 'selected' : ''}>💿 ${esc(a.name)}</option>`).join('')}</select></label>
      <div class="field" style="margin-bottom:8px">ステップ（上から順番に進みます。名前・担当・納期は自由に変えられます）</div>
      <div id="stepRows">${tpl.map(([t, a, k], i) => stepRow(i + 1, t, a, addDays(today(), 7 * (i + 1)), k)).join('')}</div>
      <button type="button" class="add-row" data-act="addRow">＋ ステップを追加</button>
      <button class="btn gem" type="submit">曲を作って3人に通知</button>
    </form>`;
  },
  album() {
    return `<form data-form="album">${sheetHead('アルバムを作る')}
      <label>アルバム名<input name="name" maxlength="60" required placeholder="例：1st Album（仮）"></label>
      <p class="hint" style="margin-top:-4px">作ったあと、アルバムの画面から曲やジャケット制作などの全体タスクを追加できます。</p>
      <button class="btn gem" type="submit">アルバムを作る</button>
    </form>`;
  },
  rename(_, opts = {}) {
    const p = proj(opts.project);
    return `<form data-form="rename" data-project="${esc(p.id)}">${sheetHead('名前を変更')}
      <label>${p.type === 'album' ? 'アルバム名' : '曲名'}<input name="name" maxlength="60" required value="${esc(p.name)}"></label>
      <button class="btn gem" type="submit">保存する</button>
    </form>`;
  },
  progress(t) {
    const p = Number(t.progress) || 0;
    return `<form data-form="progress">${sheetHead('進捗を報告')}
      <div class="range-wrap"><output>${p}%</output>
        <input type="range" name="progress" min="0" max="100" step="5" value="${p}" aria-label="進捗率"></div>
      <label>途中報告<textarea name="text" rows="3" maxlength="1000" placeholder="例：ミックス — 音声編集まで完了。次はEQとコンプ"></textarea></label>
      <button class="btn gem" type="submit">報告する</button>
    </form>`;
  },
  complete(t) {
    if (t.kind === 'composition') return compForm(t, false);
    if (t.kind === 'lyrics') return lyricsForm(t, false);
    const next = t.projectId ? stepsOf(t.projectId).find(s => Number(s.order) > Number(t.order) && s.status === 'open') : null;
    return `<form data-form="complete">${sheetHead('完了報告')}
      <label>報告コメント<textarea name="note" rows="3" maxlength="1000" placeholder="仕上がりのポイント・確認してほしいことなど"></textarea></label>
      <label>提出物：DropboxのURL（任意）<input type="url" name="url" inputmode="url" placeholder="https://www.dropbox.com/…"></label>
      <p class="hint">完了を報告すると、ほかの2人に通知が届きます。${next ? `<br>次のステップ「${esc(next.title)}」（${esc(namesOf(ids(next)))}）に進みます。` : ''}</p>
      <button class="btn gem" type="submit">完了を報告する</button>
    </form>`;
  },
  issue(t) {
    return `<form data-form="issue">${sheetHead('遅延・中止の報告')}
      <div class="seg">
        <label class="seg-i"><input type="radio" name="kind" value="delay" checked><span>納期を延ばす</span></label>
        <label class="seg-i"><input type="radio" name="kind" value="failed"><span>完了できない</span></label>
      </div>
      <label style="margin-top:14px">理由（必須）<textarea name="reason" rows="3" maxlength="1000" required placeholder="例：素材の到着が遅れているため"></textarea></label>
      <label class="only-delay">新しい納期（空欄なら ${md(t.deadline)} のまま）<input type="date" name="newDeadline"></label>
      <p class="hint only-failed">「完了できない」で報告すると、このタスクは終了扱いになります。</p>
      <p class="hint">報告すると、ほかの2人に通知が届きます。</p>
      <button class="btn gem" type="submit">報告する</button>
    </form>`;
  },
  edit(t) {
    return `<form data-form="edit">${sheetHead('タスクを編集（管理者）')}
      <label>題名<input name="title" maxlength="80" required value="${esc(t.title)}"></label>
      <label>内容<textarea name="content" rows="3" maxlength="2000">${esc(t.content)}</textarea></label>
      <div class="field">担当（複数選べます）${memberSeg('assignee', ids(t))}</div>
      <label>納期<input type="date" name="deadline" required value="${esc(t.deadline)}"></label>
      ${t.kind === 'shift' ? '' : `<label>提出物の種類${kindSelect('', t.kind || '', 'kind')}</label>`}
      <label>状態<select name="status">${Object.keys(STATUS_LABEL).map(k => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select></label>
      <button class="btn gem" type="submit">保存する</button>
    </form>`;
  },
  close() {
    return `<form data-form="close">${sheetHead('タスクを強制終了')}
      <label>理由・メモ（任意）<textarea name="reason" rows="3" maxlength="1000" placeholder="例：企画変更のため"></textarea></label>
      <p class="hint">強制終了すると、このタスクは終了扱いになり、ほかの2人に通知が届きます。</p>
      <button class="btn danger" type="submit">強制終了する</button>
    </form>`;
  },
  event(_, o = {}) {
    const e = o.id ? S.events.find(x => x.id === o.id) : null;
    const who = e ? splitIds(e.participants) : o.who ? splitIds(o.who) : S.members.map(m => m.id);
    return `<form data-form="event" data-id="${e ? esc(e.id) : ''}">${sheetHead(e ? '予定を編集' : '予定を追加')}
      <label>やる事（必須）<input name="title" maxlength="60" required value="${esc(e ? e.title : '')}" placeholder="例：スタジオ練習／MV打ち合わせ"></label>
      <label>場所<input name="place" maxlength="80" value="${esc(e ? e.place : '')}" placeholder="例：池袋のスタジオ／オンライン"></label>
      <label>日付<input type="date" name="date" required value="${esc(e ? e.date : o.date || S.day)}"></label>
      <div class="two">
        <label>開始<input type="time" name="start" required step="300" value="${esc(e ? e.start : o.start || '18:00')}"></label>
        <label>終了<input type="time" name="end" required step="300" value="${esc(e ? e.end : (o.end && o.end !== '24:00' ? o.end : o.end ? '23:59' : '21:00'))}"></label>
      </div>
      <div class="field">参加する人${memberSeg('participants', who)}</div>
      <label>メモ<textarea name="note" rows="2" maxlength="1000" placeholder="持ち物・やる事の詳細など">${esc(e ? e.note : '')}</textarea></label>
      <button class="btn gem" type="submit">${e ? '保存する' : '予定を入れて通知'}</button>
    </form>`;
  },
  eventView(_, o = {}) {
    const e = S.events.find(x => x.id === o.id);
    if (!e) return sheetHead('予定が見つかりません');
    const parts = splitIds(e.participants);
    const canDel = (S.me && e.createdBy === S.me.id) || isAdminMode();
    return `${sheetHead(esc(e.title))}
      <div class="ev-detail">
        <div class="evd-row"><span class="lbl">日時</span><b>${md(e.date)} ${esc(e.start)}〜${esc(e.end)}</b></div>
        ${e.place ? `<div class="evd-row"><span class="lbl">場所</span><span>${esc(e.place)}</span></div>` : ''}
        <div class="evd-row"><span class="lbl">参加</span>${whoChips(parts)}</div>
        ${e.note ? `<div class="evd-row"><span class="lbl">メモ</span><span>${linkify(e.note)}</span></div>` : ''}
        <div class="evd-row"><span class="lbl">作成</span><span class="muted">${esc(mem(e.createdBy).name)}</span></div>
      </div>
      <div class="two" style="margin-top:14px">
        <button class="btn ghost sm" data-act="form" data-form="event" data-id="${esc(e.id)}">✎ 編集</button>
        ${canDel ? `<button class="btn danger sm" data-act="confirmDel" data-type="event" data-id="${esc(e.id)}" data-label="${esc(e.title)}">削除</button>` : '<span></span>'}
      </div>`;
  },
  avail(_, o = {}) {
    const date = o.date || S.day;
    S.editSlots = availRow(S.me.id, date).split('');
    return `<form data-form="avail" data-date="${esc(date)}">${sheetHead('空き時間を入力')}
      <p class="hint" style="margin:-6px 0 10px"><b style="color:var(--text)">${md(date)}</b>　指でなぞると、まとめて塗れます。シフトの時間は自動で「集まれない」になります。</p>
      <div class="seg paint">
        <label class="seg-i"><input type="radio" name="pm" value="1" checked><span class="pm-ok">◯ 集まれる</span></label>
        <label class="seg-i"><input type="radio" name="pm" value="2"><span class="pm-ng">✕ 集まれない</span></label>
        <label class="seg-i"><input type="radio" name="pm" value="0"><span>消す</span></label>
      </div>
      <div class="quick">
        <button type="button" data-act="quickFill" data-v="1" data-a="34" data-b="48">夕方以降◯</button>
        <button type="button" data-act="quickFill" data-v="1" data-a="${SLOT0}" data-b="48">終日◯</button>
        <button type="button" data-act="quickFill" data-v="2" data-a="${SLOT0}" data-b="48">終日✕</button>
        <button type="button" data-act="quickFill" data-v="0" data-a="0" data-b="48">クリア</button>
      </div>
      <div class="agrid" id="agrid">${availRows(date)}</div>
      <button class="btn gem" type="submit">保存する</button>
    </form>`;
  },
  shift(_, o = {}) {
    const now = today().slice(0, 7);
    const months = [0, 1, 2].map(k => { const d = parseYmd(now + '-01'); d.setMonth(d.getMonth() + k); return ymd(d).slice(0, 7); });
    const def = o.month || months[1];
    if (!months.includes(def)) months.unshift(def);
    return `<form data-form="shift">${sheetHead('シフト表を提出')}
      <label>何月分のシフト？<select name="month">${months.map(m => `<option value="${m}" ${m === def ? 'selected' : ''}>${Number(m.slice(5))}月分（${m.slice(0, 4)}年）</option>`).join('')}</select></label>
      <label class="file-pick">シフト表の画像<input type="file" name="file" accept="image/*" required data-change="shiftFile"></label>
      <img id="shiftPrev" class="shift-prev" alt="" hidden>
      <p class="hint">スクショや写真でOKです。提出すると、その月のシフト提出タスクが完了になります。</p>
      <button class="btn gem" type="submit">提出する</button>
    </form>`;
  },
  confirmDel(_, o = {}) {
    const what = { task: 'タスク', project: '曲・アルバム（中のタスクもすべて）', event: '予定', shift: 'シフト', idea: '要望' }[o.type] || '';
    return `${sheetHead('削除しますか？')}
      <p class="hint" style="margin:0 0 14px">「${esc(o.label || '')}」の${what}を削除します。元に戻せません。</p>
      <button class="btn danger" data-act="delYes" data-type="${esc(o.type)}" data-id="${esc(o.id)}">削除する</button>`;
  },
  adminPw() {
    return `<form data-form="adminPw">${sheetHead('管理者')}
      <label>パスワード<input type="password" name="password" required autocomplete="off"></label>
      ${DEMO ? '<p class="hint" style="margin-top:-6px">デモ版のパスワードは demo です</p>' : ''}
      <button class="btn gem" type="submit">開く</button>
    </form>`;
  },
  image(_, o = {}) {
    return `${sheetHead(esc(o.title || 'シフト表'))}
      <img class="shift-view" src="${o.src}" alt="シフト表">
      <a class="btn gem sm" href="${o.src}" download="${esc(o.name || 'shift.jpg')}" style="margin-top:10px">画像を保存</a>
      <p class="hint">保存できないときは、画像を長押しして保存してください。</p>`;
  },
  resubmit(t) { return t.kind === 'composition' ? compForm(t, true) : lyricsForm(t, true); },
  logout() {
    return `${sheetHead('ログアウトしますか？')}<p class="hint" style="margin:0 0 14px">この端末でもう一度使うときは、もう一度ログインが必要になります。</p><button class="btn danger" data-act="logoutYes">ログアウトする</button>`;
  },
};

const PARTS = ['Intro', 'Verse', 'リリック', 'Pre-Hook', 'HOOK', 'サビ', 'Bridge', 'Outro'];
const secRow = (time = '', label = '') => `<div class="sec-row" data-sec>
  <input class="sec-time" value="${esc(time)}" placeholder="01:30" inputmode="numeric" maxlength="6" aria-label="時間">
  <input class="sec-label" value="${esc(label)}" list="partList" placeholder="HOOK" maxlength="30" aria-label="パート">
  <button type="button" class="icon-btn" data-act="delSec" aria-label="この区切りを削除">✕</button>
</div>`;
function compForm(t, edit) {
  const s0 = subOf(t) || { sections: [{ time: '00:00', label: 'Intro' }, { time: '', label: 'Verse' }, { time: '', label: 'HOOK' }] };
  const next = t.projectId ? stepsOf(t.projectId).find(s => Number(s.order) > Number(t.order) && s.status === 'open') : null;
  return `<form data-form="${edit ? 'resubmit' : 'complete'}">${sheetHead(edit ? '作曲シートを編集' : '作曲の提出')}
    <label>仮タイトル（必須）<input name="tempTitle" maxlength="60" required value="${esc(s0.tempTitle || '')}" placeholder="例：Garnet Night"></label>
    <label>テイスト<input name="taste" maxlength="200" value="${esc(s0.taste || '')}" placeholder="例：エモめのミディアム、BPM 92、夜っぽいシンセ"></label>
    <label>デモ音源：DropboxのURL<input type="url" name="url" inputmode="url" value="${esc(s0.url || t.deliverableUrl || '')}" placeholder="https://www.dropbox.com/…"></label>
    <div class="field" style="margin-bottom:6px">構成（時間とパート）<br><small class="muted">作詞の人はこの区切りごとに歌詞を入れます</small></div>
    <datalist id="partList">${PARTS.map(x => `<option value="${x}">`).join('')}</datalist>
    <div id="secRows">${s0.sections.map(x => secRow(x.time, x.label)).join('')}</div>
    <button type="button" class="add-row" data-act="addSec">＋ 区切りを追加</button>
    ${edit ? '' : `<label>コメント<textarea name="note" rows="2" maxlength="1000" placeholder="作詞の人に伝えたいことなど"></textarea></label>
    <p class="hint">提出すると、ほかの2人に通知が届きます。${next ? `<br>次のステップ「${esc(next.title)}」（${esc(namesOf(ids(next)))}）に進みます。` : ''}</p>`}
    <button class="btn gem" type="submit">${edit ? '保存する' : '作曲シートを提出する'}</button>
  </form>`;
}
function lyricsForm(t, edit) {
  const mine = subOf(t);
  const comp = t.projectId ? subOf(lastDone(t.projectId, 'composition')) : null;
  let secs;
  if (comp && comp.sections && comp.sections.length) {
    const prev = mine ? mine.sections || [] : [];
    secs = comp.sections.map((x, i) => {
      const hit = prev.find(p => p.time === x.time && p.label === x.label) || (prev.length === comp.sections.length ? prev[i] : null);
      return { time: x.time, label: x.label, text: hit ? hit.text : '' };
    });
    prev.filter(p => p.text && !secs.some(x => x.time === p.time && x.label === p.label)).forEach(p => secs.push(p));
  } else {
    secs = mine && mine.sections && mine.sections.length ? mine.sections : [{ time: '', label: '', text: '' }];
  }
  return `<form data-form="${edit ? 'resubmit' : 'complete'}">${sheetHead(edit ? '歌詞を編集' : '歌詞の提出')}
    ${comp ? `<p class="hint" style="margin:-4px 0 12px">作曲シート「${esc(comp.tempTitle)}」の区切りごとに入力してください。空欄の区切りは出力されません。</p>`
      : '<p class="hint" style="margin:-4px 0 12px">作曲シートがまだないので、歌詞をまとめて入力できます。</p>'}
    ${secs.map(x => `<div class="lyr-sec" data-ly data-time="${esc(x.time)}" data-label="${esc(x.label)}">
      ${x.time || x.label ? `<div class="ly-head">${x.time ? `<time>${esc(x.time)}〜</time>` : ''}${esc(x.label)}</div>` : ''}
      <textarea rows="${comp ? 4 : 10}" maxlength="3000" placeholder="${comp ? 'この区切りの歌詞' : '歌詞'}">${esc(x.text || '')}</textarea>
    </div>`).join('')}
    ${edit ? '' : `<label>コメント<textarea name="note" rows="2" maxlength="1000" placeholder="歌い方のメモなど"></textarea></label>
    <p class="hint">提出すると、ほかの2人に通知が届きます。</p>`}
    <button class="btn gem" type="submit">${edit ? '保存する' : '歌詞を提出する'}</button>
  </form>`;
}
function collectSubmission(t, f) {
  if (t.kind === 'composition') {
    const fd = new FormData(f);
    const sections = $$('[data-sec]', f).map(r => ({ time: $('.sec-time', r).value, label: $('.sec-label', r).value.trim() }))
      .filter(x => x.time.trim() || x.label);
    if (!sections.length) throw new Error('構成（時間とパート）を1つ以上入力してください');
    sections.forEach(x => {
      const n = normTime(x.time);
      if (!n) throw new Error(`「${x.label || '?'}」の時間を 01:30 のように入力してください`);
      if (!x.label) throw new Error(`${n} のパート名（HOOK・Verse など）を入力してください`);
      x.time = n;
    });
    return { tempTitle: String(fd.get('tempTitle') || ''), taste: String(fd.get('taste') || ''), url: String(fd.get('url') || ''), sections };
  }
  const sections = $$('[data-ly]', f).map(b => ({ time: b.dataset.time, label: b.dataset.label, text: $('textarea', b).value }));
  if (!sections.some(x => x.text.trim())) throw new Error('歌詞を入力してください');
  return { sections };
}

function openSheet(html) {
  $('#sheet').innerHTML = html;
  const w = $('#sheetWrap');
  w.hidden = false;
  $('#sheet').scrollTop = 0;
  const r = $('#sheet input[type=range]'); if (r) syncRange(r);
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
}
function closeSheet() {
  const w = $('#sheetWrap');
  w.classList.remove('open');
  setTimeout(() => { if (!w.classList.contains('open')) { w.hidden = true; $('#sheet').innerHTML = ''; } }, 250);
}
function syncRange(r) {
  r.style.setProperty('--v', r.value + '%');
  const o = r.parentElement.querySelector('output'); if (o) o.textContent = r.value + '%';
}

const DONE_MSG = {
  progress: '進捗を報告しました', complete: '完了を報告しました 💫', issue: '報告しました',
  edit: '保存しました', close: '強制終了しました', resubmit: '保存しました',
};

async function handleForm(kind, f, btn) {
  const fd = new FormData(f);
  const v = k => String(fd.get(k) || '');
  await busy(btn, async () => {
    if (kind === 'task') {
      const r = await api('createTask', { title: v('title'), content: v('content'), assignee: fd.getAll('assignee'), deadline: v('deadline'), projectId: v('projectId'), kind: v('kind') });
      applyBoot(r);
      closeSheet();
      if (!r.task.projectId) { S.day = r.task.deadline; S.month = r.task.deadline.slice(0, 7); }
      refreshAll();
      toast(r.task.projectId ? 'ステップを追加しました' : 'タスクを追加しました');
      return;
    }
    if (kind === 'song') {
      const steps = $$('[data-row]', f).map(row => ({
        title: $('.st-title', row).value,
        assignee: $$('input[type=checkbox]:checked', row).map(c => c.value),
        deadline: $('.st-date', row).value,
        kind: $('.st-kind', row).value,
      }));
      const r = await api('createProject', { type: 'song', name: v('name'), parentId: v('parentId'), steps });
      applyBoot(r); closeSheet(); render();
      openProj(r.projectId, !$('#proj').hidden);
      toast('曲を作りました 🎵');
      return;
    }
    if (kind === 'album') {
      const r = await api('createProject', { type: 'album', name: v('name') });
      applyBoot(r); closeSheet(); render();
      openProj(r.projectId, false);
      toast('アルバムを作りました 💿');
      return;
    }
    if (kind === 'event') {
      const r = await api('saveEvent', { id: f.dataset.id || '', title: v('title'), place: v('place'), date: v('date'), start: v('start'), end: v('end'), participants: fd.getAll('participants'), note: v('note') });
      applyBoot(r); closeSheet(); S.day = v('date'); S.month = v('date').slice(0, 7); refreshAll();
      toast(f.dataset.id ? '予定を保存しました' : '予定を入れました 📅');
      return;
    }
    if (kind === 'avail') {
      applyBoot(await api('saveAvail', { date: f.dataset.date, slots: S.editSlots.join('') }));
      closeSheet(); refreshAll(); toast('空き時間を保存しました');
      return;
    }
    if (kind === 'shift') {
      const file = f.querySelector('input[type=file]').files[0];
      if (!file) throw new Error('画像を選んでください');
      const data = await compressImage(file);
      applyBoot(await api('uploadShift', { month: v('month'), data }));
      closeSheet(); refreshAll();
      if (S.detail) refreshDetail();
      toast('シフト表を提出しました 🗓');
      return;
    }
    if (kind === 'adminPw') {
      const r = await api('adminLogin', { password: v('password') });
      S.adminToken = r.adminToken;
      closeSheet(); openAdmin(); render();
      return;
    }
    if (kind === 'idea') {
      applyBoot(await api('postIdea', { text: v('text') }));
      f.reset(); refreshAll(); toast('要望を投稿しました');
      return;
    }
    if (kind === 'rename') {
      applyBoot(await api('renameProject', { id: f.dataset.project, name: v('name') }));
      closeSheet(); refreshAll(); toast('名前を変更しました');
      return;
    }
    const id = S.detail.id;
    let r;
    if (kind === 'progress') r = await api('postMessage', { taskId: id, type: 'progress', progress: v('progress'), text: v('text') });
    else if (kind === 'complete') {
      const t = S.detail.task;
      r = t.kind ? await api('completeTask', { id, note: v('note'), submission: collectSubmission(t, f) })
        : await api('completeTask', { id, note: v('note'), url: v('url') });
    }
    else if (kind === 'resubmit') r = await api('updateSubmission', { id, submission: collectSubmission(S.detail.task, f) });
    else if (kind === 'issue') r = await api('reportIssue', { id, kind: v('kind'), reason: v('reason'), newDeadline: v('kind') === 'delay' ? v('newDeadline') : '' });
    else if (kind === 'edit') r = await api('adminUpdate', { id, title: v('title'), content: v('content'), assignee: fd.getAll('assignee'), deadline: v('deadline'), status: v('status'), kind: fd.has('kind') ? v('kind') : undefined });
    else if (kind === 'close') r = await api('adminClose', { id, reason: v('reason') });
    closeSheet();
    applyDetail(r, true);
    render(); renderProj();
    toast(DONE_MSG[kind]);
  });
}

// ---------- 空き時間の入力（なぞって塗る） ----------
function availRows(date) {
  const st = stateArr(S.me.id, date, S.editSlots.join(''));
  let h = '';
  for (let i = SLOT0; i < 48; i++) {
    const sh = st[i] === 'shift';
    const v = sh ? 'shift' : S.editSlots[i] === '1' ? 'ok' : S.editSlots[i] === '2' ? 'ng' : 'u';
    h += `<div class="ar ${i % 2 === 0 ? 'hour' : ''}" data-i="${i}"><span class="at">${i % 2 === 0 ? slotTime(i) : ''}</span><span class="ac s-${v}">${sh && (i === SLOT0 || st[i - 1] !== 'shift') ? 'シフト' : ''}</span></div>`;
  }
  return h;
}
function refreshAgrid() {
  const f = $('#sheet form[data-form=avail]'); if (!f) return;
  $('#agrid').innerHTML = availRows(f.dataset.date);
}
let painting = false;
function paintAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const row = el && el.closest('#agrid .ar');
  if (!row) return;
  const i = Number(row.dataset.i);
  const f = $('#sheet form[data-form=avail]');
  const pm = (f.querySelector('input[name=pm]:checked') || {}).value || '1';
  const cell = $('.ac', row);
  if (cell.classList.contains('s-shift') || S.editSlots[i] === pm) return;
  S.editSlots[i] = pm;
  cell.className = 'ac s-' + (pm === '1' ? 'ok' : pm === '2' ? 'ng' : 'u');
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('#agrid')) return;
  painting = true; e.preventDefault(); paintAt(e.clientX, e.clientY);
});
document.addEventListener('pointermove', e => { if (painting) paintAt(e.clientX, e.clientY); });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { painting = false; }));

// ---------- シフト画像 ----------
async function compressImage(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を読み込めませんでした。JPEGかPNGでお試しください')); i.src = url; });
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// ---------- 削除 ----------
async function doDelete(btn) {
  const { type, id } = btn.dataset;
  const action = { task: 'adminDeleteTask', project: 'adminDeleteProject', event: 'deleteEvent', shift: 'adminDeleteShift', idea: 'adminDeleteIdea' }[type];
  await busy(btn, async () => {
    applyBoot(await api(action, { id }));
    closeSheet();
    if (type === 'task' && S.detail && S.detail.id === id) closeDetail();
    if (type === 'project') { S.projStack = S.projStack.filter(x => proj(x)); if (!S.projStack.length) { $('#proj').hidden = true; syncLock(); } }
    refreshAll();
    toast('削除しました');
  }, '削除中…');
}

// ---------- 意見箱 ----------
const IDEA_LABEL = { open: '未対応', doing: '対応中', done: '適用済み' };
function ideasPanel() {
  const list = S.ideas.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<div class="panel">
    <h3>意見箱</h3>
    <p class="muted small">このサイトへの要望を書いてください。対応されると「適用済み」になります。</p>
    <form data-form="idea" class="idea-form">
      <textarea name="text" rows="3" maxlength="2000" required placeholder="例：予定に色を付けたい／ホーム画面に今日の予定を出したい"></textarea>
      <button class="btn gem sm" type="submit">投稿する</button>
    </form>
    ${list.length ? `<div class="ideas">${list.map(i => `<div class="idea">
      <div class="idea-top"><span class="ist i-${i.status}">${IDEA_LABEL[i.status] || i.status}</span><span class="muted small">${esc(mem(i.author).name)}・${timeLabel(i.createdAt)}</span></div>
      <p>${linkify(i.text)}</p></div>`).join('')}</div>` : ''}
    <button class="btn ghost sm" style="margin-top:12px" data-act="aiPrompt">AIに改修を頼むプロンプトをコピー</button>
  </div>`;
}

function aiPrompt() {
  const todo = S.ideas.filter(i => i.status !== 'done');
  return `あなたは、3人組の音楽ユニット「Midnight Garnet💫」が使っている進捗管理Webアプリの改修担当です。下の要望を反映してください。

## アプリの構成
- フロント：GitHub Pages の静的サイト（index.html / style.css / app.js / config.js / manifest.json / OneSignalSDKWorker.js / icons/）。フレームワークなしの素のJavaScript
- サーバー：Google Apps Script（Code.gs）＋ Googleスプレッドシート。フロントから fetch で JSON を POST（Content-Type は text/plain）
- データのシート：tasks / projects / messages / events / avail / shifts / shiftImages / ideas / sessions
- 通知：OneSignal（GASからAPIで送信）
- ログイン：メンバーごとのログインコード。隠し管理者画面はGAS側のパスワード（スクリプト プロパティ ADMIN_PASSWORD）で照合
- デザイン：黒背景・白文字・ガーネット（赤い宝石）のアクセント。メンバー色 Katsunii＝青 / l0-fer＝緑 / mitudess＝赤
- 主な機能：カレンダー（予定・空き時間・共通時間）／作品（アルバム・曲のステップ管理、作曲シート・歌詞の提出、クレジット）／タスク／チャット・進捗報告／シフト表の提出と取り込み／意見箱

## 要望（${todo.length}件）
${todo.length ? todo.map((i, k) => `${k + 1}. [${IDEA_LABEL[i.status]}] ${i.text.replace(/\n/g, ' ')}（${mem(i.author).name}・${(i.createdAt || '').slice(0, 10)}）`).join('\n') : '（未対応の要望はありません）'}

## お願い
- 今ある機能・データ・見た目を壊さないように改修してください
- 変更が必要なファイルは、部分ではなく全文で出力してください
- スプレッドシートに列やシートを追加する場合は、Code.gs の setup 関数で自動追加されるようにしてください
- 最後に「変更点のまとめ」と「設置済みの環境に反映する手順（GitHubへのアップロード、GASの貼り替えと新バージョンのデプロイなど）」を書いてください

最新のファイル一式をこのあと添付します。`;
}

// ---------- 隠し管理者画面 ----------
function openAdmin() {
  $('#admin').hidden = false; syncLock(); renderAdmin();
}
function closeAdmin() {
  $('#admin').hidden = true; syncLock(); render();
}
function admRow(main, sub, btns) {
  return `<div class="arow"><div class="arow-main"><b>${main}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="arow-btns">${btns}</div></div>`;
}
const delBtn = (type, id, label) => `<button class="mini danger" data-act="confirmDel" data-type="${type}" data-id="${esc(id)}" data-label="${esc(label)}">削除</button>`;

function renderAdmin() {
  if ($('#admin').hidden) return;
  const tabs = [['tasks', 'タスク'], ['works', '作品'], ['events', '予定'], ['shifts', 'シフト'], ['ideas', '意見箱']];
  let body = '';
  if (S.adminTab === 'tasks') {
    const list = S.tasks.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || a.deadline.localeCompare(b.deadline));
    body = `<p class="hint">タスクを開くと、編集・強制終了もできます。</p>` + list.map(t => admRow(esc(t.title),
      `${t.projectId ? '♪ ' + projLabel(t).replace(/<[^>]+>/g, '') + '・' : ''}${esc(namesOf(ids(t)))}・${md(t.deadline)}・${STATUS_LABEL[t.status]}`,
      `<button class="mini" data-act="open" data-id="${esc(t.id)}">開く</button>${delBtn('task', t.id, t.title)}`)).join('');
  } else if (S.adminTab === 'works') {
    body = S.projects.length ? S.projects.slice().sort((a, b) => a.type.localeCompare(b.type)).map(p => admRow(
      `${p.type === 'album' ? '💿' : '♪'} ${esc(p.name)}`,
      `${p.type === 'album' ? `アルバム・${songsOf(p.id).length}曲` : `${p.parentId && proj(p.parentId) ? esc(proj(p.parentId).name) + ' の曲・' : ''}${stepsOf(p.id).length}ステップ`}`,
      `<button class="mini" data-act="form" data-form="rename" data-project="${esc(p.id)}">名前</button>${delBtn('project', p.id, p.name)}`)).join('') : '<p class="empty-msg">作品はありません</p>';
  } else if (S.adminTab === 'events') {
    const list = S.events.slice().sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
    body = list.length ? list.map(e => admRow(esc(e.title), `${md(e.date)} ${e.start}〜${e.end}${e.place ? '・' + esc(e.place) : ''}`,
      `<button class="mini" data-act="form" data-form="event" data-id="${esc(e.id)}">編集</button>${delBtn('event', e.id, e.title)}`)).join('') : '<p class="empty-msg">予定はありません</p>';
  } else if (S.adminTab === 'shifts') {
    const imgs = S.shiftImages.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const pending = S.tasks.filter(t => t.kind === 'shift' && t.status === 'open');
    const thisMonth = today().slice(0, 7);
    const sh = S.shifts.filter(x => x.date.slice(0, 7) >= thisMonth).sort((a, b) => (a.memberId + a.date + a.start).localeCompare(b.memberId + b.date + b.start));
    body = `
      <div class="howto"><b>シフトの取り込み方</b>
        <ol><li>提出された画像の「画像」で開いて保存</li><li>「プロンプト」でClaude用の指示文をコピー</li><li>Claudeのチャットに画像と指示文を貼って送る</li><li>返ってきた内容を下の欄に貼って「取り込む」</li></ol></div>
      <h3 class="sec">提出されたシフト表</h3>
      ${imgs.length ? imgs.map(i => admRow(`<span class="who" style="--c:${mem(i.memberId).color}">${esc(mem(i.memberId).name)}</span> ${Number(i.month.slice(5))}月分`, timeLabel(i.createdAt) + ' 提出',
        `<button class="mini" data-act="admImg" data-id="${esc(i.id)}">画像</button><button class="mini" data-act="admShiftPrompt" data-member="${esc(i.memberId)}" data-month="${esc(i.month)}">プロンプト</button>`)).join('') : '<p class="empty-msg">まだ提出はありません</p>'}
      ${pending.length ? `<p class="hint">未提出：${pending.map(t => `${esc(namesOf(ids(t)))}（${Number(((subOf(t) || {}).month || '').slice(5)) || '?'}月分）`).join('、')}</p>` : ''}
      <h3 class="sec">Claudeの返事を貼り付けて取り込む</h3>
      <textarea id="shiftImport" rows="6" placeholder='[{"member":"kenbo","date":"2026-11-03","start":"09:00","end":"17:00","note":"早番"}]'></textarea>
      <label class="check"><input type="checkbox" id="shiftReplace" checked> 同じ人・同じ月のシフトは置き換える</label>
      <button class="btn gem sm" data-act="admImport">取り込む</button>
      <h3 class="sec">登録されているシフト（今月以降）</h3>
      ${sh.length ? sh.map(x => admRow(`<span class="who" style="--c:${mem(x.memberId).color}">${esc(mem(x.memberId).name)}</span> ${md(x.date)} ${x.start}〜${x.end}`, esc(x.note || ''), delBtn('shift', x.id, `${mem(x.memberId).name} ${md(x.date)}`))).join('') : '<p class="empty-msg">登録されたシフトはありません</p>'}`;
  } else {
    const list = S.ideas.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    body = `<button class="btn ghost sm" data-act="aiPrompt" style="margin-bottom:12px">AIに改修を頼むプロンプトをコピー</button>` +
      (list.length ? list.map(i => `<div class="arow"><div class="arow-main"><b>${linkify(i.text)}</b><small>${esc(mem(i.author).name)}・${timeLabel(i.createdAt)}</small></div>
        <div class="arow-btns"><select class="mini-sel" data-change="ideaStatus" data-id="${esc(i.id)}">${Object.keys(IDEA_LABEL).map(k => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${IDEA_LABEL[k]}</option>`).join('')}</select>${delBtn('idea', i.id, i.text.slice(0, 20))}</div></div>`).join('') : '<p class="empty-msg">要望はまだありません</p>');
  }
  $('#aBody').innerHTML = `<div class="d-inner">
    <div class="chips admin-tabs">${tabs.map(([k, l]) => `<button class="chip ${S.adminTab === k ? 'on' : ''}" data-act="admTab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}
    <button class="btn ghost sm" style="margin-top:20px" data-act="adminLogout">管理者画面を終了</button>
  </div>`;
}

async function showShiftImage(btn) {
  await busy(btn, async () => {
    const r = await api('adminShiftImage', { id: btn.dataset.id });
    const img = S.shiftImages.find(x => x.id === btn.dataset.id) || {};
    openSheet(FORMS.image(null, { src: `data:${r.mime};base64,${r.data}`, name: r.name, title: `${mem(img.memberId).name}・${Number((img.month || '').slice(5))}月分` }));
  }, '…');
}

function shiftPrompt(memberId, month) {
  const m = mem(memberId);
  return `添付したシフト表の画像を読み取って、次のJSON形式「だけ」で出力してください。説明文は不要です。

対象：${m.name}（${m.artist || m.name}） ／ ${month.slice(0, 4)}年${Number(month.slice(5))}月分
出力例：
[{"member":"${m.id}","date":"${month}-03","start":"09:00","end":"17:00","note":"早番"}]

ルール：
- member は必ず "${m.id}"
- 出勤する日だけを1日1件で出力（休みの日は出さない）
- date は YYYY-MM-DD、start と end は 24時間表記の HH:MM
- 日をまたぐ勤務は、end に翌日の時刻をそのまま書く（例：22:00〜06:00）
- 読み取りに自信がない日は note に「要確認」と書く`;
}

async function importShifts(btn) {
  const text = $('#shiftImport').value.trim();
  if (!text) return toast('Claudeの返事を貼り付けてください', 'err');
  await busy(btn, async () => {
    const r = await api('adminImportShifts', { text, replace: $('#shiftReplace').checked });
    applyBoot(r); refreshAll(); toast(`${r.imported}件のシフトを取り込みました`);
  }, '取り込み中…');
}

// ---------- 通知（OneSignal） ----------
function initPush() {
  if (DEMO || !CFG.ONESIGNAL_APP_ID) return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  const s = document.createElement('script');
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  s.defer = true;
  document.head.appendChild(s);
  window.OneSignalDeferred.push(async OneSignal => {
    try {
      // GitHub Pages（https://ユーザー名.github.io/リポジトリ名/）でも動くように、サイトの置き場所に合わせる
      const base = location.pathname.replace(/[^/]*$/, '');
      await OneSignal.init({
        appId: CFG.ONESIGNAL_APP_ID,
        serviceWorkerPath: base.replace(/^\//, '') + 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: base },
      });
      S.os = OneSignal;
      linkPush();
      OneSignal.Notifications.addEventListener('permissionChange', () => { if (S.view === 'settings') render(); });
      OneSignal.User.PushSubscription.addEventListener('change', () => { if (S.view === 'settings') render(); });
    } catch (e) { console.warn('OneSignal', e); }
  });
}
function linkPush() {
  if (S.os && S.me) S.os.login(S.me.id).catch(() => {});
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function pushState() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (DEMO) return { text: 'デモモードでは通知は送られません。' };
  if (!CFG.ONESIGNAL_APP_ID) return { text: '通知の設定（OneSignal）がまだ済んでいません。' };
  if (ios && !isStandalone()) return {
    text: 'iPhoneでは、ホーム画面に追加したアプリから開くと通知をオンにできます。',
    hint: 'Safariの共有ボタン →「ホーム画面に追加」→ ホーム画面のアイコンから開いて、もう一度ログインしてください。',
  };
  if (!('Notification' in window)) return { text: 'この端末・ブラウザは通知に対応していません。' };
  const optedIn = !!(S.os && S.os.User && S.os.User.PushSubscription.optedIn);
  if (Notification.permission === 'granted' && optedIn) return { text: '🔔 通知はオンです。' };
  if (Notification.permission === 'granted') return {
    text: '通知の登録がまだ完了していません。', hint: '下のボタンをもう一度押してください。', button: true,
  };
  if (Notification.permission === 'denied') return {
    text: '通知がブロックされています。',
    hint: '端末の設定で、このアプリ（またはブラウザ）の通知を許可してください。',
  };
  return { text: '通知はまだオフです。', button: true };
}
async function enablePush(btn) {
  if (!S.os) return toast('通知の準備中です。数秒後にもう一度押してください', 'err');
  await busy(btn, async () => {
    if (S.me) await S.os.login(S.me.id);
    if (Notification.permission !== 'granted') await S.os.Notifications.requestPermission();
    if (Notification.permission === 'granted') await S.os.User.PushSubscription.optIn();
    if (S.me) await S.os.login(S.me.id);
    if (!S.os.User.PushSubscription.optedIn) throw new Error('通知の登録に失敗しました。アプリを閉じて開き直し、もう一度お試しください');
    toast('通知をオンにしました 🔔');
  }, '設定中…');
  render();
}

// ---------- イベント ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  switch (el.dataset.act) {
    case 'nav': S.view = el.dataset.view; render(); window.scrollTo(0, 0); break;
    case 'new': openSheet(FORMS.chooser()); break;
    case 'form': openSheet(FORMS[el.dataset.form](null, Object.assign({}, el.dataset))); break;
    case 'filter': S.filter = el.dataset.f; render(); break;
    case 'day': S.day = el.dataset.day; render(); break;
    case 'month': shiftMonth(Number(el.dataset.d)); break;
    case 'today': S.month = today().slice(0, 7); S.day = today(); render(); break;
    case 'open': openDetail(el.dataset.id); break;
    case 'back': closeDetail(); break;
    case 'proj': openProj(el.dataset.id, !$('#proj').hidden); break;
    case 'toProj': {
      const pid = el.dataset.id;
      const showing = !$('#proj').hidden && S.projStack[S.projStack.length - 1] === pid;
      closeDetail();
      if (!showing) openProj(pid, !$('#proj').hidden);
      break;
    }
    case 'projBack': projBack(); break;
    case 'move': moveStep(el); break;
    case 'addRow': {
      const rows = $('#stepRows');
      const n = $$('[data-row]', rows).length;
      if (n >= 20) return toast('ステップは20個までです', 'err');
      const lastDate = n ? $$('.st-date', rows)[n - 1].value : today();
      rows.insertAdjacentHTML('beforeend', stepRow(n + 1, '', [S.me.id], addDays(lastDate || today(), 7)));
      $$('.st-title', rows)[n].focus();
      break;
    }
    case 'delRow': {
      const rows = $('#stepRows');
      if ($$('[data-row]', rows).length <= 1) return toast('ステップは1つ以上必要です', 'err');
      el.closest('[data-row]').remove(); renumberRows();
      break;
    }
    case 'addSec': {
      const rows = $('#secRows');
      if ($$('[data-sec]', rows).length >= 40) return toast('区切りは40個までです', 'err');
      rows.insertAdjacentHTML('beforeend', secRow());
      $$('.sec-time', rows).pop().focus();
      break;
    }
    case 'delSec': {
      if ($$('#secRows [data-sec]').length <= 1) return toast('区切りは1つ以上必要です', 'err');
      el.closest('[data-sec]').remove();
      break;
    }
    case 'copyLyrics': copyText(el.dataset.text, '歌詞をコピーしました'); break;
    case 'calMode': S.calMode = el.dataset.m; render(); break;
    case 'freeMode': S.freeMode = Number(el.dataset.m); render(); break;
    case 'dayShift': S.day = addDays(S.day, Number(el.dataset.d)); S.month = S.day.slice(0, 7); render(); break;
    case 'availEdit': openSheet(FORMS.avail(null, { date: el.dataset.date })); break;
    case 'quickFill': {
      const v = el.dataset.v; const a = Number(el.dataset.a), b = Number(el.dataset.b);
      for (let i = a; i < b; i++) S.editSlots[i] = v;
      refreshAgrid(); break;
    }
    case 'event': openSheet(FORMS.eventView(null, { id: el.dataset.id })); break;
    case 'confirmDel': openSheet(FORMS.confirmDel(null, Object.assign({}, el.dataset))); break;
    case 'delYes': doDelete(el); break;
    case 'admin': if (S.adminToken) openAdmin(); else openSheet(FORMS.adminPw()); break;
    case 'adminClose': closeAdmin(); break;
    case 'adminLogout': S.adminToken = null; closeAdmin(); refreshAll(); toast('管理者画面を終了しました'); break;
    case 'admTab': S.adminTab = el.dataset.tab; renderAdmin(); break;
    case 'admImg': showShiftImage(el); break;
    case 'admShiftPrompt': copyText(shiftPrompt(el.dataset.member, el.dataset.month), 'Claude用のプロンプトをコピーしました'); break;
    case 'admImport': importShifts(el); break;
    case 'aiPrompt': copyText(aiPrompt(), 'AIへのプロンプトをコピーしました'); break;
    case 'closeSheet': closeSheet(); break;
    case 'sheet': if (S.detail && S.detail.task) openSheet(FORMS[el.dataset.form](S.detail.task)); break;
    case 'push': enablePush(el); break;
    case 'logout': openSheet(FORMS.logout()); break;
    case 'logoutYes': closeSheet(); logout(); break;
  }
});
document.addEventListener('change', e => {
  if (e.target.matches('[data-change=shiftFile]')) {
    const f = e.target.files[0]; const img = $('#shiftPrev');
    if (f && img) { img.src = URL.createObjectURL(f); img.hidden = false; }
  }
  if (e.target.matches('[data-change=ideaStatus]')) {
    const sel = e.target;
    busy(null, async () => { applyBoot(await api('adminSetIdea', { id: sel.dataset.id, status: sel.value })); refreshAll(); toast('状態を変更しました'); });
  }
});
document.addEventListener('focusout', e => {
  if (e.target.matches('.sec-time')) { const n = normTime(e.target.value); if (n) e.target.value = n; }
});
document.addEventListener('input', e => { if (e.target.matches('input[type=range]')) syncRange(e.target); });
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.form === 'event' && !f.querySelector('input[name=participants]:checked')) {
    return toast('参加する人を1人以上選んでください', 'err');
  }
  if ((f.dataset.form === 'task' || f.dataset.form === 'edit') && !f.querySelector('input[name=assignee]:checked')) {
    return toast('担当者を1人以上選んでください', 'err');
  }
  if (f.dataset.form === 'song' && $$('[data-row]', f).some(r => !$$('input[type=checkbox]:checked', r).length)) {
    return toast('どのステップにも担当者を1人以上選んでください', 'err');
  }
  handleForm(f.dataset.form, f, f.querySelector('button[type=submit]'));
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !S.me) return;
  load().then(() => { render(); renderProj(); }).catch(() => {});
  if (S.detail) refreshDetail();
});
window.addEventListener('hashchange', () => { if (!S.detail) openFromHash(); });

function shiftMonth(n) {
  const [y, m] = S.month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  S.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  render();
}

// ---------- デモ用の仮サーバー（GAS_URL が空のときだけ使われます） ----------
const Mock = (() => {
  const MEMBERS = [
    { id: 'katsunii', name: 'かつにい', artist: 'Katsunii', admin: true, color: '#4DA3FF' },
    { id: 'mitsu', name: 'みつ', artist: 'mitudess', admin: false, color: '#FF4D5E' },
    { id: 'kenbo', name: 'けんぼー', artist: 'l0-fer', admin: false, color: '#3DDC84' },
  ];
  const ALL = MEMBERS.map(m => m.id);
  const CODES = { DEMO1: 'katsunii', DEMO2: 'mitsu', DEMO3: 'kenbo' };
  const T = today();
  const now = () => new Date().toISOString();
  const ago = h => new Date(Date.now() - h * 36e5).toISOString();
  let seq = 100;
  const mk = o => Object.assign({ id: 't' + (++seq), content: '', status: 'open', progress: '0', progressNote: '', deliverableUrl: '', resultNote: '', projectId: '', order: '', kind: '', submission: '', createdBy: 'katsunii', createdAt: ago(100), updatedAt: ago(10) }, o);

  const projects = [
    { id: 'pA', type: 'album', name: '1st Album（仮）', parentId: '', createdBy: 'katsunii', createdAt: ago(240) },
    { id: 'pS1', type: 'song', name: '夜明けのガーネット（仮）', parentId: 'pA', createdBy: 'katsunii', createdAt: ago(230) },
    { id: 'pS2', type: 'song', name: 'Midnight Run（仮）', parentId: 'pA', createdBy: 'kenbo', createdAt: ago(200) },
    { id: 'pS3', type: 'song', name: 'シングル曲（仮）', parentId: '', createdBy: 'mitsu', createdAt: ago(50) },
    { id: 'pS4', type: 'song', name: 'Ember（完成）', parentId: '', createdBy: 'katsunii', createdAt: ago(400) },
  ];
  const COMP1 = JSON.stringify({ tempTitle: 'Dawn Garnet', taste: 'エモめのミディアム、BPM 92、夜明けっぽいシンセ', url: 'https://www.dropbox.com/', sections: [
    { time: '00:00', label: 'Intro' }, { time: '00:12', label: 'Verse' }, { time: '00:44', label: 'Pre-Hook' }, { time: '01:00', label: 'HOOK' }, { time: '01:30', label: 'Verse' }, { time: '02:02', label: 'HOOK' }] });
  const COMP4 = JSON.stringify({ tempTitle: 'Ember', taste: 'ローファイ・ヒップホップ、BPM 80', url: '', sections: [{ time: '00:10', label: 'リリック' }, { time: '00:42', label: 'HOOK' }] });
  const LYR4 = JSON.stringify({ sections: [
    { time: '00:10', label: 'リリック', text: '消えかけた街灯の下\nまだ言えない言葉を数えてる' },
    { time: '00:42', label: 'HOOK', text: '燃え残るEmber 胸の奥で\n夜が明けるまで離さないで' }] });
  const tasks = [
    mk({ id: 's11', projectId: 'pS1', order: '1', title: '作曲', kind: 'composition', submission: COMP1, assignee: 'katsunii', deadline: addDays(T, -6), status: 'done', progress: '100', resultNote: 'デモ音源できました', deliverableUrl: 'https://www.dropbox.com/' }),
    mk({ id: 's12', projectId: 'pS1', order: '2', title: '作詞', kind: 'lyrics', assignee: 'mitsu,kenbo', deadline: addDays(T, 3), progress: '40', progressNote: '1番のAメロ〜サビまで完成' }),
    mk({ id: 's13', projectId: 'pS1', order: '3', title: 'レコーディング', assignee: ALL.join(','), deadline: addDays(T, 10) }),
    mk({ id: 's14', projectId: 'pS1', order: '4', title: 'ミックス', assignee: 'kenbo', deadline: addDays(T, 17) }),
    mk({ id: 's15', projectId: 'pS1', order: '5', title: '提出物の提出', assignee: 'katsunii', deadline: addDays(T, 20) }),
    mk({ id: 's21', projectId: 'pS2', order: '1', title: '作曲', kind: 'composition', assignee: 'kenbo', deadline: addDays(T, 5), progress: '70', progressNote: 'サビのメロ決定、Bメロ調整中', createdBy: 'kenbo' }),
    mk({ id: 's22', projectId: 'pS2', order: '2', title: '作詞', kind: 'lyrics', assignee: 'katsunii,mitsu', deadline: addDays(T, 12), createdBy: 'kenbo' }),
    mk({ id: 's23', projectId: 'pS2', order: '3', title: 'レコーディング', assignee: ALL.join(','), deadline: addDays(T, 19), createdBy: 'kenbo' }),
    mk({ id: 'sA1', projectId: 'pA', order: '1', title: 'ジャケット制作', assignee: 'mitsu', deadline: addDays(T, 25), progress: '20', progressNote: 'ラフ案2つ' }),
    mk({ id: 's31', projectId: 'pS3', order: '1', title: '作曲', kind: 'composition', assignee: 'mitsu', deadline: addDays(T, 8), createdBy: 'mitsu' }),
    mk({ id: 's32', projectId: 'pS3', order: '2', title: 'ミックス', assignee: 'kenbo', deadline: addDays(T, 15), createdBy: 'mitsu' }),
    mk({ id: 's41', projectId: 'pS4', order: '1', title: '作曲', kind: 'composition', submission: COMP4, assignee: 'kenbo', deadline: addDays(T, -30), status: 'done', progress: '100' }),
    mk({ id: 's42', projectId: 'pS4', order: '2', title: '作詞', kind: 'lyrics', submission: LYR4, assignee: 'mitsu,katsunii', deadline: addDays(T, -20), status: 'done', progress: '100' }),
    mk({ id: 's43', projectId: 'pS4', order: '3', title: 'ミックス', assignee: 'kenbo', deadline: addDays(T, -10), status: 'done', progress: '100', deliverableUrl: 'https://www.dropbox.com/' }),
    mk({ id: 't1', title: 'リリックビデオ制作', content: '1番サビまでの仮版を先に共有してください', assignee: 'mitsu', deadline: addDays(T, 1), progress: '30', progressNote: '素材集めとフォント決めまで完了' }),
    mk({ id: 't2', title: 'レコーディング日程の調整', assignee: 'katsunii', createdBy: 'kenbo', deadline: addDays(T, -2), progress: '50', progressNote: 'スタジオ2候補に問い合わせ中' }),
    mk({ id: 't3', title: 'SNS告知の文章', assignee: 'katsunii', deadline: addDays(T, 6) }),
  ];
  const msgs = [
    { id: 'm1', taskId: 's12', author: 'katsunii', type: 'system', text: 'かつにい が「夜明けのガーネット（仮）」のステップ2として作成しました', progress: '', createdAt: ago(230) },
    { id: 'm2', taskId: 's12', author: 'katsunii', type: 'chat', text: 'サビは英語まじりでもOK！', progress: '', createdAt: ago(48) },
    { id: 'm3', taskId: 's12', author: 'mitsu', type: 'progress', text: '1番のAメロ〜サビまで完成', progress: '40', createdAt: ago(6) },
    { id: 'm4', taskId: 's12', author: 'kenbo', type: 'chat', text: '2番はおれが書くね', progress: '', createdAt: ago(5) },
  ];
  // --- 予定・空き時間・シフト・意見箱（デモ） ---
  const ym0 = T.slice(0, 7);
  const nextMonth = (() => { const d = parseYmd(ym0 + '-01'); d.setMonth(d.getMonth() + 1); return ymd(d).slice(0, 7); })();
  const monthEnd = (() => { const d = parseYmd(nextMonth + '-01'); d.setDate(0); return ymd(d); })();
  ALL.forEach(id => tasks.push(mk({ id: 'sh_' + id, kind: 'shift', title: `${Number(nextMonth.slice(5))}月分のシフト表を提出`, content: 'シフト表の画像をアップロードしてください（月末まで）。', assignee: id, deadline: monthEnd, submission: JSON.stringify({ month: nextMonth }) })));
  const sl = (ok, ng = []) => { const a = Array(48).fill('0'); ok.forEach(([x, y]) => { for (let i = x * 2; i < y * 2; i++) a[i] = '1'; }); ng.forEach(([x, y]) => { for (let i = x * 2; i < y * 2; i++) a[i] = '2'; }); return a.join(''); };
  const avail = [];
  for (let k = 0; k < 10; k++) {
    const d = addDays(T, k); const wd = parseYmd(d).getDay(); const we = wd === 0 || wd === 6;
    avail.push({ memberId: 'katsunii', date: d, slots: k === 2 ? sl([], [[8, 24]]) : sl(we ? [[12, 24]] : [[17, 24]]) });
    avail.push({ memberId: 'mitsu', date: d, slots: sl(we ? [[13, 23]] : [[18, 23]], [[8, 10]]) });
    avail.push({ memberId: 'kenbo', date: d, slots: sl(we ? [[10, 24]] : [[19, 24]]) });
  }
  const shifts = [
    { id: 'x1', memberId: 'kenbo', date: addDays(T, 1), start: '10:00', end: '20:00', note: '中番' },
    { id: 'x2', memberId: 'kenbo', date: addDays(T, 4), start: '15:00', end: '22:00', note: '遅番' },
    { id: 'x3', memberId: 'mitsu', date: addDays(T, 5), start: '17:00', end: '21:00', note: '' },
  ];
  const events = [
    { id: 'e1', title: 'スタジオ練習', date: addDays(T, 3), start: '19:00', end: '22:00', place: '池袋のスタジオ', note: '新曲のアレンジ確認', participants: ALL.join(','), createdBy: 'katsunii', createdAt: ago(20), updatedAt: ago(20) },
    { id: 'e2', title: 'MV打ち合わせ', date: addDays(T, 6), start: '20:00', end: '21:30', place: 'オンライン', note: '', participants: 'katsunii,mitsu', createdBy: 'mitsu', createdAt: ago(10), updatedAt: ago(10) },
  ];
  const shiftImages = [];
  const ideas = [
    { id: 'i1', author: 'kenbo', text: 'ホーム画面に「今日の予定」を出してほしい', status: 'open', createdAt: ago(30), updatedAt: ago(30) },
    { id: 'i2', author: 'mitsu', text: '歌詞をコピーできるボタンがほしい', status: 'done', createdAt: ago(200), updatedAt: ago(100) },
  ];
  const hm = s => { const m = String(s || '').trim().replace(/[：]/g, ':').match(/^(\d{1,2}):?(\d{2})$/); if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw '時刻は 18:00 のように入力してください'; return ('0' + m[1]).slice(-2) + ':' + m[2]; };

  const name = id => (MEMBERS.find(m => m.id === id) || {}).name || id;
  const names = list => list.length === ALL.length ? '全員' : list.map(name).join('・');
  const norm = a => { const l = (Array.isArray(a) ? a : String(a || '').split(',')).filter(x => ALL.includes(x)); if (!l.length) throw '担当者を1人以上選んでください'; return ALL.filter(x => l.includes(x)).join(','); };
  const add = (taskId, author, type, text, progress = '') => msgs.push({ id: 'm' + (++seq), taskId, author, type, text, progress: String(progress), createdAt: now() });
  const find = id => { const t = tasks.find(x => x.id === id); if (!t) throw 'タスクが見つかりません'; return t; };
  const steps = pid => tasks.filter(t => t.projectId === pid).sort((a, b) => a.order - b.order);
  const detail = id => ({ ok: true, task: Object.assign({}, find(id)), messages: msgs.filter(m => m.taskId === id).map(m => Object.assign({}, m)) });
  const own = (t, m) => { if (!t.assignee.split(',').includes(m.id) && !m.isAdmin) throw '担当者だけが報告できます'; if (t.status !== 'open') throw 'このタスクはすでに終了しています'; };
  const date = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw '納期を正しく入力してください'; return d; };
  const boot = m => {
    const chat = {};
    msgs.forEach(x => { if (x.type === 'chat') { chat[x.taskId] = chat[x.taskId] || { n: 0 }; chat[x.taskId].n++; } });
    const cp = a => a.map(x => Object.assign({}, x));
    return { ok: true, me: Object.assign({}, m), members: cp(MEMBERS), tasks: cp(tasks), projects: cp(projects), chat,
      events: cp(events), avail: cp(avail), shifts: cp(shifts), shiftImages: shiftImages.map(x => ({ id: x.id, memberId: x.memberId, month: x.month, mime: x.mime, createdAt: x.createdAt })), ideas: cp(ideas) };
  };

  const H = {
    bootstrap: (r, m) => boot(m),
    getTask: r => detail(r.id),
    createTask(r, m) {
      const title = String(r.title || '').trim(); if (!title) throw '題名を入力してください';
      let order = '';
      if (r.projectId) { const s = steps(r.projectId); order = String(s.length ? Number(s[s.length - 1].order) + 1 : 1); }
      const t = mk({ title, content: String(r.content || '').trim(), assignee: norm(r.assignee), createdBy: m.id, deadline: date(r.deadline), projectId: r.projectId || '', order, kind: r.kind || '', createdAt: now(), updatedAt: now() });
      tasks.push(t);
      add(t.id, m.id, 'system', `${m.name} が ${names(t.assignee.split(','))} にタスクを作成しました`);
      return Object.assign(boot(m), { task: Object.assign({}, t) });
    },
    createProject(r, m) {
      const nm = String(r.name || '').trim(); if (!nm) throw '名前を入力してください';
      const p = { id: 'p' + (++seq), type: r.type === 'album' ? 'album' : 'song', name: nm, parentId: r.type === 'album' ? '' : (r.parentId || ''), createdBy: m.id, createdAt: now() };
      const st = (r.steps || []).map((s, i) => {
        const title = String(s.title || '').trim(); if (!title) throw `${i + 1}番目のステップの題名を入力してください`;
        return { title, assignee: norm(s.assignee), deadline: date(s.deadline), kind: s.kind || '' };
      });
      projects.push(p);
      st.forEach((s, i) => {
        const t = mk(Object.assign(s, { projectId: p.id, order: String(i + 1), createdBy: m.id, createdAt: now(), updatedAt: now() }));
        tasks.push(t);
        add(t.id, m.id, 'system', `${m.name} が「${nm}」のステップ${i + 1}として作成しました`);
      });
      return Object.assign(boot(m), { projectId: p.id });
    },
    renameProject(r, m) {
      const p = projects.find(x => x.id === r.id); const nm = String(r.name || '').trim();
      if (!nm) throw '名前を入力してください'; p.name = nm; return boot(m);
    },
    moveStep(r, m) {
      const t = find(r.id); const s = steps(t.projectId); const i = s.indexOf(t); const j = i + (Number(r.dir) < 0 ? -1 : 1);
      if (j >= 0 && j < s.length) { [s[i], s[j]] = [s[j], s[i]]; s.forEach((x, k) => { x.order = String(k + 1); }); }
      return boot(m);
    },
    postMessage(r, m) {
      const t = find(r.taskId); const text = String(r.text || '').trim();
      if (r.type === 'progress') { own(t, m); t.progress = String(r.progress); t.progressNote = text; t.updatedAt = now(); add(t.id, m.id, 'progress', text, r.progress); }
      else { if (!text) throw 'メッセージを入力してください'; add(t.id, m.id, 'chat', text); }
      return detail(t.id);
    },
    completeTask(r, m) {
      const t = find(r.id); own(t, m);
      if (t.kind) {
        const sub = checkSub(t.kind, r.submission);
        Object.assign(t, { status: 'done', progress: '100', submission: JSON.stringify(sub), deliverableUrl: sub.url || '', resultNote: String(r.note || '').trim(), updatedAt: now() });
        add(t.id, m.id, 'done', [t.kind === 'composition' ? `🎼 作曲シートを提出しました（仮タイトル：${sub.tempTitle}）` : '📝 歌詞を提出しました', t.resultNote].filter(Boolean).join('\n'), 100);
        return detail(t.id);
      }
      const url = String(r.url || '').trim();
      if (url && !/^https:\/\/\S+$/.test(url)) throw 'URLは https:// から始まる形で貼り付けてください';
      Object.assign(t, { status: 'done', progress: '100', deliverableUrl: url, resultNote: String(r.note || '').trim(), updatedAt: now() });
      add(t.id, m.id, 'done', t.resultNote + (url ? '\n' + url : ''), 100);
      return detail(t.id);
    },
    reportIssue(r, m) {
      const t = find(r.id); own(t, m);
      const reason = String(r.reason || '').trim(); if (!reason) throw '理由を入力してください';
      if (r.kind === 'failed') { t.status = 'failed'; t.resultNote = reason; add(t.id, m.id, 'failed', reason); }
      else {
        let text = reason;
        if (r.newDeadline) { text += `\n納期：${md(t.deadline)} → ${md(r.newDeadline)}`; t.deadline = r.newDeadline; }
        add(t.id, m.id, 'delay', text);
      }
      t.updatedAt = now();
      return detail(t.id);
    },
    adminUpdate(r, m) {
      if (!m.isAdmin) throw '管理者だけが使える操作です';
      const t = find(r.id);
      Object.assign(t, { title: r.title || t.title, content: r.content, assignee: norm(r.assignee), deadline: date(r.deadline), status: r.status || t.status, updatedAt: now() });
      add(t.id, m.id, 'admin', `${m.name} が編集しました`);
      return detail(t.id);
    },
    adminClose(r, m) {
      if (!m.isAdmin) throw '管理者だけが使える操作です';
      const t = find(r.id);
      Object.assign(t, { status: 'closed', resultNote: String(r.reason || '').trim(), updatedAt: now() });
      add(t.id, m.id, 'admin', `${m.name} がタスクを強制終了しました` + (t.resultNote ? '\n' + t.resultNote : ''));
      return detail(t.id);
    },
    updateSubmission(r, m) {
      const t = find(r.id);
      if (!t.assignee.split(',').includes(m.id) && !m.isAdmin) throw '担当者だけが報告できます';
      const sub = checkSub(t.kind, r.submission);
      t.submission = JSON.stringify(sub); if (sub.url != null) t.deliverableUrl = sub.url;
      add(t.id, m.id, 'system', `${m.name} が${t.kind === 'lyrics' ? '歌詞' : '作曲シート'}を更新しました`);
      return detail(t.id);
    },
    saveEvent(r, m) {
      const title = String(r.title || '').trim(); if (!title) throw 'やる事を入力してください';
      const start = hm(r.start), end = hm(r.end); if (end <= start) throw '終了は開始より後の時間にしてください';
      const o = { title, date: date(r.date), start, end, place: String(r.place || '').trim(), note: String(r.note || '').trim(), participants: norm(r.participants), updatedAt: now() };
      if (r.id) Object.assign(events.find(e => e.id === r.id), o);
      else events.push(Object.assign({ id: 'e' + (++seq), createdBy: m.id, createdAt: now() }, o));
      return boot(m);
    },
    deleteEvent(r, m) {
      const i = events.findIndex(e => e.id === r.id); if (i < 0) throw '予定が見つかりません';
      if (events[i].createdBy !== m.id && !m.isAdmin) throw '予定を作った人か管理者だけが削除できます';
      events.splice(i, 1); return boot(m);
    },
    saveAvail(r, m) {
      if (!/^[012]{48}$/.test(r.slots)) throw '時間の形式が正しくありません';
      const row = avail.find(a => a.memberId === m.id && a.date === r.date);
      if (row) row.slots = r.slots; else avail.push({ memberId: m.id, date: r.date, slots: r.slots });
      return boot(m);
    },
    uploadShift(r, m) {
      if (!/^data:image\//.test(r.data || '')) throw '画像を選んでください';
      shiftImages.push({ id: 'si' + (++seq), memberId: m.id, month: r.month, mime: 'image/jpeg', data: r.data, createdAt: now() });
      const t = tasks.find(x => x.kind === 'shift' && x.status === 'open' && x.assignee === m.id && JSON.parse(x.submission || '{}').month === r.month);
      if (t) { Object.assign(t, { status: 'done', progress: '100', updatedAt: now() }); add(t.id, m.id, 'done', `🗓 ${Number(r.month.slice(5))}月分のシフト表を提出しました`, 100); }
      return boot(m);
    },
    postIdea(r, m) {
      const text = String(r.text || '').trim(); if (!text) throw '要望を入力してください';
      ideas.push({ id: 'i' + (++seq), author: m.id, text, status: 'open', createdAt: now(), updatedAt: now() }); return boot(m);
    },
    adminLogin(r) { if (r.password !== 'demo') throw 'パスワードが違います（デモは demo）'; return { ok: true, adminToken: 'demo-admin' }; },
    adminDeleteTask(r, m) { const i = tasks.findIndex(t => t.id === r.id); if (i >= 0) tasks.splice(i, 1); return boot(m); },
    adminDeleteProject(r, m) {
      const idsP = [r.id].concat(projects.filter(p => p.parentId === r.id).map(p => p.id));
      for (let i = tasks.length - 1; i >= 0; i--) if (idsP.includes(tasks[i].projectId)) tasks.splice(i, 1);
      for (let i = projects.length - 1; i >= 0; i--) if (idsP.includes(projects[i].id)) projects.splice(i, 1);
      return boot(m);
    },
    adminImportShifts(r, m) {
      let arr = null; const mt = String(r.text).match(/\[[\s\S]*\]/);
      if (mt) { try { arr = JSON.parse(mt[0]); } catch (e) {} }
      if (!arr) arr = String(r.text).split(/\n/).filter(l => l.includes(',')).map(l => { const c = l.split(','); return { member: c[0], date: c[1], start: c[2], end: c[3], note: c[4] || '' }; });
      const list = arr.map((x, i) => {
        const key = String(x.member || '').trim().toLowerCase();
        const mb = MEMBERS.find(y => [y.id, y.name, y.artist].some(v => v.toLowerCase() === key));
        if (!mb) throw `${i + 1}件目：メンバー「${x.member}」がわかりません`;
        return { memberId: mb.id, date: date(String(x.date).replace(/\//g, '-')), start: hm(x.start), end: hm(x.end), note: x.note || '' };
      });
      if (!list.length) throw '取り込めるシフトが見つかりませんでした';
      if (r.replace) { const keys = new Set(list.map(x => x.memberId + x.date.slice(0, 7))); for (let i = shifts.length - 1; i >= 0; i--) if (keys.has(shifts[i].memberId + shifts[i].date.slice(0, 7))) shifts.splice(i, 1); }
      list.forEach(x => {
        if (x.end > x.start) shifts.push(Object.assign({ id: 'x' + (++seq) }, x));
        else { shifts.push(Object.assign({ id: 'x' + (++seq) }, x, { end: '24:00' })); shifts.push(Object.assign({ id: 'x' + (++seq) }, x, { date: addDays(x.date, 1), start: '00:00' })); }
      });
      return Object.assign(boot(m), { imported: list.length });
    },
    adminDeleteShift(r, m) { const i = shifts.findIndex(x => x.id === r.id); if (i >= 0) shifts.splice(i, 1); return boot(m); },
    adminShiftImage(r) { const x = shiftImages.find(y => y.id === r.id); if (!x) throw '画像が見つかりません'; return { ok: true, mime: 'image/jpeg', data: x.data.split(',')[1], name: `${x.month}_${x.memberId}.jpg` }; },
    adminSetIdea(r, m) { const x = ideas.find(y => y.id === r.id); x.status = r.status; x.updatedAt = now(); return boot(m); },
    adminDeleteIdea(r, m) { const i = ideas.findIndex(y => y.id === r.id); if (i >= 0) ideas.splice(i, 1); return boot(m); },
    logout: () => ({ ok: true }),
  };
  function checkSub(kind, raw) {
    const secs = (raw && raw.sections) || [];
    if (kind === 'composition') {
      if (!String(raw.tempTitle || '').trim()) throw '仮タイトルを入力してください';
      if (!secs.length) throw '構成（時間とパート）を1つ以上入力してください';
      return { tempTitle: raw.tempTitle.trim(), taste: String(raw.taste || '').trim(), url: String(raw.url || '').trim(), sections: secs.map(x => ({ time: normTime(x.time), label: x.label })) };
    }
    if (!secs.some(x => String(x.text || '').trim())) throw '歌詞を入力してください';
    return { sections: secs.map(x => ({ time: x.time || '', label: x.label || '', text: String(x.text || '').trim() })) };
  }

  return {
    async call(p) {
      await new Promise(r => setTimeout(r, 200));
      try {
        if (p.action === 'login') {
          const id = CODES[String(p.code || '').trim().toUpperCase()];
          if (!id) throw 'ログインコードが違います（デモは DEMO1〜DEMO3）';
          return { ok: true, token: 'demo-' + id, me: Object.assign({}, MEMBERS.find(m => m.id === id)) };
        }
        const m0 = MEMBERS.find(x => 'demo-' + x.id === p.token);
        if (!m0) throw 'AUTH';
        const m = Object.assign({}, m0, { isAdmin: p.adminToken === 'demo-admin' });
        if (p.action.startsWith('admin') && p.action !== 'adminLogin' && !m.isAdmin) throw 'ADMIN';
        return H[p.action](p, m);
      } catch (e) {
        return { ok: false, error: typeof e === 'string' ? e : e.message };
      }
    },
  };
})();

boot();
})();
