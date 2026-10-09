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
  events: [], avail: [], shifts: [], shiftImages: [], ideas: [], memos: [], releases: [], fixedShifts: [], offdays: [], memoReplies: [], memoMarks: [], links: [], eventIdeas: [], pchat: {},
  worksMode: 'making', minMonth: today().slice(0, 7), jackets: {}, jacketDraft: null,
  syncPid: null, syncRows: null, syncCur: 0, syncSaved: {}, syncFile: '',
  mandala: {}, mandalaLoaded: false, mdSel: 4, mdItem: null,
  calMine: store.get('mg_calMine') === '1', calShift: store.get('mg_calShift') !== '0', weekEdit: null,
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

// ---------- アニメーション（Motion ＝ Framer Motion のJavaScript版） ----------
const FX = (() => {
  const M = () => window.Motion;
  const ok = () => !!(M() && M().animate) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spring = (o = {}) => Object.assign({ type: M().spring, stiffness: 380, damping: 30 }, o);
  const anim = (el, kf, opt) => { try { return M().animate(el, kf, opt); } catch (e) { return null; } };
  // 入場：同じ親の中で入れ子にならないように、いちばん外側の要素だけを順番に
  const ENTER = '.page-title,.segtabs,.banner,.off-banner,.cal-head,.date-nav,.legend,.cal-filters,.cal,.day-head,.sec,.card,.pcard,.ev-card,.memo,.mtg,.range,.panel,.mday,.works-actions,.empty-msg,.wk,.md-head,.md-board,.disco,.tl-wrap,.mode-seg,.sync-bar,.sync-lines,.status-list,.memos>.btn,#view>.btn,.md-ed-head,.md-fgrid,.md-detail,.md-nav';
  function enter(root) {
    if (!ok() || !root) return;
    const all = $$(ENTER, root);
    // 画面の外（下のほう）の要素は GSAP の ScrollTrigger がスクロールに合わせて出すので、ここでは扱わない
    const top = all.filter(el => !all.some(o => o !== el && o.contains(el)) && el.getBoundingClientRect().top < innerHeight).slice(0, 28);
    top.forEach((el, i) => anim(el, { opacity: [0, 1], y: [16, 0] }, spring({ delay: i * 0.035 })));
    // 中の小さな要素も少し遅れて
    $$('.chip', root).slice(0, 140).forEach((el, i) => anim(el, { opacity: [0, 1], x: [-6, 0] }, { duration: 0.3, delay: 0.15 + (i % 40) * 0.008 }));
    $$('.dia', root).slice(0, 80).forEach((el, i) => anim(el, { scale: [0, 1] }, spring({ delay: 0.2 + i * 0.03, stiffness: 500, damping: 14 })));
    bars(root);
    $$('.hd-badge').forEach(b => anim(b, { scale: [1, 1.25, 1] }, { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }));
  }
  function bars(root) {
    $$('.bar i', root).forEach(el => { const w = el.style.width; if (w) anim(el, { width: ['0%', w] }, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }); });
  }
  function slide(el, dir) { if (ok() && el) anim(el, { opacity: [0, 1], x: [dir * 48, 0] }, spring({ stiffness: 320, damping: 32 })); }
  function pop(el, from = 0.8) { if (ok() && el) anim(el, { scale: [from, 1] }, spring({ stiffness: 520, damping: 14 })); }
  // ボトムシート
  function sheetIn(sheet) {
    if (!ok()) return false;
    sheet.style.transition = 'none';
    const h = sheet.offsetHeight || 500;
    anim(sheet, { y: [h, 0] }, spring({ stiffness: 360, damping: 34 }));
    const items = $$(':scope > *, :scope > form > *, :scope > .ev-detail > *', sheet).filter(el => el.tagName !== 'FORM' && !el.classList.contains('ev-detail')).slice(0, 16);
    items.forEach((el, i) => anim(el, { opacity: [0, 1], y: [12, 0] }, spring({ delay: 0.06 + i * 0.03 })));
    return true;
  }
  function sheetOut(sheet) {
    if (!ok()) return null;
    return anim(sheet, { y: sheet.offsetHeight || 500 }, { duration: 0.22, ease: [0.4, 0, 1, 1] });
  }
  // 詳細などの全画面
  function overlayIn(el) {
    if (!ok() || !el) return;
    el.style.animation = 'none';
    anim(el, { x: [60, 0], opacity: [0, 1] }, spring({ stiffness: 340, damping: 32 }));
    const body = $('.o-body,#dBody', el) || el;
    $$('.d-inner > *, .o-body > *', body).slice(0, 14).forEach((c, i) => anim(c, { opacity: [0, 1], y: [14, 0] }, spring({ delay: 0.08 + i * 0.04 })));
  }
  function overlayOut(el, done) {
    if (!ok() || !el) { done(); return; }
    const a = anim(el, { x: 60, opacity: 0 }, { duration: 0.2, ease: 'easeIn' });
    (a ? a.then(done) : done());
  }
  // トースト
  function toastIn(t) { if (ok()) anim(t, { y: [-24, 0], scale: [0.85, 1], opacity: [0, 1] }, spring({ stiffness: 500, damping: 22 })); }
  function toastOut(t, done) { if (!ok()) return done(); const a = anim(t, { y: -16, opacity: 0 }, { duration: 0.2 }); a ? a.then(done) : done(); }
  // 押したときの手応え
  function press(el) { if (ok()) anim(el, { scale: 0.94 }, { duration: 0.1 }); }
  function release(el) { if (ok()) anim(el, { scale: 1 }, spring({ stiffness: 600, damping: 15 })); }
  // お祝い（ガーネットの紙吹雪）
  function confetti(x, y) {
    if (!ok()) return;
    x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight * 0.45 : y;
    const colors = ['#e0115f', '#ff8fa3', '#ffd977', '#ffffff', '#9b111e', '#4DA3FF', '#3DDC84'];
    for (let k = 0; k < 46; k++) {
      const p = document.createElement('i');
      p.className = 'fx-conf';
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.background = colors[k % colors.length];
      if (k % 3 === 0) p.style.borderRadius = '50%';
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      anim(p, {
        x: [0, Math.cos(ang) * v], y: [0, Math.sin(ang) * v - 120, Math.sin(ang) * v + 260],
        rotate: [0, Math.random() * 720 - 360], opacity: [1, 1, 0], scale: [0.6, 1.1, 0.8],
      }, { duration: 1.4 + Math.random() * 0.6, ease: [0.1, 0.7, 0.4, 1] })?.then(() => p.remove());
    }
    const gem = document.createElement('span');
    gem.className = 'fx-gem'; gem.textContent = '💎';
    gem.style.left = x + 'px'; gem.style.top = y + 'px';
    document.body.appendChild(gem);
    anim(gem, { scale: [0, 1.6, 1.2, 0], rotate: [-30, 10, 0, 0], opacity: [1, 1, 1, 0] }, { duration: 1.3, times: [0, 0.3, 0.75, 1] })?.then(() => gem.remove());
  }
  // ログイン画面
  function login() {
    if (!ok()) return;
    const card = $('.login-card'); if (!card) return;
    $$(':scope > *', card).forEach((el, i) => anim(el, { opacity: [0, 1], y: [24, 0] }, spring({ delay: 0.1 + i * 0.08 })));
  }
  return { ok, enter, bars, slide, pop, sheetIn, sheetOut, overlayIn, overlayOut, toastIn, toastOut, press, release, confetti, login };
})();
// 押したときの手応え（ボタン・カード全般）
const PRESS_SEL = '.btn,.card,.pcard,.choice,.cell,.tg,.segtabs button,.mode-seg button,.tabbar button:not(.fab),.ev-card,.range,.rel,.off-day,.md-cell,.hd-btn,.me,.icon-btn';
let pressed = null;
document.addEventListener('pointerdown', e => { const el = e.target.closest(PRESS_SEL); if (!el || el.disabled) return; pressed = el; FX.press(el); }, { passive: true });
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => document.addEventListener(t, () => { if (pressed) { FX.release(pressed); pressed = null; } }, { passive: true }));

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
  FX.toastIn(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => FX.toastOut(t, () => { t.className = ''; t.style.opacity = ''; t.style.transform = ''; }), 2800);
}

async function busy(btn, fn, label = '送信中…') {
  let old;
  if (btn) { btn.disabled = true; if (label) { old = btn.innerHTML; btn.textContent = label; } }
  try { return await fn(); }
  catch (e) { toast(e.message, 'err'); }
  finally { if (btn) { btn.disabled = false; if (label && old != null) btn.innerHTML = old; } }
}

// ---------- 起動時のロゴアニメーション（Motion） ----------
(function splash() {
  const el = $('#splash'); if (!el) return;
  const M = window.Motion;
  const done = () => { el.classList.add('gone'); window.dispatchEvent(new Event('mg:splashdone')); };
  if (!M || !M.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(done, 400); }, 500);
    return;
  }
  const A = M.animate;
  let finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    A(el, { opacity: 0, scale: 1.06 }, { duration: 0.45, ease: [0.4, 0, 0.2, 1] }).then(done);
  };
  el.addEventListener('click', finish); // タップで飛ばせる
  const comets = $$('.sp-comet', el), trails = $$('.sp-trail', el);
  const logo = $('.sp-logo', el), flash = $('.sp-flash', el), stage = $('.sp-stage', el);
  // 彗星：短い光の線がパスの上を走る（strokeDasharray で長さ seg の線だけ見せる）
  comets.forEach((p, i) => {
    i = i % 2; // 光の芯と、まわりの赤い光は同じタイミングで走る
    const L = p.getTotalLength(), seg = L * 0.3;
    p.style.strokeDasharray = `${seg} ${L}`;
    p.style.strokeDashoffset = String(seg);
    const delay = 0.35 + i * 0.12;
    A(p, { opacity: [0, 1, 1, 0] }, { duration: 2.4, delay, times: [0, 0.08, 0.85, 1] });
    A(p, { strokeDashoffset: [seg, -L] }, { duration: 2.4, delay, ease: [0.55, 0.05, 0.35, 1] });
  });
  // 軌跡：光が通ったあとにうっすら形が残る
  trails.forEach((p, i) => {
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = String(L);
    const delay = 0.45 + i * 0.15;
    A(p, { strokeDashoffset: [L, 0] }, { duration: 2.1, delay, ease: [0.55, 0.05, 0.35, 1] });
    A(p, { opacity: [0, 0.85, 0.85, 0] }, { duration: 3.1, delay, times: [0, 0.2, 0.8, 1] });
  });
  // 右上で光がはじけて、ロゴが現れる
  A(flash, { opacity: [0, 1, 0], scale: [0.2, 1.6, 2.2] }, { duration: 0.7, delay: 2.55, ease: 'easeOut' });
  A(logo, { opacity: [0, 1], scale: [1.12, 1], filter: ['blur(10px) brightness(2)', 'blur(0px) brightness(1)'] },
    { duration: 0.9, delay: 2.7, ease: [0.2, 0.8, 0.2, 1] });
  A(stage, { scale: [0.96, 1] }, { duration: 3.6, ease: 'easeOut' });
  setTimeout(finish, 4300);
})();
window.addEventListener('mg:splashdone', () => { if (S.me && !$('#app').hidden) { S.fxKey = ''; render(); } else FX.login(); });

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
  ['events', 'avail', 'shifts', 'shiftImages', 'ideas', 'memos', 'releases', 'fixedShifts', 'offdays', 'memoReplies', 'memoMarks', 'links', 'eventIdeas'].forEach(k => { if (r[k]) S[k] = r[k]; });
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
  setTimeout(() => FX.login(), 50);
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
  const locked = !$('#detail').hidden || !$('#proj').hidden || !$('#admin').hidden;
  document.body.classList.toggle('lock', locked);
  if (window.MGX) MGX.lock(locked || !$('#sheetWrap').hidden);
}

// ---------- メイン画面 ----------
function render() {
  if (!S.me) return;
  renderHeader();
  $$('.tabbar [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  const v = { calendar: viewCalendar, works: viewWorks, tasks: viewTasks, settings: viewSettings, board: viewBoard, mandala: viewMandala }[S.view] || viewCalendar;
  $('#view').innerHTML = v();
  afterViewRender();
}
function renderHeader() {
  if (!S.me) return;
  $('#meChip').innerHTML = `<button class="hd-btn ${S.view === 'board' ? 'on' : ''}" data-act="nav" data-view="board" aria-label="掲示板・メモ">📋<span>掲示板</span>${unreadMemos().length ? `<b class="hd-badge">${unreadMemos().length}</b>` : ''}</button><button class="hd-btn ${S.view === 'mandala' ? 'on' : ''}" data-act="nav" data-view="mandala" aria-label="目標マンダラ">🎯<span>目標</span></button><button class="me" data-act="nav" data-view="settings"><i style="--c:${mem(S.me.id).color}"></i>${esc(S.me.name)}${isAdminMode() ? '<b class="adm">ADMIN</b>' : ''}</button>`;
}
function afterViewRender() {
  // 画面が変わったときだけ入場アニメーション（同じ画面の更新では動かさない）
  const key = [S.view, S.calMode, S.worksMode, S.syncPid].join('|');
  if (key !== S.fxKey) { S.fxKey = key; FX.enter($('#view')); window.MGX ? MGX.toTop(true) : window.scrollTo(0, 0); }
  else if (S.view === 'calendar' && S.fxMonth && S.fxMonth !== S.month) FX.slide($('.cal'), S.month > S.fxMonth ? 1 : -1);
  else if (S.view === 'calendar' && S.fxDay && S.fxDay !== S.day) FX.pop($('.cell.sel'), 0.82);
  else if (S.view === 'calendar' && S.calMode === 'minutes' && S.fxMin && S.fxMin !== S.minMonth) FX.enter($('#view'));
  S.fxMonth = S.month; S.fxDay = S.day; S.fxMin = S.minMonth;
  if (window.MGX) MGX.afterRender($('#view'));
}

// ---------- 空き時間の計算 ----------
const SLOT0 = 16; // 8:00から表示（データは0:00〜24:00の30分×48コマ）
const slotTime = i => i >= 48 ? '24:00' : `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`;
const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const availRow = (mid, date) => (S.avail.find(a => a.memberId === mid && a.date === date) || {}).slots || '0'.repeat(48);
/** その日のシフト。その月に取り込んだシフトがなければ、固定シフト（毎週同じ曜日）を使う */
const shiftsOn = (mid, date) => {
  const month = date.slice(0, 7);
  if (S.shifts.some(x => x.memberId === mid && x.date.slice(0, 7) === month)) {
    return S.shifts.filter(x => x.memberId === mid && x.date === date).sort((a, b) => a.start.localeCompare(b.start));
  }
  const wd = parseYmd(date).getDay();
  return (S.fixedShifts || []).filter(f => f.member === mid && f.days.includes(wd))
    .map(f => ({ memberId: mid, date, start: f.start, end: f.end, note: f.note || '', fixed: true }));
};
function stateArr(mid, date, slots) {
  const base = (slots || availRow(mid, date)).split('').map(c => c === '1' ? 'ok' : c === '2' ? 'ng' : 'u');
  shiftsOn(mid, date).forEach(sh => {
    const a = toMin(sh.start), b = toMin(sh.end);
    for (let i = 0; i < 48; i++) if (i * 30 < b && i * 30 + 30 > a) base[i] = 'shift';
  });
  // 個人の予定は、入力に関係なく「集まれない」
  personalOn(mid, date).forEach(ev => {
    const a = toMin(ev.start), b = toMin(ev.end);
    for (let i = 0; i < 48; i++) if (base[i] !== 'shift' && i * 30 < b && i * 30 + 30 > a) base[i] = 'busy';
  });
  return base;
}
const personalOn = (mid, date) => S.events.filter(e => e.kind === 'personal' && e.createdBy === mid && e.date === date);
const KIND_ICON = { meeting: '🗣 ', personal: '🔒 ' };
/** 会議のときだけ出す欄（DOMごと出し入れするので Auto Animate でなめらかに開閉） */
const kindFields = (kind, agenda, minutes) => kind !== 'meeting' ? '' : `
  <label>何を議論するか（議題）<textarea name="agenda" rows="3" maxlength="3000" placeholder="例：・新曲のリリース日&#10;・MVの方向性">${esc(agenda || '')}</textarea></label>
  <label>議事録<textarea name="minutes" rows="8" maxlength="30000" placeholder="会議のあとに、決まったこと・話したことを書いてください">${esc(minutes || '')}</textarea></label>`;
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
/** その日を含む週の月曜日 */
const weekStart = date => addDays(date, -((parseYmd(date).getDay() + 6) % 7));
const weekDays = date => { const s0 = weekStart(date); return [0, 1, 2, 3, 4, 5, 6].map(k => addDays(s0, k)); };
const mdShort = ds => { const d = parseYmd(ds); return `${d.getMonth() + 1}/${d.getDate()}`; };
const isMyEvent = e => splitIds(e.participants).includes(S.me.id) || e.createdBy === S.me.id;

function viewCalendar() {
  return `
  <div class="segtabs three">${[['month', 'カレンダー'], ['free', '空き時間・共通'], ['minutes', '議事録']].map(([k, l]) =>
    `<button class="${S.calMode === k ? 'on' : ''}" data-act="calMode" data-m="${k}">${l}</button>`).join('')}</div>
  ${S.calMode === 'month' ? '' : offBanner()}
  ${S.calMode === 'free' ? shiftBanner() : ''}
  ${S.calMode === 'free' ? viewFree() : S.calMode === 'minutes' ? viewMinutes() : viewMonth()}`;
}

function myShiftTask() {
  return S.tasks.find(t => t.kind === 'shift' && t.status === 'open' && isMine(t)) || null;
}
// ---------- 次に集まる日（やりたいこと・やることの意見） ----------
const ideasOf = eventId => S.eventIdeas.filter(i => i.eventId === eventId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
function ideasHtml(e) {
  const list = ideasOf(e.id);
  return `<div class="mu-ideas">${list.length ? list.map(i => `<div class="mu-idea" style="--c:${mem(i.author).color}">
      <span class="who" style="--c:${mem(i.author).color}">${esc(mem(i.author).name)}</span><p>${linkify(i.text)}</p>
      ${i.author === S.me.id || isAdminMode() ? `<button class="mu-del" data-act="ideaDel" data-id="${esc(i.id)}" aria-label="削除">×</button>` : ''}
    </div>`).join('') : '<p class="muted small" style="margin:0">まだ意見はありません。この日にやりたいこと・やることを書いておこう！</p>'}</div>
    <form data-form="eventIdea" data-event="${esc(e.id)}" class="mu-form">
      <input name="text" maxlength="300" required placeholder="💡 この日にやりたいこと・やること" autocomplete="off">
      <button class="btn gem sm" type="submit">追加</button>
    </form>`;
}
function meetupPanel() {
  const list = S.events.filter(e => e.kind !== 'personal' && e.date >= today() && splitIds(e.participants).length >= 2)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 2);
  if (!list.length) return `<div class="meetup empty"><b>🗓 次に集まる日</b><span class="muted small">まだ決まっていません</span>
    <button class="btn ghost sm" data-act="form" data-form="event" data-date="${today()}">＋ 予定を入れる</button></div>`;
  return list.map((e, k) => {
    const d = daysLeft(e.date);
    return `<div class="meetup ${k ? 'sub' : ''}">
      <div class="mu-head"><b>${k ? '🗓 その次' : '🗓 次に集まる日'}</b><span class="mu-count">${d === 0 ? '今日！' : d === 1 ? '明日' : 'あと' + d + '日'}</span></div>
      <button class="mu-ev" data-act="event" data-id="${esc(e.id)}">
        <b>${md(e.date)} ${esc(e.start)}〜${esc(e.end)}</b>
        <span>${KIND_ICON[e.kind] || ''}${esc(e.title)}${e.place ? '＠' + esc(e.place) : ''}</span>
        ${whoChips(splitIds(e.participants))}
      </button>
      ${ideasHtml(e)}
    </div>`;
  }).join('');
}

// ---------- 全員休みの日（希望休の周知） ----------
const offOn = date => S.offdays.find(o => o.date === date) || null;
function offBanner() {
  const list = S.offdays.filter(o => o.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const now = parseYmd(today());
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = ymd(next).slice(0, 7);
  const byMonth = {};
  list.forEach(o => { (byMonth[o.date.slice(0, 7)] = byMonth[o.date.slice(0, 7)] || []).push(o); });
  const months = Object.keys(byMonth).sort().slice(0, 3);
  return `<div class="off-banner">
    <div class="off-head"><b>🚩 全員休みの日</b><small>3人とも必ず仕事を休む日です。シフトの希望休に入れてください。</small></div>
    ${months.length ? months.map(mo => `<div class="off-month ${mo === nextMonth ? 'next' : ''}">
      <span class="off-m">${Number(mo.slice(5))}月${mo === nextMonth ? '<em>来月</em>' : mo === today().slice(0, 7) ? '<em>今月</em>' : ''}</span>
      <div class="off-days">${byMonth[mo].map(o => `<button class="off-day" data-act="offOpen" data-id="${esc(o.id)}"><b>${md(o.date)}</b>${o.note ? `<small>${esc(o.note)}</small>` : ''}<i>あと${daysLeft(o.date)}日</i></button>`).join('')}</div>
    </div>`).join('') : '<p class="muted small" style="margin:6px 0 0">まだ決まっていません。</p>'}
    <button class="btn ghost sm off-add" data-act="form" data-form="offday" data-date="${S.day >= today() ? S.day : today()}">＋ 全員休みの日を追加</button>
  </div>`;
}

function shiftBanner() {
  const t = myShiftTask();
  if (!t) return '';
  const month = (subOf(t) || {}).month || '';
  return `<div class="banner ${isOverdue(t) ? 'late' : ''}">
    <div><b>${esc(t.title)}</b><small>${md(t.deadline)}まで・${dueText(t)}</small>${(() => { const offs = S.offdays.filter(o => o.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date)); return offs.length ? `<small class="off-remind">🚩 希望休：${offs.map(o => md(o.date)).join('・')}</small>` : ''; })()}</div>
    <button class="btn gem sm" data-act="form" data-form="shift" data-month="${esc(month)}">提出する</button>
  </div>`;
}

function viewMonth() {
  const [y, m] = S.month.split('-').map(Number);
  const startPad = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 月曜はじまり
  const days = new Date(y, m, 0).getDate();
  const byDay = {};
  S.tasks.forEach(t => { if (!S.calMine || isMine(t)) (byDay[t.deadline] = byDay[t.deadline] || []).push(t); });

  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="cell pad"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const wd = (startPad + d - 1) % 7;
    const chips = dayChips(ds, byDay[ds] || []);
    const shown = chips.slice(0, 4).join('') + (chips.length > 4 ? `<em class="more">+${chips.length - 4}</em>` : '');
    cells += `<button class="cell ${offOn(ds) ? 'offday' : ''} ${ds === today() ? 'today' : ''} ${ds === S.day ? 'sel' : ''} ${wd === 6 ? 'sun' : wd === 5 ? 'sat' : ''}" data-act="day" data-day="${ds}"><span>${d}</span><div class="chips">${shown}</div></button>`;
  }
  const tail = (7 - (startPad + days) % 7) % 7;
  for (let i = 0; i < tail; i++) cells += '<div class="cell pad"></div>';
  const dayList = (byDay[S.day] || []).slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
  const evs = eventsOn(S.day).filter(e => !S.calMine || isMyEvent(e));
  const isThisMonth = S.month === today().slice(0, 7);

  return `
  <div class="cal-head">
    <button class="icon-btn" data-act="month" data-d="-1" aria-label="前の月">‹</button>
    <h2>${y}.${pad(m)}</h2>
    ${isThisMonth ? '' : '<button class="icon-btn today-btn" data-act="today">今日</button>'}
    <button class="icon-btn" data-act="month" data-d="1" aria-label="次の月">›</button>
  </div>
  <div class="legend">${S.members.map(x => `<span><i style="--c:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
  <div class="cal-filters">
    <button class="tg ${S.calMine ? 'on' : ''}" data-act="calMine"><i></i>自分の予定だけ</button>
    <button class="tg ${S.calShift ? 'on' : ''}" data-act="calShift"><i></i>シフトを表示</button>
  </div>
  <div class="legend chip-legend"><span><b class="chip ev" style="--g:#6b5d63">予定</b></span><span><b class="chip sh" style="--c:#6b5d63">シフト</b></span><span><b class="chip tk" style="--c:#6b5d63">タスク</b></span></div>
  <div class="cal">${[1, 2, 3, 4, 5, 6, 0].map(i => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${WD[i]}</div>`).join('')}${cells}</div>
  <div class="home-below">
    ${meetupPanel()}
    ${offBanner()}
    ${shiftBanner()}
  </div>

  <div class="day-head">
    <h3>${md(S.day)}</h3>
    <div class="day-btns">
      <button class="btn gem sm" data-act="form" data-form="event" data-date="${S.day}">＋ 予定</button>
      ${offOn(S.day) ? `<button class="btn ghost sm" data-act="offOpen" data-id="${esc(offOn(S.day).id)}">🚩 全員休みの日</button>` : `<button class="btn ghost sm" data-act="form" data-form="offday" data-date="${S.day}">🚩 全員休みにする</button>`}
      <button class="btn ghost sm" data-act="availEdit" data-date="${S.day}">空き時間を入力（週）</button>
    </div>
  </div>
  <h3 class="sec">予定${S.calMine ? '（自分だけ）' : ''}</h3>
  ${evs.length ? evs.map(eventCard).join('') : '<p class="empty-msg">この日の予定はありません</p>'}
  <h3 class="sec">メンバーの状況</h3>
  <div class="status-list">${S.members.map(mm => memberDay(mm, S.day)).join('')}</div>
  <h3 class="sec">この日が納期のタスク</h3>
  ${dayList.length ? dayList.map(card).join('') : '<p class="empty-msg">この日が納期のタスクはありません</p>'}`;
}

// カレンダーのマスに出すラベル（予定 → シフト → タスクの順）
function dayChips(ds, tasks) {
  const off = offOn(ds);
  const out = (off ? [`<b class="chip off">🚩全員休み</b>`] : []).concat(eventsOn(ds).filter(e => !S.calMine || isMyEvent(e)).map(e =>
    e.kind === 'personal'
      ? `<b class="chip ps" style="--c:${mem(e.createdBy).color}">${esc(e.createdBy === S.me.id ? e.title : '予定あり')}</b>`
      : `<b class="chip ev ${e.kind === 'meeting' ? 'mtg' : ''}" style="${colorVars(splitIds(e.participants))}">${e.kind === 'meeting' ? '🗣' : ''}${esc(e.title)}</b>`));
  const prev = addDays(ds, -1);
  S.members.forEach(mm => {
    if (!S.calShift || (S.calMine && mm.id !== S.me.id)) return;
    shiftsOn(mm.id, ds).forEach(x => {
      // 日をまたぐシフトの2日目（00:00〜）は「明け」と表示
      const ake = x.start === '00:00' && shiftsOn(mm.id, prev).some(p => p.end === '24:00');
      const label = ake ? '明け' : (x.note || x.start);
      // マスが狭いので名前は出さず、メンバー色で誰のシフトかを表す
      out.push(`<b class="chip sh ${ake ? 'ake' : ''}" style="--c:${mm.color}" title="${esc(mm.name)}">${esc(label)}</b>`);
    });
  });
  tasks.slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)).forEach(t => {
    out.push(`<b class="chip tk ${t.status !== 'open' ? 'off' : ''} ${isOverdue(t) ? 'late' : ''}" style="${colorVars(ids(t))}">${t.status === 'done' ? '✓ ' : ''}${esc(t.title)}</b>`);
  });
  return out;
}

function memberDay(mm, date) {
  const arr = stateArr(mm.id, date);
  const ok = rangesOf(arr, v => v === 'ok');
  const ng = rangesOf(arr, v => v === 'ng');
  const sh = shiftsOn(mm.id, date).map(x => `${x.start}〜${x.end}${x.note ? `（${esc(x.note)}）` : ''}`);
  const parts = [];
  if (sh.length) parts.push(`<span class="st-sh">シフト ${sh.join('、')}</span>`);
  const ps = personalOn(mm.id, date).map(x => `${x.start}〜${x.end}${mm.id === S.me.id ? `（${esc(x.title)}）` : ''}`);
  if (ps.length) parts.push(`<span class="st-ps">個人の予定 ${ps.join('、')}</span>`);
  if (ok.length) parts.push(`<span class="st-ok">◯ ${ok.join('、')}</span>`);
  if (ng.length) parts.push(`<span class="st-ng">✕ ${ng.join('、')}</span>`);
  return `<div class="mday"><span class="who" style="--c:${mm.color}">${esc(mm.name)}</span><div>${parts.join('') || '<span class="muted">未入力</span>'}</div></div>`;
}

function eventCard(e) {
  const parts = splitIds(e.participants);
  return `<button class="ev-card" data-act="event" data-id="${esc(e.id)}" style="${colorVars(parts)}">
    <div class="ev-time"><b>${esc(e.start)}</b><span>${esc(e.end)}</span></div>
    <div class="ev-main">
      <div class="ev-title">${KIND_ICON[e.kind] || ''}${esc(e.title)}</div>
      ${e.kind === 'meeting' && e.agenda ? `<div class="ev-place">議題：${esc(e.agenda.split('\n')[0])}</div>` : ''}
      ${e.place ? `<div class="ev-place">📍 ${esc(e.place)}</div>` : ''}
      ${whoChips(parts)}
    </div>
  </button>`;
}

function viewFree() {
  const mode = S.freeMode;
  const week = weekDays(S.day);
  const cols = week.map(d => ({ d, st: S.members.map(m => ({ m, s: stateArr(m.id, d) })) }));
  let grid = `<div class="wk-t"></div>${week.map(d => {
    const wd = parseYmd(d).getDay();
    return `<button class="wk-h ${d === S.day ? 'sel' : ''} ${d === today() ? 'today' : ''} ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}" data-act="day" data-day="${d}"><b>${mdShort(d)}</b><small>${WD[wd]}</small></button>`;
  }).join('')}`;
  for (let i = SLOT0; i < 48; i++) {
    grid += `<div class="wk-t">${i % 2 === 0 ? slotTime(i) : ''}</div>`;
    grid += cols.map(c => {
      const who = c.st.filter(x => x.s[i] === 'ok').length;
      const hit = mode === 3 ? who === c.st.length : who >= 2;
      return `<div class="wk-c ${hit ? 'hit' : ''} ${i % 2 === 0 ? 'hour' : ''}">${c.st.map(x => `<i class="s-${x.s[i]}" style="--c:${x.m.color}"></i>`).join('')}</div>`;
    }).join('');
  }
  const rangeBtn = (r, d) => `<button class="range" data-act="form" data-form="event" data-date="${d}" data-start="${r.from}" data-end="${r.to}" data-who="${r.key}">
      <span class="r-time"><small>${md(d)}</small>${r.from}〜${r.to}</span>
      <span class="r-who">${mode === 3 ? '3人そろう' : whoChips(r.who)}</span>
      <span class="r-go">予定を入れる ›</span></button>`;
  const weekRanges = [];
  week.forEach(d => commonRanges(d, mode).forEach(r => weekRanges.push(Object.assign({ date: d }, r))));
  const soon = [];
  for (let k = 0; k < 14; k++) {
    const d = addDays(today(), k);
    commonRanges(d, mode).filter(r => r.mins >= 60).forEach(r => soon.push(Object.assign({ date: d }, r)));
  }
  return `
  <div class="date-nav">
    <button class="icon-btn" data-act="dayShift" data-d="-7" aria-label="前の週">‹</button>
    <h2>${mdShort(week[0])} 〜 ${mdShort(week[6])}</h2>
    <button class="icon-btn" data-act="dayShift" data-d="7" aria-label="次の週">›</button>
  </div>
  <div class="seg mode-seg">
    <button class="${mode === 3 ? 'on' : ''}" data-act="freeMode" data-m="3">3人そろう時間</button>
    <button class="${mode === 2 ? 'on' : ''}" data-act="freeMode" data-m="2">2人以上の時間</button>
  </div>
  <div class="tl-wrap">
    <div class="legend">${S.members.map(x => `<span><i style="--c:${x.color}"></i>${esc(x.name)}</span>`).join('')}</div>
    <div class="wk">${grid}</div>
    <div class="tl-legend"><span><i class="s-ok"></i>集まれる（メンバー色）</span><span><i class="s-ng"></i>集まれない</span><span><i class="s-shift"></i>シフト</span><span><i class="s-busy"></i>個人の予定</span><span><i class="s-u"></i>未入力</span><span><i class="hit"></i>${mode === 3 ? '3人そろう' : '2人以上'}</span></div>
  </div>
  <button class="btn ghost sm" style="margin-top:10px" data-act="availEdit" data-date="${week[0]}">自分の空き時間を入力（この週）</button>
  <h3 class="sec">この週の共通の時間</h3>
  ${weekRanges.length ? weekRanges.map(r => rangeBtn(r, r.date)).join('') : `<p class="empty-msg">${mode === 3 ? '3人そろう' : '2人以上そろう'}時間はまだありません。<br>「集まれる」を入力した時間だけで計算しています。</p>`}
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
  <div class="segtabs three">${[['making', '制作中'], ['disco', 'ディスコグラフィ'], ['sync', '歌詞同期']].map(([k, l]) =>
    `<button class="${S.worksMode === k ? 'on' : ''}" data-act="worksMode" data-m="${k}">${l}</button>`).join('')}</div>
  ${S.worksMode === 'disco' ? viewDisco() : S.worksMode === 'sync' ? viewSync() : `
  <div class="works-actions">
    <button class="btn ghost sm" data-act="form" data-form="song">＋ 曲を作る</button>
    <button class="btn ghost sm" data-act="form" data-form="album">＋ アルバムを作る</button>
  </div>
  ${albums.length ? `<h3 class="sec">アルバム</h3>${albums.map(albumCard).join('')}` : ''}
  ${singles.length ? `<h3 class="sec">曲（シングル）</h3>${singles.map(songCard).join('')}` : ''}
  ${!albums.length && !singles.length ? '<p class="empty-msg">まだ作品がありません。<br>「曲を作る」から、作曲 → 作詞 → レコーディング… の順番でタスクを作れます。</p>' : ''}`}`;
}

// ---------- ディスコグラフィ ----------
function jacketSrc(r) {
  const c = S.jackets[r.id];
  return r.jacketAt && c && c.v === r.jacketAt ? c.d : '';
}
/** 足りないジャケット画像だけをまとめて読む（端末にも保存して、次からは通信しない） */
let jacketLoading = false;
async function loadJackets() {
  const need = [];
  S.releases.forEach(r => {
    if (!r.jacketAt || jacketSrc(r)) return;
    try { const c = JSON.parse(store.get('mg_jk_' + r.id) || 'null'); if (c && c.v === r.jacketAt) { S.jackets[r.id] = c; return; } } catch (e) {}
    need.push(r.id);
  });
  if (!need.length) { if (S.view === 'works' && S.worksMode === 'disco') render(); return; }
  if (jacketLoading) return;
  jacketLoading = true;
  try {
    const res = await api('getJackets', { ids: need });
    Object.keys(res.jackets || {}).forEach(id => {
      const r = S.releases.find(x => x.id === id); if (!r) return;
      S.jackets[id] = { v: r.jacketAt, d: res.jackets[id] };
      store.set('mg_jk_' + id, JSON.stringify(S.jackets[id]));
    });
  } catch (e) {} finally { jacketLoading = false; }
  if (S.view === 'works' && S.worksMode === 'disco') render();
}
function viewDisco() {
  const list = S.releases.slice().sort((a, b) => String(b.releaseDate || b.createdAt).localeCompare(String(a.releaseDate || a.createdAt)));
  if (list.some(r => r.jacketAt && !jacketSrc(r))) setTimeout(loadJackets, 0);
  return `<div class="disco-hero"><div class="gem3d" data-gem3d></div><div><b>Midnight Garnet<span>💫</span></b><small>DISCOGRAPHY · ${list.length} WORKS</small>${snsBar(false)}</div></div>
  <button class="btn ghost sm" data-act="form" data-form="release" style="margin-bottom:12px">＋ 作品を追加</button>
  ${list.length ? `<div class="disco">${list.map(r => {
    const src = jacketSrc(r);
    return `<button class="rel" data-act="relOpen" data-id="${esc(r.id)}">
      ${src ? `<img class="jacket" src="${src}" alt="" loading="lazy">` : `<div class="jacket none ${r.jacketAt ? 'loading' : ''}"><span>${esc(r.title)}</span></div>`}
      <b>${esc(r.title)}</b>
      <small>${esc(r.type)}${r.releaseDate ? '・' + esc(r.releaseDate.slice(0, 4)) : ''}${r.tunecoreUrl ? '<i class="tc">TuneCore</i>' : ''}</small>
    </button>`;
  }).join('')}</div>` : '<p class="empty-msg">まだ作品がありません。<br>「作品を追加」から、ジャケットとTuneCoreのURLを登録できます。</p>'}`;
}
/** ジャケット画像を小さく圧縮（最大360px・JPEG）。1セルに収まるまで画質を下げる */
async function compressJacket(file) {
  const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を読み込めませんでした')); i.src = url; });
  for (const [size, q] of [[360, 0.6], [320, 0.5], [280, 0.45], [240, 0.4], [200, 0.35]]) {
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', q);
    if (d.length <= 45000) return d;
  }
  throw new Error('画像が大きすぎます。別の画像でお試しください');
}

// ---------- 議事録（会議を月ごとに） ----------
function viewMinutes() {
  const [y, m] = S.minMonth.split('-').map(Number);
  const list = S.events.filter(e => e.kind === 'meeting' && e.date.slice(0, 7) === S.minMonth)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return `
  <div class="cal-head">
    <button class="icon-btn" data-act="minMonth" data-d="-1" aria-label="前の月">‹</button>
    <h2>${y}.${pad(m)}</h2>
    <button class="icon-btn" data-act="minMonth" data-d="1" aria-label="次の月">›</button>
  </div>
  <button class="btn gem sm" data-act="form" data-form="event" data-kind="meeting" data-date="${S.minMonth === today().slice(0, 7) ? today() : S.minMonth + '-01'}" style="margin-bottom:12px">＋ 会議を追加</button>
  ${list.length ? list.map(e => `<div class="mtg" style="${colorVars(splitIds(e.participants))}">
    <div class="mtg-top"><b>🗣 ${esc(e.title)}</b><span class="muted small">${md(e.date)} ${esc(e.start)}〜${esc(e.end)}</span></div>
    ${whoChips(splitIds(e.participants))}
    <div class="mtg-lbl">議題</div>
    <pre class="memo-body">${e.agenda ? esc(e.agenda) : '<span class="muted">未記入</span>'}</pre>
    <div class="mtg-lbl">議事録</div>
    <pre class="memo-body">${e.minutes ? esc(e.minutes) : '<span class="muted">まだ書かれていません</span>'}</pre>
    <div class="memo-btns" style="margin-top:10px">
      <button class="btn ghost sm" data-act="form" data-form="event" data-id="${esc(e.id)}">✎ 議事録を書く・編集</button>
      ${e.minutes ? `<button class="btn outline sm" data-act="minCopy" data-id="${esc(e.id)}">コピー</button>` : ''}
    </div>
  </div>`).join('') : '<p class="empty-msg">この月の会議はありません。<br>予定を追加するときに「🗣 会議」を選ぶと、ここに並びます。</p>'}`;
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
  <div class="panel"><h3>Midnight Garnet の SNS</h3>${snsBar(true)}</div>
  <div class="panel">
    <h3><span class="who" style="--c:${mem(S.me.id).color}">${esc(S.me.name)}</span></h3>
    <p class="muted small">ログイン中です。この端末ではログアウトするまでログイン状態が続きます。</p>
  </div>
  <div class="panel">
    <h3>通知</h3>
    <p class="muted">${push.text}</p>
    ${push.button ? '<button class="btn gem" data-act="push">通知をオンにする</button>' : ''}
    ${push.hint ? `<p class="hint">${push.hint}</p>` : ''}
    <p class="hint" style="opacity:.6">診断：${pushDiag()}</p>
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
  const wasHidden = $('#proj').hidden;
  $('#proj').hidden = false;
  $('#pBody').scrollTop = 0;
  if (wasHidden) requestAnimationFrame(() => FX.overlayIn($('#proj')));
  syncLock();
  renderProj();
  loadPChat(id);
}
function projBack() {
  S.projStack.pop();
  if (!S.projStack.length) { FX.overlayOut($('#proj'), () => { $('#proj').hidden = true; $('#proj').style.cssText = ''; syncLock(); }); render(); return; }
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
      ${pchatBlock(p)}
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
      ${pchatBlock(p)}
    </div>`;
  }
  body.scrollTop = top;
}

// ---------- 曲ごとのチャット（ステップのやりとり・進捗・完了をひとつの流れに） ----------
const NOTE_ICON = { progress: '📈', done: '✅', delay: '⏰', failed: '⚠️', system: '·', admin: '🛡' };
function pchatMsgsHtml(pid) {
  const list = S.pchat[pid];
  if (!list) return '<div class="lt-load" data-lottie="lottie/loader.json"></div>';
  if (!list.length) return '<p class="empty-msg">まだメッセージはありません。<br>この曲のことは、ここでまとめて話そう！</p>';
  return list.map(m => {
    const tag = m.taskTitle && m.taskId !== pid ? `<span class="m-tag">#${esc(m.taskTitle)}</span>` : '';
    if (m.type === 'chat') {
      const a = mem(m.author), mine = m.author === S.me.id;
      return `<div class="m ${mine ? 'mine' : ''}" style="--c:${a.color}">${mine ? '' : `<div class="m-name" style="color:${a.color}">${esc(a.name)}</div>`}<div class="bubble">${linkify(m.text)}</div><time>${tag}${timeLabel(m.createdAt)}</time></div>`;
    }
    // 進捗・完了・遅延などは、チャットの流れの中に小さく薄く差し込む
    const a = mem(m.author);
    const what = { progress: `進捗 ${esc(m.progress)}%`, done: '完了', delay: '遅延の報告', failed: '完了できない報告' }[m.type] || '';
    const text = String(m.text || '').replace(/\s+/g, ' ');
    return `<div class="m-note t-${m.type}" style="--c:${a.color}">${NOTE_ICON[m.type] || '·'} ${m.type === 'system' || m.type === 'admin' ? '' : `<b>${esc(a.name)}</b>`}${m.taskTitle ? `「${esc(m.taskTitle)}」` : ''}${what}${text ? `<span>${esc(text.slice(0, 80))}</span>` : ''}<time>${timeLabel(m.createdAt)}</time></div>`;
  }).join('');
}
function pchatBlock(p) {
  return `<h3 class="sec">💬 ${p.type === 'album' ? 'アルバム' : 'この曲'}のチャット</h3>
    <p class="hint" style="margin:-4px 2px 8px">各ステップでのやりとりと、進捗・完了の報告もここにまとまります。</p>
    <div class="msgs pchat" id="pChat">${pchatMsgsHtml(p.id)}</div>
    <form data-form="projChat" data-project="${esc(p.id)}" class="reply-form composer-lite pchat-form">
      <textarea name="text" rows="1" maxlength="1000" required placeholder="${esc(p.name)} について話す…"></textarea>
      <button class="send" type="submit" aria-label="送信"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
    </form>`;
}
async function loadPChat(pid, toBottom) {
  try {
    const r = await api('getProjectChat', { projectId: pid });
    const before = (S.pchat[pid] || []).length;
    S.pchat[pid] = r.messages || [];
    const box = $('#pChat');
    if (box && S.projStack[S.projStack.length - 1] === pid) {
      const body = $('#pBody');
      const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 140;
      box.innerHTML = pchatMsgsHtml(pid);
      if (toBottom || (nearBottom && S.pchat[pid].length > before)) body.scrollTop = body.scrollHeight;
    }
  } catch (e) { if (!S.pchat[pid]) S.pchat[pid] = []; }
}
setInterval(() => {
  const pid = S.projStack[S.projStack.length - 1];
  const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.pchat-form');
  if (pid && !$('#proj').hidden && document.visibilityState === 'visible' && !typing) loadPChat(pid);
}, 8000);

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
  if ($('#detail').hidden) requestAnimationFrame(() => FX.overlayIn($('#detail')));
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
  FX.overlayOut($('#detail'), () => { $('#detail').hidden = true; $('#detail').style.cssText = ''; syncLock(); });
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
  S.detail.parts = r.lyricParts || null;
  upsertTask(r.task);
  S.chat[r.task.id] = { n: r.messages.filter(m => m.type === 'chat').length };
  // 歌詞を書いている途中は、自動更新で消えないように描き直さない
  const a = document.activeElement;
  if (!toBottom && a && a.closest && a.closest('#lyPanel') && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')) return;
  renderDetail(toBottom);
}

function renderDetail(toBottom) {
  const d = S.detail; if (!d) return;
  const body = $('#dBody');
  const t = d.task;
  if (!t) { $('#dTitle').textContent = '読み込み中…'; body.innerHTML = '<div class="lt-load" data-lottie="lottie/loader.json"></div>'; return; }

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
  } else if (t.status === 'open' && t.kind === 'lyrics') {
    // 歌詞は、全部の区切りが全員OKになると自動で完了する
    acts.push('<button class="btn danger sm wide" data-act="sheet" data-form="issue">遅延・中止の報告</button>');
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
    ${t.kind === 'lyrics' && t.status === 'open' ? lyricPanel(t, d.parts) : ''}
    ${t.kind && t.kind !== 'shift' && t.kind !== 'lyrics' && t.status === 'open' ? `<p class="wait kind-note">完了するときに<b>${t.kind === 'composition' ? '作曲シート（仮タイトル・テイスト・時間とパート）' : '歌詞（作曲シートの時間ごと）'}</b>を提出します</p>` : ''}
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

// ---------- 歌詞：区切りごとの担当・確認 ----------
const LY_ST = { '': ['未入力', 'u'], review: ['確認待ち', 'w'], revise: ['修正のお願い', 'r'], ok: ['全員OK', 'ok'], skip: ['歌詞なし', 's'] };
function lyricPanel(t, parts) {
  if (!parts) return '<div id="lyPanel" class="ly-panel"><div class="lt-load" data-lottie="lottie/loader.json"></div></div>';
  const live = parts.filter(x => x.status !== 'skip');
  const ok = live.filter(x => x.status === 'ok').length;
  const mineTodo = parts.filter(x => (x.writer === S.me.id && (x.status === '' || x.status === 'revise')) || (x.writer !== S.me.id && x.status === 'review' && !splitIds(x.approvals).includes(S.me.id))).length;
  return `<div id="lyPanel" class="ly-panel">
    <div class="ly-top"><b>✍️ 歌詞の担当と確認</b><span>OK ${ok}/${live.length}</span></div>
    <p class="hint" style="margin:0 0 10px">区切りごとに担当を決めて書きます。書いたら、ほかの2人が確認して「OK」を押します。全部の区切りがOKになると、自動で完了します。担当はいつでも誰でも変えられます。${mineTodo ? `<br><b style="color:var(--rose)">あなたの番：${mineTodo}件</b>` : ''}</p>
    ${parts.map(x => {
      const w = mem(x.writer), mine = x.writer === S.me.id, [stLabel, stCls] = LY_ST[x.status] || LY_ST[''];
      const ap = splitIds(x.approvals);
      const reviewers = S.members.filter(m => m.id !== x.writer);
      const canReview = !mine && x.status === 'review' && !ap.includes(S.me.id);
      return `<div class="ly-part st-${stCls}" style="--c:${w.color}">
        <div class="lp-head">
          <span class="lp-sec">${x.time ? `<time>${esc(x.time)}〜</time>` : ''}${esc(x.label || '歌詞')}</span>
          <span class="badge lp-st ${stCls}">${stLabel}</span>
        </div>
        <label class="lp-writer">担当<select data-change="lyWriter" data-idx="${esc(x.idx)}">${S.members.map(m => `<option value="${m.id}" ${m.id === x.writer ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        ${x.status === 'skip' ? '<p class="muted small" style="margin:6px 0">この区切りは歌詞なし（間奏など）</p>'
          : mine ? `<textarea class="lp-text" data-idx="${esc(x.idx)}" rows="4" maxlength="3000" placeholder="この区切りの歌詞">${esc(x.text)}</textarea>`
          : x.text ? `<pre class="lp-view">${esc(x.text)}</pre>` : `<p class="muted small" style="margin:6px 0">${esc(w.name)}さんが書くのを待っています</p>`}
        ${x.status === 'revise' && x.note ? `<p class="lp-note">✎ 修正のお願い：${esc(x.note)}</p>` : ''}
        ${x.status !== 'skip' && x.text ? `<div class="lp-checks">${reviewers.map(m => `<span class="lp-chk ${ap.includes(m.id) ? 'on' : ''}" style="--c:${m.color}">${ap.includes(m.id) ? '✓' : '…'} ${esc(m.name)}</span>`).join('')}</div>` : ''}
        <div class="lp-btns">
          ${mine && x.status !== 'skip' ? `<button class="btn gem sm" data-act="lySave" data-idx="${esc(x.idx)}">${x.status === 'ok' ? '書き直して再確認' : '保存して確認に出す'}</button>` : ''}
          ${canReview ? `<button class="btn outline sm" data-act="lyOk" data-idx="${esc(x.idx)}">✓ OK</button><button class="btn danger sm" data-act="lyRevise" data-idx="${esc(x.idx)}">✎ 修正をお願い</button>` : ''}
          <button class="btn ghost sm lp-skip" data-act="lySkip" data-idx="${esc(x.idx)}" data-skip="${x.status === 'skip' ? '0' : '1'}">${x.status === 'skip' ? '歌詞ありに戻す' : '歌詞なし'}</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
async function lyCall(action, data, btn, msg) {
  await busy(btn, async () => {
    const r = await api(action, Object.assign({ taskId: S.detail.id }, data));
    const wasOpen = S.detail.task && S.detail.task.status === 'open';
    applyDetail(r, false);
    if (msg) toast(msg);
    if (wasOpen && r.task.status === 'done') { toast('🎉 歌詞が完成しました！'); FX.confetti(); if (window.MGX) MGX.checkBurst(); render(); renderProj(); }
  }, '送信中…');
}

function msgHtml(m) {
  const a = mem(m.author);
  const mine = S.me && m.author === S.me.id;
  const time = `<time>${timeLabel(m.createdAt)}</time>`;
  if (m.type === 'system' || m.type === 'admin') {
    return `<div class="m-sys ${m.type}">${linkify(m.text)}${time}</div>`;
  }
  if (m.type === 'chat') {
    return `<div class="m ${mine ? 'mine' : ''}" style="--c:${a.color}">${mine ? '' : `<div class="m-name" style="color:${a.color}">${esc(a.name)}</div>`}<div class="bubble">${linkify(m.text)}</div>${time}</div>`;
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
    const kind = e ? (e.kind || '') : (o.kind || '');
    return `<form data-form="event" data-id="${e ? esc(e.id) : ''}" data-kind="${kind}">${sheetHead(e ? '予定を編集' : '予定を追加')}
      <div class="seg kind-seg">
        <label class="seg-i"><input type="radio" name="kind" value="" ${kind === '' ? 'checked' : ''}><span>📅 予定</span></label>
        <label class="seg-i"><input type="radio" name="kind" value="meeting" ${kind === 'meeting' ? 'checked' : ''}><span>🗣 会議</span></label>
        <label class="seg-i"><input type="radio" name="kind" value="personal" ${kind === 'personal' ? 'checked' : ''}><span>🔒 個人の予定</span></label>
      </div>
      <p class="hint only-personal" style="margin:-4px 0 10px">自分だけの予定です。ほかの2人には「予定あり」とだけ表示され、その時間は自動で「集まれない」になります。通知は送られません。</p>
      <label>やる事（必須）<input name="title" maxlength="60" required value="${esc(e ? e.title : '')}" placeholder="例：スタジオ練習／MV打ち合わせ／月例MTG"></label>
      <label>場所<input name="place" maxlength="80" value="${esc(e ? e.place : '')}" placeholder="例：池袋のスタジオ／オンライン"></label>
      <label>日付<input type="date" name="date" required value="${esc(e ? e.date : o.date || S.day)}"></label>
      <div class="two">
        <label>開始<input type="time" name="start" required step="300" value="${esc(e ? e.start : o.start || '18:00')}"></label>
        <label>終了<input type="time" name="end" required step="300" value="${esc(e ? e.end : (o.end && o.end !== '24:00' ? o.end : o.end ? '23:59' : '21:00'))}"></label>
      </div>
      <div class="field only-group">参加する人${memberSeg('participants', who)}</div>
      <div class="kind-fields">${kindFields(kind, e ? e.agenda : '', e ? e.minutes : '')}</div>
      <label>メモ<textarea name="note" rows="2" maxlength="1000" placeholder="持ち物・やる事の詳細など">${esc(e ? e.note : '')}</textarea></label>
      <button class="btn gem" type="submit">${e ? '保存する' : '予定を入れる'}</button>
    </form>`;
  },
  eventView(_, o = {}) {
    const e = S.events.find(x => x.id === o.id);
    if (!e) return sheetHead('予定が見つかりません');
    const parts = splitIds(e.participants);
    const canDel = (S.me && e.createdBy === S.me.id) || isAdminMode();
    const othersPersonal = e.kind === 'personal' && e.createdBy !== S.me.id;
    if (othersPersonal) return `${sheetHead('予定あり')}
      <div class="ev-detail">
        <div class="evd-row"><span class="lbl">日時</span><b>${md(e.date)} ${esc(e.start)}〜${esc(e.end)}</b></div>
        <div class="evd-row"><span class="lbl">誰の</span>${whoChips([e.createdBy])}</div>
        <p class="hint">個人の予定です。この時間は「集まれない」として扱われます。</p>
      </div>${canDel ? `<button class="btn danger sm" style="margin-top:14px" data-act="confirmDel" data-type="event" data-id="${esc(e.id)}" data-label="予定あり">削除</button>` : ''}`;
    return `${sheetHead((KIND_ICON[e.kind] || '') + esc(e.title))}
      <div class="ev-detail">
        <div class="evd-row"><span class="lbl">日時</span><b>${md(e.date)} ${esc(e.start)}〜${esc(e.end)}</b></div>
        ${e.kind === 'meeting' ? `<div class="evd-row"><span class="lbl">議題</span><span>${e.agenda ? linkify(e.agenda) : '<span class="muted">未記入</span>'}</span></div>
        <div class="evd-row"><span class="lbl">議事録</span><span>${e.minutes ? linkify(e.minutes) : '<span class="muted">まだ書かれていません</span>'}</span></div>` : ''}
        ${e.kind === 'personal' ? '<p class="hint">🔒 個人の予定（ほかの2人には「予定あり」と表示）</p>' : ''}
        ${e.place ? `<div class="evd-row"><span class="lbl">場所</span><span>${esc(e.place)}</span></div>` : ''}
        ${e.kind === 'personal' ? '' : `<div class="evd-row"><span class="lbl">参加</span>${whoChips(parts)}</div>`}
        ${e.note ? `<div class="evd-row"><span class="lbl">メモ</span><span>${linkify(e.note)}</span></div>` : ''}
        ${(() => { const ms = S.memos.filter(m => m.eventId === e.id); return ms.length ? `<div class="evd-row"><span class="lbl">掲示板</span><span class="ev-memos">${ms.map(m => `<button data-act="memoGo" data-id="${esc(m.id)}">📋 ${esc(m.title)}</button>`).join('')}</span></div>` : ''; })()}
        ${e.date >= today() && e.kind !== 'personal' ? `<div class="evd-ideas"><div class="lbl">💡 やりたいこと・やること</div>${ideasHtml(e)}</div>` : ''}
        <div class="evd-row"><span class="lbl">作成</span><span class="muted">${esc(mem(e.createdBy).name)}</span></div>
      </div>
      <div class="two" style="margin-top:14px">
        <button class="btn ghost sm" data-act="form" data-form="event" data-id="${esc(e.id)}">${e.kind === 'meeting' ? '✎ 議事録・編集' : '✎ 編集'}</button>
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
  availWeek(_, o = {}) {
    const days = weekDays(o.date || S.day);
    if (!S.weekEdit || !o.keep) S.weekEdit = { slots: {} };
    S.weekEdit.start = days[0];
    days.forEach(d => { if (!S.weekEdit.slots[d]) S.weekEdit.slots[d] = availRow(S.me.id, d).split(''); });
    const pm = o.pm || '1';
    return `<form data-form="availWeek">${sheetHead('空き時間を入力（1週間）')}
      <p class="hint" style="margin:-6px 0 10px">指でなぞると、まとめて塗れます。日付を押すと、その日を丸ごと塗れます。シフトの時間は自動で「集まれない」になります。</p>
      <div class="date-nav wk-nav">
        <button type="button" class="icon-btn" data-act="weekNav" data-d="-7" aria-label="前の週">‹</button>
        <h2>${mdShort(days[0])} 〜 ${mdShort(days[6])}</h2>
        <button type="button" class="icon-btn" data-act="weekNav" data-d="7" aria-label="次の週">›</button>
      </div>
      <div class="seg paint">
        <label class="seg-i"><input type="radio" name="pm" value="1" ${pm === '1' ? 'checked' : ''}><span class="pm-ok">◯ 集まれる</span></label>
        <label class="seg-i"><input type="radio" name="pm" value="2" ${pm === '2' ? 'checked' : ''}><span class="pm-ng">✕ 集まれない</span></label>
        <label class="seg-i"><input type="radio" name="pm" value="0" ${pm === '0' ? 'checked' : ''}><span>消す</span></label>
      </div>
      <div class="quick">
        <button type="button" data-act="weekQuick" data-v="1" data-a="34" data-b="48">毎日 夕方以降◯</button>
        <button type="button" data-act="weekQuick" data-v="0" data-a="0" data-b="48">この週をクリア</button>
      </div>
      <div class="wgrid" id="wgrid">${weekRows(days)}</div>
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
    const what = { task: 'タスク', project: '曲・アルバム（中のタスクもすべて）', event: '予定', shift: 'シフト', idea: '要望', memo: 'メモ', release: '作品', offday: '全員休みの日', reply: '返信' }[o.type] || '';
    return `${sheetHead('削除しますか？')}
      <p class="hint" style="margin:0 0 14px">「${esc(o.label || '')}」の${what}を削除します。元に戻せません。</p>
      <button class="btn danger" data-act="delYes" data-type="${esc(o.type)}" data-id="${esc(o.id)}">削除する</button>`;
  },
  release(_, o = {}) {
    const x = o.id ? S.releases.find(r => r.id === o.id) : null;
    S.jacketDraft = null;
    const type = x ? x.type : 'Single';
    const cur = x && jacketSrc(x);
    return `<form data-form="release" data-id="${esc(x ? x.id : '')}">${sheetHead(x ? '作品を編集' : '作品を追加')}
      <div class="jk-edit">
        <img id="jkPrev" class="jacket" alt="" ${cur ? `src="${cur}"` : 'hidden'}>
        <label class="btn ghost sm jk-pick">ジャケット画像を選ぶ<input type="file" accept="image/*" data-change="jacketFile" hidden></label>
        ${x && x.jacketAt ? '<label class="check"><input type="checkbox" name="removeJacket" value="1">ジャケットを外す</label>' : ''}
        <p class="hint">容量を節約するため、小さく圧縮して保存します（画質は少し落ちます）。</p>
      </div>
      <label>タイトル（必須）<input name="title" maxlength="100" required value="${esc(x ? x.title : '')}"></label>
      <div class="two">
        <label>種類<select name="type">${['Single', 'EP', 'Album', 'その他'].map(t => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>リリース日<input type="date" name="releaseDate" value="${esc(x ? x.releaseDate : '')}"></label>
      </div>
      <label>TuneCore のURL<input name="tunecoreUrl" inputmode="url" value="${esc(x ? x.tunecoreUrl : '')}" placeholder="https://linkco.re/…"></label>
      <label>ほかのリンク（1行に1つ）<textarea name="links" rows="3" placeholder="https://open.spotify.com/…&#10;https://youtu.be/…">${esc(x ? x.links : '')}</textarea></label>
      <label>メモ<textarea name="note" rows="2" maxlength="2000" placeholder="収録曲・クレジットなど">${esc(x ? x.note : '')}</textarea></label>
      <button class="btn gem" type="submit">${x ? '保存する' : '追加する'}</button>
    </form>`;
  },
  releaseView(_, o = {}) {
    const x = S.releases.find(r => r.id === o.id);
    if (!x) return sheetHead('作品が見つかりません');
    const src = jacketSrc(x);
    const canDel = x.createdBy === S.me.id || isAdminMode();
    const links = String(x.links || '').split('\n').filter(Boolean);
    return `${sheetHead(esc(x.title))}
      <div class="rel-view">
        ${src ? `<img class="jacket big" src="${src}" alt="">` : `<div class="jacket big none"><span>${esc(x.title)}</span></div>`}
        <div class="rel-meta"><span class="badge">${esc(x.type)}</span>${x.releaseDate ? `<span class="muted">${esc(x.releaseDate.replace(/-/g, '.'))} リリース</span>` : ''}</div>
        ${x.tunecoreUrl ? `<a class="btn gem" href="${esc(x.tunecoreUrl)}" target="_blank" rel="noopener">TuneCore で聴く・買う ↗</a>` : ''}
        ${links.length ? `<div class="rel-links">${links.map(l => /^https:\/\//.test(l) ? `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>` : `<span>${esc(l)}</span>`).join('')}</div>` : ''}
        ${x.note ? `<p class="rel-note">${linkify(x.note)}</p>` : ''}
      </div>
      <div class="two" style="margin-top:14px">
        <button class="btn ghost sm" data-act="form" data-form="release" data-id="${esc(x.id)}">✎ 編集</button>
        ${canDel ? `<button class="btn danger sm" data-act="confirmDel" data-type="release" data-id="${esc(x.id)}" data-label="${esc(x.title)}">削除</button>` : '<span></span>'}
      </div>`;
  },
  links() {
    const list = S.links.slice().sort((a, b) => Number(a.order) - Number(b.order));
    return `${sheetHead('SNSリンク')}
      ${list.length ? `<div class="link-list">${list.map(l => `<div class="link-row"><span class="sns-dot" style="--b:${snsOf(l.platform).color}"></span><div><b>${esc(l.label || snsOf(l.platform).name)}</b><small>${esc(l.url)}</small></div>
        <button class="btn danger sm" data-act="linkDel" data-id="${esc(l.id)}">削除</button></div>`).join('')}</div>` : ''}
      <form data-form="link">
        <h3 class="sec">追加する</h3>
        <label>サービス<select name="platform">${Object.keys(SNS).map(k => `<option value="${k}">${SNS[k].name === 'リンク' ? 'その他' : SNS[k].name}</option>`).join('')}</select></label>
        <label>URL<input name="url" inputmode="url" required placeholder="https://www.youtube.com/@…"></label>
        <label>表示名（空ならサービス名）<input name="label" maxlength="30" placeholder="例：MV チャンネル"></label>
        <button class="btn gem" type="submit">追加する</button>
      </form>`;
  },
  offday(_, o = {}) {
    const x = o.id ? S.offdays.find(d => d.id === o.id) : null;
    return `<form data-form="offday">${sheetHead('🚩 全員休みの日を追加')}
      <p class="hint" style="margin:-6px 0 12px">3人とも必ず仕事を休む日です。カレンダーの上に大きく表示され、ほかの2人に通知が届きます。</p>
      <label>日付<input type="date" name="date" required value="${esc(x ? x.date : o.date || today())}"></label>
      <label>理由・やること<input name="note" maxlength="100" value="${esc(x ? x.note : '')}" placeholder="例：ライブ本番／レコーディング／MV撮影"></label>
      <button class="btn gem" type="submit">決定して通知する</button>
    </form>`;
  },
  offView(_, o = {}) {
    const x = S.offdays.find(d => d.id === o.id);
    if (!x) return sheetHead('見つかりません');
    const canDel = x.createdBy === S.me.id || isAdminMode();
    return `${sheetHead('🚩 全員休みの日')}
      <div class="ev-detail">
        <div class="evd-row"><span class="lbl">日付</span><b>${md(x.date)}（あと${daysLeft(x.date)}日）</b></div>
        ${x.note ? `<div class="evd-row"><span class="lbl">理由</span><span>${esc(x.note)}</span></div>` : ''}
        <div class="evd-row"><span class="lbl">登録</span><span class="muted">${esc(mem(x.createdBy).name)}</span></div>
        <p class="hint">3人とも、この日はシフトの希望休に入れてください。</p>
      </div>
      ${canDel ? `<button class="btn danger sm" style="margin-top:14px" data-act="confirmDel" data-type="offday" data-id="${esc(x.id)}" data-label="${esc(md(x.date))}">取り消す</button>` : ''}`;
  },
  memo(_, o = {}) {
    const x = o.id ? S.memos.find(m => m.id === o.id) : null;
    return `<form data-form="memo" data-id="${esc(x ? x.id : '')}">${sheetHead(x ? 'メモを編集' : '新しいメモ')}
      <label>タイトル<input name="title" maxlength="100" required value="${esc(x ? x.title : '')}" placeholder="例：作曲シートのフォーマット"></label>
      <label>関連する予定（会議など）<select name="eventId"><option value="">なし</option>${memoEventOptions(x ? x.eventId : (o.event || ''))}</select></label>
      <label>内容<textarea name="body" rows="12" maxlength="20000" required placeholder="フォーマットや、みんなに共有したいことを書いてください">${esc(x ? x.body : '')}</textarea></label>
      <p class="hint" style="margin-top:-6px">3人全員が見られます。編集・削除できるのは書いた本人だけで、ほかの人はコピーだけできます。</p>
      <button class="btn gem" type="submit">${x ? '保存する' : '追加する'}</button>
    </form>`;
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
  if (window.MGX) { MGX.sheet($('#sheet')); MGX.lock(true); }
  requestAnimationFrame(() => requestAnimationFrame(() => { w.classList.add('open'); FX.sheetIn($('#sheet')); }));
}
function closeSheet() {
  const w = $('#sheetWrap');
  w.classList.remove('open');
  const out = FX.sheetOut($('#sheet'));
  if (window.MGX) setTimeout(syncLock, 260);
  if (out) { out.then(() => { if (!w.classList.contains('open')) { w.hidden = true; $('#sheet').innerHTML = ''; $('#sheet').style.transform = ''; } }); return; }
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
      const kind = v('kind');
      const r = await api('saveEvent', { id: f.dataset.id || '', kind, title: v('title'), place: v('place'), date: v('date'), start: v('start'), end: v('end'),
        participants: fd.getAll('participants'), note: v('note'), agenda: v('agenda'), minutes: v('minutes') });
      applyBoot(r); closeSheet(); S.day = v('date'); S.month = v('date').slice(0, 7); refreshAll();
      toast(f.dataset.id ? '保存しました' : kind === 'personal' ? '個人の予定を入れました 🔒' : kind === 'meeting' ? '会議を入れました 🗣' : '予定を入れました 📅');
      return;
    }
    if (kind === 'release') {
      applyBoot(await api('saveRelease', { id: f.dataset.id || '', title: v('title'), type: v('type'), releaseDate: v('releaseDate'),
        tunecoreUrl: v('tunecoreUrl'), links: v('links'), note: v('note'), jacket: S.jacketDraft || '', removeJacket: fd.get('removeJacket') ? 1 : 0 }));
      const id = f.dataset.id;
      if (id && (S.jacketDraft || fd.get('removeJacket'))) { delete S.jackets[id]; store.del('mg_jk_' + id); }
      S.jacketDraft = null;
      closeSheet(); refreshAll(); loadJackets();
      toast(f.dataset.id ? '保存しました' : '作品を追加しました 💿');
      if (!f.dataset.id) FX.confetti();
      return;
    }
    if (kind === 'availWeek') {
      const days = Object.keys(S.weekEdit.slots)
        .map(d => ({ date: d, slots: S.weekEdit.slots[d].join('') }))
        .filter(x => x.slots !== availRow(S.me.id, x.date));
      if (days.length) applyBoot(await api('saveAvailWeek', { days }));
      S.weekEdit = null;
      closeSheet(); refreshAll(); toast(days.length ? '空き時間を保存しました' : '変更はありませんでした');
      return;
    }
    if (kind === 'lyRevise') {
      closeSheet();
      await lyCall('reviewLyricPart', { idx: f.dataset.idx, ok: false, note: v('note') }, null, '修正をお願いしました ✎');
      return;
    }
    if (kind === 'projChat') {
      const pid = f.dataset.project;
      const r = await api('postProjectChat', { projectId: pid, text: v('text') });
      S.pchat[pid] = r.messages || [];
      f.reset();
      const box = $('#pChat'); if (box) box.innerHTML = pchatMsgsHtml(pid);
      $('#pBody').scrollTop = $('#pBody').scrollHeight;
      return;
    }
    if (kind === 'eventIdea') {
      applyBoot(await api('addEventIdea', { eventId: f.dataset.event, text: v('text') }));
      f.reset(); refreshAll();
      if (!$('#sheetWrap').hidden && $('#sheet .evd-ideas')) openSheet(FORMS.eventView(null, { id: f.dataset.event }));
      toast('やりたいことを追加しました 💡');
      return;
    }
    if (kind === 'link') {
      applyBoot(await api('saveLink', { platform: v('platform'), url: v('url'), label: v('label') }));
      openSheet(FORMS.links()); render(); toast('SNSを追加しました 🔗');
      return;
    }
    if (kind === 'memoReply') {
      applyBoot(await api('replyMemo', { memoId: f.dataset.memo, text: v('text') }));
      refreshAll(); toast('返信しました 💬');
      return;
    }
    if (kind === 'offday') {
      applyBoot(await api('saveOffday', { date: v('date'), note: v('note') }));
      closeSheet(); refreshAll(); toast('全員休みの日を決めました 🚩'); FX.confetti();
      return;
    }
    if (kind === 'memo') {
      applyBoot(await api('saveMemo', { id: f.dataset.id || '', title: v('title'), body: v('body'), eventId: v('eventId') }));
      closeSheet(); refreshAll(); toast(f.dataset.id ? 'メモを保存しました' : 'メモを追加しました 📋');
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
    if (kind === 'complete') { FX.confetti(); if (window.MGX) MGX.checkBurst(); }
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
function weekRows(days) {
  const st = days.map(d => stateArr(S.me.id, d, S.weekEdit.slots[d].join('')));
  let h = `<div class="wt"></div>${days.map(d => {
    const wd = parseYmd(d).getDay();
    return `<button type="button" class="wh ${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}" data-act="weekFillDay" data-date="${d}"><b>${mdShort(d)}</b><small>${WD[wd]}</small></button>`;
  }).join('')}`;
  for (let i = SLOT0; i < 48; i++) {
    h += `<div class="wt">${i % 2 === 0 ? slotTime(i) : ''}</div>`;
    h += days.map((d, k) => {
      const sh = st[k][i] === 'shift' || st[k][i] === 'busy';
      const c = S.weekEdit.slots[d][i];
      const v = sh ? st[k][i] : c === '1' ? 'ok' : c === '2' ? 'ng' : 'u';
      return `<div class="wc s-${v} ${i % 2 === 0 ? 'hour' : ''}" data-date="${d}" data-i="${i}"></div>`;
    }).join('');
  }
  return h;
}
function rerenderWeek(o = {}) {
  const f = $('#sheet form[data-form=availWeek]'); if (!f) return;
  const pm = (f.querySelector('input[name=pm]:checked') || {}).value || '1';
  const scroll = $('#sheet').scrollTop;
  $('#sheet').innerHTML = FORMS.availWeek(null, Object.assign({ date: S.weekEdit.start, keep: true, pm }, o));
  $('#sheet').scrollTop = scroll;
}
function refreshAgrid() {
  const f = $('#sheet form[data-form=avail]'); if (!f) return;
  $('#agrid').innerHTML = availRows(f.dataset.date);
}
let painting = false;
function paintAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const wc = el && el.closest('#wgrid .wc');
  if (wc) {
    const f = $('#sheet form[data-form=availWeek]');
    const pm = (f.querySelector('input[name=pm]:checked') || {}).value || '1';
    const arr = S.weekEdit.slots[wc.dataset.date], i = Number(wc.dataset.i);
    if (wc.classList.contains('s-shift') || wc.classList.contains('s-busy') || arr[i] === pm) return;
    arr[i] = pm;
    wc.className = wc.className.replace(/s-\w+/, 's-' + (pm === '1' ? 'ok' : pm === '2' ? 'ng' : 'u'));
    return;
  }
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
  if (!e.target.closest('#agrid') && !e.target.closest('#wgrid .wc')) return;
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
  const action = { task: 'adminDeleteTask', project: 'adminDeleteProject', event: 'deleteEvent', shift: 'adminDeleteShift', idea: 'adminDeleteIdea', memo: 'deleteMemo', release: 'deleteRelease', offday: 'deleteOffday', reply: 'deleteReply' }[type];
  await busy(btn, async () => {
    applyBoot(await api(action, { id }));
    closeSheet();
    if (type === 'task' && S.detail && S.detail.id === id) closeDetail();
    if (type === 'project') { S.projStack = S.projStack.filter(x => proj(x)); if (!S.projStack.length) { $('#proj').hidden = true; syncLock(); } }
    refreshAll();
    toast('削除しました');
  }, '削除中…');
}

// ---------- 歌詞同期（完成した曲の歌詞にタイミングを打つ） ----------
const syncAudio = new Audio(); // 画面を描き直しても再生が止まらないように、DOMの外に置く
syncAudio.preload = 'auto';
const fmtCs = s => {
  if (s == null || isNaN(s)) return '--:--:--';
  const cs = Math.round(s * 100);
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}:${pad(cs % 100)}`;
};
/** 歌詞のステップで提出された歌詞を、空行を除いて1行ずつにする */
const lyricLinesOf = pid => { const t = lastDone(pid, 'lyrics'); return t ? joinLyrics(subOf(t)).split('\n').map(x => x.trim()).filter(Boolean) : []; };
const syncSongs = () => S.projects.filter(p => p.type === 'song' && isSongComplete(p.id))
  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
/** 提出済みの歌詞と、保存済みのタイミングを合わせる（同じ歌詞の行は時間を引き継ぐ） */
function buildSyncRows(pid) {
  const saved = (S.syncSaved[pid] || []);
  const old = {};
  saved.forEach(r => { if (r.s != null) (old[r.t] = old[r.t] || []).push(r.s); });
  return lyricLinesOf(pid).map(t => { const q = old[t]; return { t, s: q && q.length ? q.shift() : null }; });
}
async function openSync(pid) {
  S.syncPid = pid; S.syncRows = null; S.syncCur = 0; render();
  try {
    const r = await api('getLyricSync', { projectId: pid });
    let lines = []; try { lines = JSON.parse((r.sync && r.sync.lines) || '[]'); } catch (e) {}
    S.syncSaved[pid] = lines;
  } catch (e) { toast(e.message, 'err'); }
  if (S.syncPid !== pid) return;
  S.syncRows = buildSyncRows(pid);
  const first = S.syncRows.findIndex(r => r.s == null);
  S.syncCur = first < 0 ? Math.max(S.syncRows.length - 1, 0) : first;
  render(); FX.enter($('#view'));
}
let syncTimer = null;
function saveSyncSoon() {
  clearTimeout(syncTimer);
  const pid = S.syncPid, rows = S.syncRows.map(r => ({ t: r.t, s: r.s }));
  S.syncSaved[pid] = rows;
  $('#syncState') && ($('#syncState').textContent = '保存待ち…');
  syncTimer = setTimeout(async () => {
    try { await api('saveLyricSync', { projectId: pid, lines: rows }); if ($('#syncState')) $('#syncState').textContent = '保存しました'; }
    catch (e) { if ($('#syncState')) $('#syncState').textContent = '保存できませんでした'; toast(e.message, 'err'); }
  }, 1200);
}
const syncText = () => (S.syncRows || []).map(r => fmtCs(r.s) + r.t).join('\n');
function syncLinesHtml() {
  const rows = S.syncRows || [];
  if (!rows.length) return '<p class="empty-msg">この曲の歌詞がまだ提出されていません。<br>歌詞のステップで歌詞を提出すると、ここに自動で入ります。</p>';
  const t = syncAudio.currentTime;
  let playing = -1;
  rows.forEach((r, i) => { if (r.s != null && r.s <= t + 0.001 && (playing < 0 || r.s >= rows[playing].s)) playing = i; });
  return rows.map((r, i) => `<li class="${i === S.syncCur ? 'cur' : ''} ${r.s != null ? 'has' : ''} ${i === playing && !syncAudio.paused ? 'playing' : ''}" data-i="${i}">
    <button type="button" class="ly-t" data-act="syncSeek" data-i="${i}">${fmtCs(r.s)}</button>
    <span class="ly-txt" data-act="syncCur" data-i="${i}">${esc(r.t)}</span>
    <span class="ly-ops"><button type="button" data-act="syncNudge" data-i="${i}" data-d="-0.1">−.1</button><button type="button" data-act="syncNudge" data-i="${i}" data-d="0.1">+.1</button><button type="button" data-act="syncNudge" data-i="${i}" data-d="x">×</button></span>
  </li>`).join('');
}
function refreshSyncParts(scroll) {
  const ol = $('#syncLines'); if (!ol) return;
  ol.innerHTML = syncLinesHtml();
  const out = $('#syncOut'); if (out) out.value = syncText();
  const rows = S.syncRows || [];
  const pr = $('#syncProg'); if (pr) pr.textContent = rows.length ? `${rows.filter(r => r.s != null).length} / ${rows.length} 行 記録済み` : '';
  if (scroll) { const el = $('#syncLines li.cur'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
function syncTap() {
  const rows = S.syncRows; if (!rows || !rows.length) return;
  rows[S.syncCur].s = Math.round(syncAudio.currentTime * 100) / 100;
  if (S.syncCur < rows.length - 1) S.syncCur++;
  refreshSyncParts(true); saveSyncSoon();
}
function syncUndo() {
  const rows = S.syncRows; if (!rows || !rows.length) return;
  if (rows[S.syncCur].s == null && S.syncCur > 0) S.syncCur--;
  rows[S.syncCur].s = null;
  refreshSyncParts(true); saveSyncSoon();
}
function viewSync() {
  if (!S.syncPid) {
    const list = syncSongs();
    return `<p class="muted small" style="margin:0 2px 12px">ステップがすべて完了した曲が、ここに自動で並びます。提出された歌詞が入っているので、音源を読み込んでタイミングを打つだけです。</p>
    ${list.length ? list.map(p => {
      const n = lyricLinesOf(p.id).length;
      const album = p.parentId ? proj(p.parentId) : null;
      return `<button class="pcard" data-act="syncOpen" data-id="${esc(p.id)}">
        <div class="kind">${album ? '💿 ' + esc(album.name) : 'SONG'}</div>
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta"><span>${n ? `歌詞 ${n}行` : '歌詞がまだありません'}</span><b>同期する ›</b></div>
      </button>`;
    }).join('') : '<p class="empty-msg">完成した曲はまだありません。<br>曲のステップがすべて完了すると、ここにタイトルが入ります。</p>'}`;
  }
  const p = proj(S.syncPid);
  if (!S.syncRows) return `<button class="btn ghost sm" data-act="syncBack">← 曲の一覧</button><div class="lt-load" data-lottie="lottie/loader.json"></div>`;
  return `<button class="btn ghost sm" data-act="syncBack" style="width:auto">← 曲の一覧</button>
  <h3 class="sync-title">${esc(p ? p.name : '')}</h3>
  <div class="sync-bar">
    <label class="btn ghost sm sync-file">${S.syncFile ? '♪ ' + esc(S.syncFile) : '♪ 音源を読み込む（この端末だけ）'}<input type="file" accept="audio/*,video/*" data-change="syncFile" hidden></label>
    <input type="range" id="syncSeek" min="0" max="${syncAudio.duration || 0}" step="0.01" value="${syncAudio.currentTime}" aria-label="再生位置">
    <div class="sync-ctl">
      <button type="button" class="btn ghost sm" data-act="syncPlay">${syncAudio.paused ? '▶' : '❚❚'}</button>
      <button type="button" class="btn ghost sm" data-act="syncJump" data-d="-3">−3秒</button>
      <button type="button" class="btn ghost sm" data-act="syncJump" data-d="3">+3秒</button>
      <select id="syncRate" aria-label="再生速度">${[0.5, 0.75, 1, 1.25].map(v => `<option value="${v}" ${syncAudio.playbackRate === v ? 'selected' : ''}>${v}倍</option>`).join('')}</select>
      <span class="sync-clock" id="syncClock">${fmtCs(syncAudio.currentTime)}</span>
    </div>
    <button type="button" class="btn gem sync-tap" data-act="syncTap">記録（タップ / Space）</button>
  </div>
  <div class="sync-foot"><button type="button" class="btn ghost sm" data-act="syncUndo">1行戻す</button><button type="button" class="btn ghost sm" data-act="syncClear">全部の時間を消す</button><span class="muted small" id="syncProg"></span><span class="muted small" id="syncState"></span></div>
  <ol class="sync-lines" id="syncLines">${syncLinesHtml()}</ol>
  <p class="hint">行を押すとその行から記録 ・ 時間を押すとその位置から再生 ・ ±で0.1秒ずつ調整。タイミングは自動で保存され、3人で共有されます（音源は保存されません）。</p>
  <h3 class="sec">できたテキスト</h3>
  <textarea id="syncOut" class="sync-out" readonly>${esc(syncText())}</textarea>
  <button class="btn gem sm" data-act="syncCopy">テキストをコピー</button>`;
}
(function syncTick() {
  if (S.view === 'works' && S.worksMode === 'sync' && S.syncPid) {
    const c = $('#syncClock'); if (c) c.textContent = fmtCs(syncAudio.currentTime);
    const sk = $('#syncSeek'); if (sk && document.activeElement !== sk) { sk.max = syncAudio.duration || 0; sk.value = syncAudio.currentTime; }
    if (!syncAudio.paused) {
      const rows = S.syncRows || []; let idx = -1; const t = syncAudio.currentTime;
      rows.forEach((r, i) => { if (r.s != null && r.s <= t + 0.001 && (idx < 0 || r.s >= rows[idx].s)) idx = i; });
      $$('#syncLines li').forEach(li => li.classList.toggle('playing', Number(li.dataset.i) === idx));
    }
  }
  requestAnimationFrame(syncTick);
})();
['play', 'pause'].forEach(ev => syncAudio.addEventListener(ev, () => { const b = $('[data-act=syncPlay]'); if (b) b.textContent = syncAudio.paused ? '▶' : '❚❚'; }));

// ---------- 目標マンダラチャート（9×9・3人の目標つき） ----------
const MD_POS = [0, 1, 2, 3, 5, 6, 7, 8];
const MD_ST = ['未着手', '進行中', '達成'];
const MD_HUES = ['#FF7A70', '#FFB052', '#E3CF3A', '#5ACB84', '#4FC3E3', '#7E95FF', '#BF85F2', '#F27AB9'];
const mdDef = key => key === 'meta' ? { name: '', period: '', goal: '' } : key[0] === 't' ? { label: '', color: Number(key.slice(1)) } : { text: '', st: 0 };
const mdGet = key => Object.assign(mdDef(key), S.mandala[key] || {});
const mdTheme = t => mdGet('t' + t), mdItem = (t, j) => mdGet(`i${t}-${j}`), mdSub = (t, j, k) => mdGet(`s${t}-${j}-${k}`);
const mdMem = k => S.members[k] || { id: '', name: `メンバー${k + 1}`, color: '#888' };
const mdHue = t => MD_HUES[mdTheme(t).color] || MD_HUES[0];
const mdPending = {}; let mdTimer = null;
async function loadMandala() {
  try { const r = await api('getMandala'); S.mandala = r.cells || {}; S.mandalaLoaded = true; }
  catch (e) { toast(e.message, 'err'); }
  if (S.view === 'mandala' && !mdTyping()) { const first = !$('#mdBoard'); render(); if (first) FX.enter($('#view')); }
}
const mdTyping = () => { const a = document.activeElement; return !!(a && a.dataset && a.dataset.mdk); };
function mdWrite(key, patch, delay = 800) {
  S.mandala[key] = Object.assign(mdGet(key), patch, { by: S.me.id, at: Date.now() });
  mdPending[key] = S.mandala[key];
  clearTimeout(mdTimer);
  mdTimer = setTimeout(async () => {
    const cells = Object.assign({}, mdPending); Object.keys(cells).forEach(k => delete mdPending[k]);
    try { const r = await api('saveMandala', { cells }); if (!mdTyping() && !Object.keys(mdPending).length) { S.mandala = r.cells || S.mandala; } }
    catch (e) { Object.assign(mdPending, cells); toast('保存できませんでした：' + e.message, 'err'); }
  }, delay);
}
function mdCell(b, c) {
  if (b === 4) {
    if (c === 4) return { kind: 'goal', text: mdGet('meta').goal, ph: '中心の目標' };
    const t = MD_POS.indexOf(c); return { kind: 'theme', t, text: mdTheme(t).label, ph: `テーマ${t + 1}` };
  }
  const t = MD_POS.indexOf(b);
  if (c === 4) return { kind: 'theme', t, text: mdTheme(t).label, ph: `テーマ${t + 1}` };
  const j = MD_POS.indexOf(c), it = mdItem(t, j);
  return { kind: 'item', t, j, text: it.text, st: it.st, ph: '行動' };
}
const mdTrio = (t, j) => [0, 1, 2].map(k => { const s = mdSub(t, j, k); return `<i class="${s.st === 2 ? 'done' : s.text ? 'on' : ''}" style="--mc:${mdMem(k).color}"></i>`; }).join('');
function mdBoardHtml() {
  let h = '';
  for (let b = 0; b < 9; b++) {
    h += `<div class="md-block ${b === S.mdSel ? 'sel' : ''}">`;
    for (let c = 0; c < 9; c++) {
      const i = mdCell(b, c);
      const col = i.t !== undefined ? `--c:${mdHue(i.t)}` : '';
      const on = i.kind === 'item' && b === S.mdSel && i.j === S.mdItem ? ' sel-item' : '';
      h += `<button class="md-cell ${i.kind}${i.text ? '' : ' empty'}${on}" style="${col}" data-act="mdCell" data-b="${b}" data-c="${c}" ${i.kind === 'item' ? `data-st="${i.st}"` : ''}><span class="txt">${esc(i.text || '·')}</span>${i.kind === 'item' ? `<span class="trio">${mdTrio(i.t, i.j)}</span>` : ''}</button>`;
    }
    h += '</div>';
  }
  return h;
}
function mdProgress() {
  let d = 0; for (let t = 0; t < 8; t++) for (let j = 0; j < 8; j++) if (mdItem(t, j).st === 2) d++;
  return d;
}
const mdField = (key, f, ph) => `<textarea data-mdk="${key}" data-mdf="${f}" placeholder="${esc(ph)}" rows="3">${esc(mdGet(key)[f] || '')}</textarea>`;
const mdStBtn = (key, color) => { const s = mdGet(key).st; return `<button type="button" class="md-st" data-act="mdSt" data-key="${key}" data-st="${s}" style="--c:${color}"><i></i>${MD_ST[s]}</button>`; };
const mdBy = key => { const o = S.mandala[key]; return o && o.at ? `<span class="md-by">${o.by ? `<b style="color:${mem(o.by).color}">${esc(mem(o.by).name)}</b> が編集 · ` : ''}${timeLabel(new Date(o.at).toISOString())}</span>` : ''; };
function mdEditorHtml() {
  const b = S.mdSel, isCenter = b === 4, t = isCenter ? null : MD_POS.indexOf(b), th = t !== null ? mdTheme(t) : null;
  let h = `<div class="md-ed-head"><div><div class="kind">${isCenter ? '中心ブロック · 目標とテーマ' : `テーマ ${t + 1} · 具体的な行動`}</div>
    <h3>${esc(isCenter ? (mdGet('meta').goal || '目標を書きましょう') : (th.label || `テーマ${t + 1}`))}</h3></div>
    <div class="md-mini">${Array.from({ length: 9 }, (_, k) => `<button type="button" class="${k === b ? 'on' : ''}" data-act="mdGo" data-b="${k}" aria-label="ブロック${k + 1}"></button>`).join('')}</div></div>`;
  if (th) h += `<div class="md-sw"><span>テーマの色</span>${MD_HUES.map((c, k) => `<button type="button" class="${th.color === k ? 'on' : ''}" style="--c:${c}" data-act="mdColor" data-k="${k}" aria-label="色${k + 1}"></button>`).join('')}</div>`;
  h += '<div class="md-fgrid">';
  for (let c = 0; c < 9; c++) {
    const i = mdCell(b, c);
    const col = i.t !== undefined ? `--c:${mdHue(i.t)}` : '';
    if (i.kind === 'goal') h += `<div class="md-f goal">${mdField('meta', 'goal', '中心の目標')}</div>`;
    else if (i.kind === 'theme') h += `<div class="md-f theme" style="${col}">${mdField('t' + i.t, 'label', i.ph)}${isCenter ? `<button type="button" class="md-st" data-act="mdGo" data-b="${c}">開く →</button>` : ''}</div>`;
    else {
      const k = `i${i.t}-${i.j}`;
      h += `<div class="md-f item ${i.j === S.mdItem ? 'open' : ''}" style="${col}">${mdField(k, 'text', '行動')}<button type="button" class="md-trio" data-act="mdItem" data-j="${i.j}" aria-label="3人の目標を開く">${mdTrio(i.t, i.j)}</button>${mdStBtn(k, mdHue(i.t))}</div>`;
    }
  }
  h += '</div>';
  if (!isCenter && S.mdItem !== null) {
    const j = S.mdItem, it = mdItem(t, j);
    h += `<div class="md-detail"><div class="md-ed-head"><div style="min-width:0"><div class="kind">${esc(th.label || `テーマ${t + 1}`)} › 行動</div><h3>${esc(it.text || '（行動が未入力です）')}</h3>${mdBy(`i${t}-${j}`)}</div><button type="button" class="btn ghost sm" style="width:auto" data-act="mdItem" data-j="${j}">閉じる</button></div>
      <div class="md-cards">${[0, 1, 2].map(k => {
        const m = mdMem(k), key = `s${t}-${j}-${k}`, mine = m.id === S.me.id;
        return `<div class="md-card ${mine ? 'mine' : ''}" style="--mc:${m.color}"><div class="md-mh"><i></i><span>${esc(m.name)}</span>${mine ? '<em>あなた</em>' : ''}</div>${mdField(key, 'text', `${m.name}の具体的な目標`)}${mdStBtn(key, m.color)}${mdBy(key)}</div>`;
      }).join('')}</div></div>`;
  }
  h += `<div class="md-nav"><button type="button" class="btn ghost sm" data-act="mdStep" data-d="-1">← 前</button>${!isCenter ? '<button type="button" class="btn ghost sm" data-act="mdGo" data-b="4">中心へ</button>' : ''}<button type="button" class="btn ghost sm" data-act="mdStep" data-d="1">次 →</button></div>`;
  return h;
}
function viewMandala() {
  if (!S.mandalaLoaded) { setTimeout(loadMandala, 0); return '<h2 class="page-title">目標マンダラ</h2><div class="lt-load" data-lottie="lottie/loader.json"></div>'; }
  const meta = mdGet('meta'), d = mdProgress();
  const recent = Object.entries(S.mandala).filter(([, v]) => v && v.at).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  return `<h2 class="page-title">目標マンダラ</h2>
  <div class="md-head">
    <input class="md-name" data-mdk="meta" data-mdf="name" value="${esc(meta.name)}" placeholder="チャートの名前（例：Midnight Garnet 2027）">
    <label class="md-period">期間<input data-mdk="meta" data-mdf="period" value="${esc(meta.period)}" placeholder="例：2026年10月〜2027年9月"></label>
    <div class="md-prog"><b id="mdNum">${d}</b><small> / 64 達成</small><div class="bar"><i id="mdBar" style="width:${d / 64 * 100}%"></i></div></div>
    <div class="legend">${[0, 1, 2].map(k => `<span><i style="--c:${mdMem(k).color}"></i>${esc(mdMem(k).name)}</span>`).join('')}</div>
  </div>
  <div class="md-board" id="mdBoard">${mdBoardHtml()}</div>
  <p class="hint" style="margin:8px 2px 14px">行動のマスの下の3つの四角が、3人それぞれの目標です（書くと薄く色が付き、達成すると塗りつぶし）。マスを押すと下で編集できます。</p>
  <div class="panel md-editor" id="mdEditor">${mdEditorHtml()}</div>
  <div class="panel"><h3>最近の編集</h3>${recent.length ? `<ul class="md-act">${recent.map(([k, v]) => `<li><span>${v.by ? `<b style="color:${mem(v.by).color}">${esc(mem(v.by).name)}</b> · ` : ''}${esc(mdPlace(k))}</span><time>${timeLabel(new Date(v.at).toISOString())}</time></li>`).join('')}</ul>` : '<p class="muted small">まだ編集の記録はありません</p>'}</div>`;
}
function mdPlace(key) {
  if (key === 'meta') return 'チャートの名前・目標';
  const n = key.slice(1).split('-').map(Number), tl = t => mdTheme(t).label || `テーマ${t + 1}`;
  if (key[0] === 't') return `テーマ「${tl(n[0])}」`;
  if (key[0] === 'i') return `${tl(n[0])} › ${mdItem(n[0], n[1]).text || '行動'}`;
  return `${tl(n[0])} › ${mdItem(n[0], n[1]).text || '行動'} › ${mdMem(n[2]).name}の目標`;
}
function mdRefresh(editor = true) {
  const bd = $('#mdBoard'); if (bd) bd.innerHTML = mdBoardHtml();
  const d = mdProgress(); if ($('#mdNum')) { $('#mdNum').textContent = d; $('#mdBar').style.width = (d / 64 * 100) + '%'; }
  if (editor && $('#mdEditor')) $('#mdEditor').innerHTML = mdEditorHtml();
}
function mdSelect(b, j) {
  S.mdSel = b; S.mdItem = b !== 4 && j !== undefined ? j : null; mdRefresh();
  FX.pop($('.md-block.sel'), 0.9); FX.enter($('#mdEditor'));
  const el = S.mdItem !== null ? $('.md-detail') : $('#mdEditor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.mdk) return;
  mdWrite(el.dataset.mdk, { [el.dataset.mdf]: el.value });
  mdRefresh(false);
});
document.addEventListener('input', e => { if (e.target.id === 'syncSeek') syncAudio.currentTime = Number(e.target.value); });
document.addEventListener('keydown', e => {
  if (!(S.view === 'works' && S.worksMode === 'sync' && S.syncRows)) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['textarea', 'input', 'select'].includes(tag) || !$('#sheetWrap').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); syncTap(); }
  else if (e.key === 'Backspace') { e.preventDefault(); syncUndo(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); S.syncCur = Math.min(S.syncCur + 1, S.syncRows.length - 1); refreshSyncParts(true); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); S.syncCur = Math.max(S.syncCur - 1, 0); refreshSyncParts(true); }
});
setInterval(() => { if (S.view === 'mandala' && document.visibilityState === 'visible' && !mdTyping() && !Object.keys(mdPending).length && S.me) loadMandala(); }, 20000);

// ---------- 通知音（アプリを開いているとき） ----------
let audioCtx = null;
// iPhoneは、一度画面を触ったあとでないと音を出せないので、最初のタップで準備しておく
document.addEventListener('pointerdown', () => {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const b = audioCtx.createBuffer(1, 1, 22050); const s = audioCtx.createBufferSource(); s.buffer = b; s.connect(audioCtx.destination); s.start(0); } catch (e) {}
}, { once: false, passive: true });
/** ガーネットっぽい、きらっとした2音のチャイム */
function chime() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    [[1318.5, 0], [1975.5, 0.11]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.55);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + d); o.stop(t + d + 0.6);
    });
  } catch (e) {}
}

// ---------- SNSリンク ----------
const SNS = {
  youtube: { name: 'YouTube', color: '#FF0033', icon: 'youtube' },
  instagram: { name: 'Instagram', color: 'linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5)', icon: 'instagram' },
  tiktok: { name: 'TikTok', color: '#000000', icon: 'tiktok', ring: true },
  x: { name: 'X', color: '#000000', icon: 'x', ring: true },
  spotify: { name: 'Spotify', color: '#1DB954', icon: 'spotify' },
  applemusic: { name: 'Apple Music', color: 'linear-gradient(180deg,#FA5C74,#FA233B)', icon: 'applemusic' },
  line: { name: 'LINE', color: '#06C755', icon: 'line' },
  other: { name: 'リンク', color: '#3a2a30', icon: '' },
};
const snsOf = p => SNS[p] || SNS.other;
function snsBar(withEdit) {
  const list = S.links.slice().sort((a, b) => Number(a.order) - Number(b.order));
  return `<div class="sns">${list.map(l => {
    const s = snsOf(l.platform);
    return `<a class="sns-btn ${s.ring ? 'ring' : ''}" href="${esc(l.url)}" target="_blank" rel="noopener" style="--b:${s.color}" title="${esc(l.label || s.name)}">
      ${s.icon ? `<img src="https://cdn.simpleicons.org/${s.icon}/ffffff" alt="" loading="lazy">` : '<b>🔗</b>'}<span>${esc(l.label || s.name)}</span></a>`;
  }).join('')}${withEdit ? `<button class="sns-btn edit" data-act="form" data-form="links"><b>✎</b><span>${list.length ? '編集' : 'SNSを登録'}</span></button>` : ''}</div>
  ${!list.length && withEdit ? '<p class="hint">まだ登録されていません。「SNSを登録」から YouTube・Instagram・TikTok などのURLを入れてください。</p>' : ''}`;
}

// ---------- 掲示板・メモ ----------
/** メモに紐づける予定の候補：会議を先に、近い日付から */
function memoEventOptions(sel) {
  const list = S.events.filter(e => e.kind !== 'personal' && e.date >= addDays(today(), -120) && e.date <= addDays(today(), 90))
    .sort((a, b) => (a.kind === 'meeting' ? 0 : 1) - (b.kind === 'meeting' ? 0 : 1) || Math.abs(daysLeft(a.date)) - Math.abs(daysLeft(b.date)));
  if (sel && !list.some(e => e.id === sel)) { const e = S.events.find(x => x.id === sel); if (e) list.unshift(e); }
  return list.map(e => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${e.kind === 'meeting' ? '🗣 ' : '📅 '}${md(e.date)} ${esc(e.title)}</option>`).join('');
}
// 返信・リアクション・既読
const MEMO_REACTIONS = ['👍', '❤️', '😂', '🔥', '👀', '🙏'];
const repliesOf = id => S.memoReplies.filter(r => r.memoId === id).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
/** 最後に動きがあった時刻（本文の編集か、返信） */
const memoActivity = x => repliesOf(x.id).reduce((t, r) => r.createdAt > t ? r.createdAt : t, String(x.updatedAt || x.createdAt));
const readAt = (memoId, mid) => (S.memoMarks.find(k => k.memoId === memoId && k.memberId === mid && k.kind === 'read') || {}).at || '';
/** その人にとっての「新しい動き」（自分の投稿・返信は数えない） */
const activityFor = (x, mid) => repliesOf(x.id).filter(r => r.author !== mid)
  .reduce((t, r) => r.createdAt > t ? r.createdAt : t, x.author !== mid ? String(x.updatedAt || x.createdAt) : '');
const hasRead = (x, mid) => { const act = activityFor(x, mid); return !act || readAt(x.id, mid) >= act; };
const unreadMemos = () => S.me ? S.memos.filter(x => !hasRead(x, S.me.id)) : [];
let readSending = false;
/** 既読：その投稿が画面に0.8秒以上しっかり映ったら付ける */
let readObs = null, readQueue = new Set(), readTimer = null;
function watchMemoReads() {
  if (readObs) readObs.disconnect();
  const unread = new Set(unreadMemos().map(x => x.id));
  const timers = {};
  readObs = new IntersectionObserver(entries => entries.forEach(en => {
    const id = en.target.dataset.memo;
    if (en.isIntersecting && en.intersectionRatio >= 0.5) {
      timers[id] = setTimeout(() => { readQueue.add(id); readObs.unobserve(en.target); clearTimeout(readTimer); readTimer = setTimeout(() => markMemosRead([...readQueue]), 600); }, 800);
    } else clearTimeout(timers[id]);
  }), { threshold: [0, 0.5, 1] });
  $$('.memo[data-memo]').forEach(el => { if (unread.has(el.dataset.memo)) readObs.observe(el); });
}
function markMemosRead(only) {
  const ids = (only || unreadMemos().map(x => x.id)).filter(Boolean);
  readQueue = new Set();
  if (!ids.length || readSending) return;
  readSending = true;
  const at = new Date().toISOString();
  ids.forEach(id => {
    const k = S.memoMarks.find(m => m.memoId === id && m.memberId === S.me.id && m.kind === 'read');
    if (k) k.at = at; else S.memoMarks.push({ memoId: id, memberId: S.me.id, kind: 'read', value: '', at });
  });
  api('readMemos', { ids }).catch(() => {}).finally(() => { readSending = false; });
  renderHeader();
  ids.forEach(id => { const n = $(`#memo-${CSS.escape(id)} .new`); if (n) n.remove(); });
}
/** スタンプを押す：先に画面を更新してアニメーション → 裏で保存 */
function reactMemo(el) {
  const memoId = el.dataset.id, emoji = el.dataset.e;
  const rect = el.getBoundingClientRect();
  const i = S.memoMarks.findIndex(k => k.memoId === memoId && k.memberId === S.me.id && k.kind === 'react' && k.value === emoji);
  const adding = i < 0;
  if (adding) S.memoMarks.push({ memoId, memberId: S.me.id, kind: 'react', value: emoji, at: new Date().toISOString() });
  else S.memoMarks.splice(i, 1);
  render();
  const btn = $(`.react[data-id="${CSS.escape(memoId)}"][data-e="${emoji}"]`);
  reactAnim(btn, rect, emoji, adding);
  api('reactMemo', { memoId, emoji }).then(r => { applyBoot(r); if (S.view === 'board') render(); })
    .catch(e => { toast(e.message, 'err'); load().then(render).catch(() => {}); });
}
/** Motion（Framer Motion のJavaScript版）でスタンプのアニメーション */
function reactAnim(btn, rect, emoji, adding) {
  const M = window.Motion;
  if (!M || !M.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (btn) {
    if (adding) {
      M.animate(btn, { scale: [1.7, 1], rotate: [-14, 0] }, { type: M.spring, stiffness: 420, damping: 9 });
      const b = btn.querySelector('b'); if (b) M.animate(b, { y: [-8, 0], opacity: [0, 1] }, { type: M.spring, stiffness: 500, damping: 14 });
    } else {
      M.animate(btn, { scale: [0.8, 1] }, { type: M.spring, stiffness: 500, damping: 15 });
    }
  }
  if (!adding) return;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const add = (cls, text) => { const d = document.createElement('span'); d.className = cls; if (text) d.textContent = text; d.style.left = cx + 'px'; d.style.top = cy + 'px'; document.body.appendChild(d); return d; };
  // 波紋
  const ring = add('rx-ring');
  M.animate(ring, { scale: [0.3, 2.6], opacity: [0.9, 0] }, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }).then(() => ring.remove());
  // 飛び散るスタンプ
  for (let k = 0; k < 7; k++) {
    const p = add('rx-p', emoji);
    const ang = (-90 + (k - 3) * 26 + (Math.random() * 16 - 8)) * Math.PI / 180;
    const dist = 70 + Math.random() * 50;
    M.animate(p, {
      x: [0, Math.cos(ang) * dist], y: [0, Math.sin(ang) * dist - 20],
      scale: [0.3, 1.25, 0.7], rotate: [0, Math.random() * 80 - 40], opacity: [1, 1, 0],
    }, { duration: 0.85 + Math.random() * 0.25, ease: [0.15, 0.85, 0.3, 1] }).then(() => p.remove());
  }
  // きらめき（ガーネット色の粒）
  for (let k = 0; k < 10; k++) {
    const s = add('rx-s');
    const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 45;
    M.animate(s, { x: [0, Math.cos(ang) * dist], y: [0, Math.sin(ang) * dist], scale: [1, 0], opacity: [1, 0] },
      { duration: 0.55 + Math.random() * 0.3, ease: 'easeOut' }).then(() => s.remove());
  }
}
function viewBoard() {
  const unread = unreadMemos().map(x => x.id);
  setTimeout(watchMemoReads, 50);
  const list = S.memos.slice().sort((a, b) => memoActivity(b).localeCompare(memoActivity(a)));
  return `<h2 class="page-title">掲示板・メモ</h2>
  <p class="muted small" style="margin:-4px 2px 12px">フォーマットや共有したいことを貼っておく場所です。全員が見られて、「コピー」ボタンで中身をコピーできます。編集・削除は書いた本人だけです。</p>
  <button class="btn gem" data-act="form" data-form="memo">＋ 新しいメモ</button>
  <div class="memos">${list.length ? list.map(x => {
    const mine = x.author === S.me.id || isAdminMode();
    const reps = repliesOf(x.id);
    const reacts = MEMO_REACTIONS.map(e => ({ e, who: S.memoMarks.filter(k => k.memoId === x.id && k.kind === 'react' && k.value === e).map(k => k.memberId) }));
    const readers = S.members.filter(m => m.id !== x.author && hasRead(x, m.id));
    const ev = x.eventId ? S.events.find(e => e.id === x.eventId) : null;
    return `<div class="memo" id="memo-${esc(x.id)}" data-memo="${esc(x.id)}" style="--c:${mem(x.author).color}">
      ${ev ? `<button class="memo-ev" data-act="event" data-id="${esc(ev.id)}">${ev.kind === 'meeting' ? '🗣' : '📅'} ${md(ev.date)} ${esc(ev.start)}〜　<b>${esc(ev.title)}</b><i>${ev.kind === 'meeting' ? '議題・議事録を見る ›' : '予定を見る ›'}</i></button>` : x.eventId ? '<span class="memo-ev gone">関連する予定（表示期間外）</span>' : ''}
      <div class="memo-top"><b class="memo-title">${unread.includes(x.id) ? '<em class="new">NEW</em>' : ''}${esc(x.title)}</b><span class="who" style="--c:${mem(x.author).color}">${esc(mem(x.author).name)}</span></div>
      <pre class="memo-body">${esc(x.body)}</pre>
      <div class="reacts">${reacts.map(r => `<button class="react ${r.who.includes(S.me.id) ? 'on' : ''} ${r.who.length ? 'has' : ''}" data-act="memoReact" data-id="${esc(x.id)}" data-e="${r.e}" title="${esc(r.who.map(id => mem(id).name).join('・'))}">${r.e}${r.who.length ? `<b>${r.who.length}</b>` : ''}</button>`).join('')}</div>
      ${reacts.some(r => r.who.length) ? `<div class="react-who">${reacts.filter(r => r.who.length).map(r => `<span>${r.e} ${r.who.map(id => `<i style="color:${mem(id).color}">${esc(mem(id).name)}</i>`).join('・')}</span>`).join('')}</div>` : ''}
      <div class="read-by">${readers.length ? `既読 ${readers.map(m => `<i style="color:${m.color}">${esc(m.name)}</i>`).join('・')}` : '<span>まだ誰も見ていません</span>'}</div>
      <div class="memo-foot">
        <span class="muted small">${timeLabel(x.updatedAt || x.createdAt)}${x.updatedAt && x.updatedAt !== x.createdAt ? '（編集）' : ''}</span>
        <span class="memo-btns">
          ${mine ? `<button class="btn ghost sm" data-act="form" data-form="memo" data-id="${esc(x.id)}">✎ 編集</button><button class="btn danger sm" data-act="confirmDel" data-type="memo" data-id="${esc(x.id)}" data-label="${esc(x.title)}">削除</button>` : ''}
          <button class="btn outline sm" data-act="memoCopy" data-id="${esc(x.id)}">コピー</button>
        </span>
      </div>
      <div class="replies chat">
        ${reps.length ? `<div class="r-head">💬 返信 ${reps.length}件</div>` : ''}
        ${reps.map(r => { const mine = r.author === S.me.id; return `<div class="m ${mine ? 'mine' : ''}" style="--c:${mem(r.author).color}">
          ${mine ? '' : `<div class="m-name" style="color:${mem(r.author).color}">${esc(mem(r.author).name)}</div>`}
          <div class="bubble">${linkify(r.text)}</div>
          <time>${timeLabel(r.createdAt)}${mine || isAdminMode() ? ` · <button class="reply-del" data-act="confirmDel" data-type="reply" data-id="${esc(r.id)}" data-label="返信">削除</button>` : ''}</time>
        </div>`; }).join('')}
        <form data-form="memoReply" data-memo="${esc(x.id)}" class="reply-form composer-lite">
          <textarea name="text" rows="1" maxlength="3000" required placeholder="返信する…"></textarea>
          <button class="send" type="submit" aria-label="送信"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
        </form>
      </div>
    </div>`;
  }).join('') : '<p class="empty-msg">まだメモはありません</p>'}</div>`;
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
    ${list.length ? `<div class="ideas">${list.map(i => `<div class="idea" style="--c:${mem(i.author).color}">
      <div class="idea-top"><span class="ist i-${i.status}">${IDEA_LABEL[i.status] || i.status}</span><span class="small idea-who">${esc(mem(i.author).name)}</span><span class="muted small">・${timeLabel(i.createdAt)}</span></div>
      <p class="idea-text">${linkify(i.text)}</p></div>`).join('')}</div>` : ''}
    <button class="btn ghost sm" style="margin-top:12px" data-act="aiPrompt">AIに改修を頼むプロンプトをコピー</button>
  </div>`;
}

function aiPrompt() {
  const todo = S.ideas.filter(i => i.status !== 'done');
  return `あなたは、3人組の音楽ユニット「Midnight Garnet💫」が使っている進捗管理Webアプリの改修担当です。下の要望を反映してください。

## アプリの構成
- フロント：GitHub Pages の静的サイト（index.html / style.css / app.js / config.js / manifest.json / OneSignalSDKWorker.js / icons/）。フレームワークなしの素のJavaScript
- サーバー：Google Apps Script（Code.gs）＋ Googleスプレッドシート。フロントから fetch で JSON を POST（Content-Type は text/plain）
- データのシート：tasks / projects / messages / events / avail / shifts / shiftImages / ideas / memos / releases / jackets / lyricsync / mandala / offdays / memoReplies / memoMarks / links / eventIdeas / sessions
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
  $('#admin').hidden = false; syncLock(); renderAdmin(); FX.overlayIn($('#admin'));
}
function closeAdmin() {
  FX.overlayOut($('#admin'), () => { $('#admin').hidden = true; $('#admin').style.cssText = ''; syncLock(); }); render();
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
      (list.length ? list.map(i => `<div class="arow"><div class="arow-main"><b style="color:${mem(i.author).color}">${linkify(i.text)}</b><small><span style="color:${mem(i.author).color};font-weight:700">${esc(mem(i.author).name)}</span>・${timeLabel(i.createdAt)}</small></div>
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
      S.osErr = '初期化中';
      const ready = OneSignal.init({
        appId: CFG.ONESIGNAL_APP_ID,
        serviceWorkerPath: base.replace(/^\//, '') + 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: base },
      });
      // iPhoneで init が終わらないことがあるため、10秒待っても終わらなければ先へ進む
      const timedOut = await Promise.race([ready.then(() => false), new Promise(r => setTimeout(() => r(true), 10000))]);
      S.os = OneSignal; S.osErr = timedOut ? '初期化が10秒で終わらず' : '';
      linkPush();
      OneSignal.Notifications.addEventListener('permissionChange', () => { if (S.view === 'settings') render(); });
      OneSignal.User.PushSubscription.addEventListener('change', () => { if (S.view === 'settings') render(); });
      // アプリを開いている間に通知が来たら、音を鳴らして最新の内容に更新
      OneSignal.Notifications.addEventListener('foregroundWillDisplay', ev => {
        chime();
        const n = ev && ev.notification;
        if (n) toast((n.title ? n.title + '：' : '') + (n.body || ''));
        load().then(() => { render(); renderProj(); }).catch(() => {});
      });
    } catch (e) { console.warn('OneSignal', e); S.osErr = String((e && e.message) || e); if (S.view === 'settings') render(); }
  });
  S.osErr = 'SDK読込中';
  s.onload = () => { if (S.osErr === 'SDK読込中') S.osErr = '初期化中'; };
  s.onerror = () => { S.osErr = 'SDKの読み込みに失敗'; };
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
function pushDiag() {
  const ps = S.os && S.os.User && S.os.User.PushSubscription;
  return [
    isStandalone() ? 'アプリ' : 'ブラウザ',
    'permission=' + ('Notification' in window ? Notification.permission : 'なし'),
    'SDK=' + (S.os ? 'OK' : '未読込') + (S.osErr ? '（' + S.osErr + '）' : ''),
    'optedIn=' + (ps ? ps.optedIn : '-'),
    'token=' + (ps && ps.token ? 'あり' : 'なし'),
    'SW=' + ('serviceWorker' in navigator ? 'OK' : 'なし'),
  ].join(' / ');
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
    case 'availEdit': S.weekEdit = null; openSheet(FORMS.availWeek(null, { date: el.dataset.date })); break;
    case 'weekNav': rerenderWeek({ date: addDays(S.weekEdit.start, Number(el.dataset.d)) }); break;
    case 'weekQuick': {
      const v = el.dataset.v, a = Number(el.dataset.a), b = Number(el.dataset.b);
      weekDays(S.weekEdit.start).forEach(d => { for (let i = a; i < b; i++) S.weekEdit.slots[d][i] = v; });
      rerenderWeek(); break;
    }
    case 'weekFillDay': {
      const f = $('#sheet form[data-form=availWeek]');
      const pm = (f.querySelector('input[name=pm]:checked') || {}).value || '1';
      for (let i = SLOT0; i < 48; i++) S.weekEdit.slots[el.dataset.date][i] = pm;
      rerenderWeek(); break;
    }
    case 'calMine': S.calMine = !S.calMine; store.set('mg_calMine', S.calMine ? '1' : '0'); render(); break;
    case 'calShift': S.calShift = !S.calShift; store.set('mg_calShift', S.calShift ? '1' : '0'); render(); break;
    case 'memoReact': reactMemo(el); break;
    case 'lySave': { const ta = $(`#lyPanel .lp-text[data-idx="${el.dataset.idx}"]`); lyCall('saveLyricPart', { idx: el.dataset.idx, text: ta ? ta.value : '' }, el, '確認に出しました 👀'); break; }
    case 'lyOk': lyCall('reviewLyricPart', { idx: el.dataset.idx, ok: true }, el, 'OKしました ✓'); break;
    case 'lyRevise': openSheet(`<form data-form="lyRevise" data-idx="${esc(el.dataset.idx)}">${sheetHead('修正のお願い')}<label>どこをどう直してほしいか<textarea name="note" rows="3" maxlength="500" required placeholder="例：2行目の言葉をもっと明るく"></textarea></label><button class="btn danger" type="submit">担当にお願いする</button></form>`); break;
    case 'lySkip': lyCall('skipLyricPart', { idx: el.dataset.idx, skip: el.dataset.skip === '1' }, el); break;
    case 'ideaDel': {
      const evId = (S.eventIdeas.find(i => i.id === el.dataset.id) || {}).eventId;
      busy(el, async () => {
        applyBoot(await api('deleteEventIdea', { id: el.dataset.id })); refreshAll();
        if (evId && !$('#sheetWrap').hidden && $('#sheet .evd-ideas')) openSheet(FORMS.eventView(null, { id: evId }));
      }, '');
      break;
    }
    case 'memoGo': {
      closeSheet(); S.view = 'board'; render();
      setTimeout(() => { const m = $('#memo-' + CSS.escape(el.dataset.id)); if (m) { m.scrollIntoView({ behavior: 'smooth', block: 'start' }); FX.pop(m, 0.94); } }, 300);
      break;
    }
    case 'linkDel': busy(el, async () => { applyBoot(await api('deleteLink', { id: el.dataset.id })); openSheet(FORMS.links()); render(); toast('削除しました'); }, '削除中…'); break;
    case 'offOpen': openSheet(FORMS.offView(null, { id: el.dataset.id })); break;
    case 'worksMode': S.worksMode = el.dataset.m; render(); break;
    case 'syncOpen': openSync(el.dataset.id); break;
    case 'syncBack': S.syncPid = null; S.syncRows = null; syncAudio.pause(); render(); break;
    case 'syncTap': syncTap(); break;
    case 'syncUndo': syncUndo(); break;
    case 'syncPlay': if (!syncAudio.src) { toast('先に音源を読み込んでください', 'err'); break; } syncAudio.paused ? syncAudio.play().catch(() => {}) : syncAudio.pause(); break;
    case 'syncJump': syncAudio.currentTime = Math.max(0, syncAudio.currentTime + Number(el.dataset.d)); break;
    case 'syncCur': S.syncCur = Number(el.dataset.i); refreshSyncParts(false); break;
    case 'syncSeek': { const r = S.syncRows[Number(el.dataset.i)]; S.syncCur = Number(el.dataset.i); if (r.s != null && syncAudio.src) { syncAudio.currentTime = r.s; syncAudio.play().catch(() => {}); } refreshSyncParts(false); break; }
    case 'syncNudge': {
      const i = Number(el.dataset.i), r = S.syncRows[i], d = el.dataset.d;
      if (d === 'x') r.s = null; else if (r.s != null) r.s = Math.max(0, Math.round((r.s + Number(d)) * 100) / 100);
      S.syncCur = i; refreshSyncParts(false); saveSyncSoon(); break;
    }
    case 'syncClear':
      if (el.dataset.armed) { S.syncRows.forEach(r => { r.s = null; }); S.syncCur = 0; refreshSyncParts(true); saveSyncSoon(); delete el.dataset.armed; el.textContent = '全部の時間を消す'; }
      else { el.dataset.armed = '1'; el.textContent = 'もう一度押すと消えます'; setTimeout(() => { delete el.dataset.armed; el.textContent = '全部の時間を消す'; }, 3000); }
      break;
    case 'syncCopy': copyText(syncText(), 'テキストをコピーしました'); break;
    case 'mdCell': { const b = Number(el.dataset.b), c = Number(el.dataset.c); if (b !== 4 && c !== 4) mdSelect(b, MD_POS.indexOf(c)); else mdSelect(b); break; }
    case 'mdGo': mdSelect(Number(el.dataset.b)); break;
    case 'mdStep': mdSelect((S.mdSel + Number(el.dataset.d) + 9) % 9); break;
    case 'mdItem': { const j = Number(el.dataset.j); mdSelect(S.mdSel, S.mdItem === j ? undefined : j); break; }
    case 'mdColor': mdWrite('t' + MD_POS.indexOf(S.mdSel), { color: Number(el.dataset.k) }, 0); mdRefresh(); break;
    case 'mdSt': { const k = el.dataset.key, s2 = (mdGet(k).st + 1) % 3; mdWrite(k, { st: s2 }, 0); mdRefresh(); if (s2 === 2) { toast('達成！ 💫'); FX.confetti(); } break; }
    case 'relOpen': openSheet(FORMS.releaseView(null, { id: el.dataset.id })); break;
    case 'minMonth': { const d = parseYmd(S.minMonth + '-01'); d.setMonth(d.getMonth() + Number(el.dataset.d)); S.minMonth = ymd(d).slice(0, 7); render(); break; }
    case 'minCopy': { const x = S.events.find(e => e.id === el.dataset.id); if (x) copyText(`${x.title}（${md(x.date)}）\n\n■議題\n${x.agenda || ''}\n\n■議事録\n${x.minutes}`, '議事録をコピーしました'); break; }
    case 'memoCopy': { const x = S.memos.find(m => m.id === el.dataset.id); if (x) copyText(x.body, '「' + x.title + '」をコピーしました'); break; }
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
  if (e.target.matches('[data-change=lyWriter]')) {
    lyCall('setLyricWriter', { idx: e.target.dataset.idx, writer: e.target.value }, null, '担当を変更しました');
  }
  if (e.target.matches('[data-change=syncFile]')) {
    const file = e.target.files[0]; if (!file) return;
    if (syncAudio.src) URL.revokeObjectURL(syncAudio.src);
    syncAudio.src = URL.createObjectURL(file); S.syncFile = file.name; render();
  }
  if (e.target.id === 'syncRate') syncAudio.playbackRate = Number(e.target.value);
  if (e.target.matches('form[data-form=event] input[name=kind]')) {
    const f = e.target.closest('form');
    f.dataset.kind = e.target.value;
    const box = f.querySelector('.kind-fields');
    if (box) { const a = box.querySelector('[name=agenda]'), m = box.querySelector('[name=minutes]'); box.innerHTML = kindFields(e.target.value, a ? a.value : '', m ? m.value : ''); }
  }
  if (e.target.matches('[data-change=jacketFile]')) {
    const file = e.target.files[0]; if (!file) return;
    busy(null, async () => {
      S.jacketDraft = await compressJacket(file);
      const img = $('#jkPrev'); if (img) { img.src = S.jacketDraft; img.hidden = false; }
      toast(`圧縮しました（約${Math.round(S.jacketDraft.length * 0.75 / 1024)}KB）`);
    });
  }
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
  if (f.dataset.form === 'event' && f.dataset.kind !== 'personal' && !f.querySelector('input[name=participants]:checked')) {
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
  const releases = [
    { id: 'r1', title: 'Midnight Garnet', type: 'Single', releaseDate: '2026-04-01', tunecoreUrl: 'https://linkco.re/', links: '', note: 'デビューシングル', jacketAt: '', createdBy: 'kenbo', createdAt: now(), updatedAt: now() },
  ];
  const jackets = {};
  const offdays = [];
  const memoReplies = [], memoMarks = [], links = [], eventIdeas = [];
  const memos = [
    { id: 'mm1', author: 'kenbo', title: '作曲シートのフォーマット', body: '仮タイトル：\nテイスト：\nBPM：\nデモURL：\n\n00:00 イントロ\n00:15 Aメロ\n00:45 サビ', createdAt: now(), updatedAt: now() },
  ];
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
      events: cp(events), avail: cp(avail), shifts: cp(shifts), shiftImages: shiftImages.map(x => ({ id: x.id, memberId: x.memberId, month: x.month, mime: x.mime, createdAt: x.createdAt })), ideas: cp(ideas), memos: cp(memos), releases: cp(releases), offdays: cp(offdays), memoReplies: cp(memoReplies), memoMarks: cp(memoMarks), links: cp(links), eventIdeas: cp(eventIdeas) };
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
      const kind = ['meeting', 'personal'].includes(r.kind) ? r.kind : '';
      const o = { title, date: date(r.date), start, end, place: String(r.place || '').trim(), note: String(r.note || '').trim(),
        participants: kind === 'personal' ? m.id : norm(r.participants), kind, agenda: kind === 'meeting' ? String(r.agenda || '') : '', minutes: kind === 'meeting' ? String(r.minutes || '') : '', updatedAt: now() };
      if (r.id) Object.assign(events.find(e => e.id === r.id), o);
      else events.push(Object.assign({ id: 'e' + (++seq), createdBy: m.id, createdAt: now() }, o));
      return boot(m);
    },
    deleteEvent(r, m) {
      const i = events.findIndex(e => e.id === r.id); if (i < 0) throw '予定が見つかりません';
      if (events[i].createdBy !== m.id && !m.isAdmin) throw '予定を作った人か管理者だけが削除できます';
      events.splice(i, 1); return boot(m);
    },
    saveAvailWeek(r, m) {
      (r.days || []).forEach(d => {
        if (!/^[012]{48}$/.test(d.slots)) throw '時間の形式が正しくありません';
        const row = avail.find(a => a.memberId === m.id && a.date === d.date);
        if (row) row.slots = d.slots; else avail.push({ memberId: m.id, date: d.date, slots: d.slots });
      });
      return boot(m);
    },
    saveRelease(r, m) {
      const title = String(r.title || '').trim(); if (!title) throw 'タイトルを入力してください';
      const o = { title, type: r.type || 'Single', releaseDate: r.releaseDate || '', tunecoreUrl: r.tunecoreUrl || '', links: r.links || '', note: r.note || '', updatedAt: now() };
      let x = r.id ? releases.find(y => y.id === r.id) : null;
      if (x) Object.assign(x, o); else { x = Object.assign({ id: 'r' + (++seq), createdBy: m.id, createdAt: now(), jacketAt: '' }, o); releases.push(x); }
      if (r.jacket) { jackets[x.id] = r.jacket; x.jacketAt = now(); } else if (r.removeJacket) { delete jackets[x.id]; x.jacketAt = ''; }
      return boot(m);
    },
    deleteRelease(r, m) { const i = releases.findIndex(y => y.id === r.id); if (i >= 0) releases.splice(i, 1); return boot(m); },
    getJackets(r) { const out = {}; (r.ids || []).forEach(id => { if (jackets[id]) out[id] = jackets[id]; }); return { ok: true, jackets: out }; },
    replyMemo(r, m) { memoReplies.push({ id: 'rp' + (++seq), memoId: r.memoId, author: m.id, text: String(r.text || ''), createdAt: now() }); return boot(m); },
    deleteReply(r, m) { const i = memoReplies.findIndex(x => x.id === r.id); if (i >= 0) memoReplies.splice(i, 1); return boot(m); },
    reactMemo(r, m) {
      const i = memoMarks.findIndex(x => x.memoId === r.memoId && x.memberId === m.id && x.kind === 'react' && x.value === r.emoji);
      if (i >= 0) memoMarks.splice(i, 1); else memoMarks.push({ memoId: r.memoId, memberId: m.id, kind: 'react', value: r.emoji, at: now() });
      return boot(m);
    },
    readMemos(r, m) { (r.ids || []).forEach(id => { const k = memoMarks.find(x => x.memoId === id && x.memberId === m.id && x.kind === 'read'); if (k) k.at = now(); else memoMarks.push({ memoId: id, memberId: m.id, kind: 'read', value: '', at: now() }); }); return { ok: true }; },
    getProjectChat(r) { return { ok: true, messages: msgs.filter(x => x.taskId === r.projectId || tasks.some(t => t.id === x.taskId && t.projectId === r.projectId)).map(x => Object.assign({}, x, { taskTitle: (tasks.find(t => t.id === x.taskId) || {}).title || '' })) }; },
    postProjectChat(r, m) { msgs.push({ id: 'm' + (++seq), taskId: r.projectId, author: m.id, type: 'chat', text: r.text, progress: '', createdAt: now() }); return H.getProjectChat(r); },
    addEventIdea(r, m) { eventIdeas.push({ id: 'ei' + (++seq), eventId: r.eventId, author: m.id, text: r.text, createdAt: now() }); return boot(m); },
    deleteEventIdea(r, m) { const i = eventIdeas.findIndex(x => x.id === r.id); if (i >= 0) eventIdeas.splice(i, 1); return boot(m); },
    saveLink(r, m) { links.push({ id: 'l' + (++seq), platform: r.platform, url: r.url, label: r.label || '', order: String(links.length + 1) }); return boot(m); },
    deleteLink(r, m) { const i = links.findIndex(x => x.id === r.id); if (i >= 0) links.splice(i, 1); return boot(m); },
    saveOffday(r, m) { const x = offdays.find(o => o.date === r.date); if (x) x.note = r.note || ''; else offdays.push({ id: 'o' + (++seq), date: date(r.date), note: r.note || '', createdBy: m.id, createdAt: now() }); return boot(m); },
    deleteOffday(r, m) { const i = offdays.findIndex(o => o.id === r.id); if (i >= 0) offdays.splice(i, 1); return boot(m); },
    saveMemo(r, m) {
      const title = String(r.title || '').trim(), body = String(r.body || '');
      if (!title) throw 'タイトルを入力してください'; if (!body.trim()) throw '内容を入力してください';
      if (r.id) { const x = memos.find(y => y.id === r.id); if (x.author !== m.id && !m.isAdmin) throw '編集できるのは書いた本人だけです'; Object.assign(x, { title, body, updatedAt: now() }); }
      else memos.push({ id: 'mm' + (++seq), author: m.id, title, body, createdAt: now(), updatedAt: now() });
      return boot(m);
    },
    deleteMemo(r, m) {
      const i = memos.findIndex(y => y.id === r.id);
      if (i >= 0) { if (memos[i].author !== m.id && !m.isAdmin) throw '削除できるのは書いた本人だけです'; memos.splice(i, 1); }
      return boot(m);
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
