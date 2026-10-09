/* ===== Midnight Garnet 💫 アニメーション拡張 =====
 * それぞれの役割（同じ要素を取り合わないように分担）
 *  - Motion（app.js の FX）：画面の入場・ボタンの手応え・シート・スタンプ・紙吹雪・起動ロゴ
 *  - GSAP（+ ScrollTrigger / SplitText）：見出しの文字アニメ・数字のカウントアップ・スクロールで現れる演出
 *  - Auto Animate：シートやマンダラ編集欄の中身が入れ替わるときに、なめらかに変形
 *  - Lottie：読み込み中のガーネット・完了チェック
 *  - Three.js：3Dで回るガーネット（ログイン画面・ディスコグラフィ）
 *  - Locomotive Scroll（中身は Lenis）：なめらかスクロール・画面内に入ったことの検知
 * どれかが読み込めなくても、アプリはそのまま動きます。
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const CDN = 'https://cdn.jsdelivr.net/npm/';

const G = window.gsap;
if (G && window.ScrollTrigger) G.registerPlugin(window.ScrollTrigger);
if (G && window.SplitText) G.registerPlugin(window.SplitText);

// ---------- Locomotive Scroll（Lenis） ----------
let loco = null;
async function initScroll() {
  if (reduce) return;
  try {
    const { default: LocomotiveScroll } = await import(CDN + 'locomotive-scroll@5.0.1/+esm');
    loco = new LocomotiveScroll({
      lenisOptions: { lerp: 0.11, smoothWheel: true, syncTouch: false, prevent: node => !!node.closest('[data-lenis-prevent],#sheetWrap,.overlay,textarea') },
    });
    // ScrollTrigger に Lenis のスクロールを伝える
    if (loco.lenisInstance && window.ScrollTrigger) loco.lenisInstance.on('scroll', () => window.ScrollTrigger.update());
    afterRender($('#view'));
  } catch (e) { console.warn('Locomotive', e); }
}
function markScroll(root) {
  // 画面内に入ったら is-inview が付く（CSSで見出しの下線などを伸ばす）
  $$('.sec,.panel,.page-title,.mtg,.memo', root).forEach(el => el.setAttribute('data-scroll', ''));
  $$('.page-title', root).forEach(el => el.setAttribute('data-scroll-speed', '0.08'));
}

// ---------- GSAP ----------
function splitTitles(root) {
  if (!G || !window.SplitText || reduce) return;
  $$('.page-title,.cal-head h2,.date-nav h2,.sync-title', root).forEach(el => {
    if (el.dataset.split) return; el.dataset.split = '1';
    try {
      const sp = new window.SplitText(el, { type: 'chars', charsClass: 'gs-ch' });
      G.from(sp.chars, { yPercent: 110, rotateX: -80, opacity: 0, duration: 0.7, ease: 'back.out(1.8)', stagger: 0.025, delay: 0.05 });
    } catch (e) {}
  });
}
function countUps(root) {
  if (!G || reduce) return;
  $$('.pmeta b,#mdNum,.md-prog b,[data-countup]', root).forEach(el => {
    const m = el.textContent.match(/^(\d+)(.*)$/); if (!m || el.dataset.counted) return;
    el.dataset.counted = '1';
    const end = Number(m[1]), suffix = m[2], o = { v: 0 };
    G.to(o, { v: end, duration: 1.1, ease: 'power3.out', delay: 0.2, onUpdate: () => { el.textContent = Math.round(o.v) + suffix; } });
  });
}
function scrollReveals(root) {
  if (!G || !window.ScrollTrigger || reduce) return;
  window.ScrollTrigger.getAll().forEach(t => { if (!document.body.contains(t.trigger)) t.kill(); });
  // ジャケット：画面に入ると3Dでくるっと表になる
  $$('.rel .jacket', root).forEach(el => {
    G.fromTo(el, { rotateY: -75, opacity: 0, transformPerspective: 700 },
      { rotateY: 0, opacity: 1, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });
  // 画面の下のほうのカード：スクロールで近づくと浮き上がる（最初の画面分は Motion が担当）
  const cards = $$('.card,.memo,.mtg,.pcard,.ev-card', root).filter(el => el.getBoundingClientRect().top > window.innerHeight);
  cards.forEach(el => {
    G.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 95%', once: true } });
  });
  window.ScrollTrigger.refresh();
}

// ---------- Auto Animate ----------
let autoAnimate = null;
async function initAutoAnimate() {
  if (reduce) return;
  try {
    autoAnimate = (await import(CDN + '@formkit/auto-animate@0.10.0/+esm')).default;
    ['#sheet'].forEach(s => { const el = $(s); if (el) autoAnimate(el, { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
  } catch (e) { console.warn('AutoAnimate', e); }
}
function autoIn(root) {
  if (!autoAnimate) return;
  $$('#mdEditor,.kind-fields,.replies,.reacts', root).forEach(el => {
    if (el.dataset.aa) return; el.dataset.aa = '1';
    autoAnimate(el, { duration: 240 });
  });
}

// ---------- Lottie ----------
function lotties(root) {
  if (!window.lottie) return;
  $$('[data-lottie]', root).forEach(el => {
    if (el.dataset.lottieOn) return; el.dataset.lottieOn = '1';
    window.lottie.loadAnimation({ container: el, renderer: 'svg', loop: el.dataset.loop !== '0', autoplay: true, path: el.dataset.lottie });
  });
}
/** 完了したときに、真ん中に大きくチェックを出す */
function checkBurst() {
  if (!window.lottie || reduce) return;
  const box = document.createElement('div');
  box.className = 'lt-check';
  document.body.appendChild(box);
  const a = window.lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: true, path: 'lottie/check.json' });
  a.addEventListener('complete', () => {
    if (G) G.to(box, { opacity: 0, scale: 0.8, duration: 0.3, delay: 0.25, onComplete: () => { a.destroy(); box.remove(); } });
    else { a.destroy(); box.remove(); }
  });
}

// ---------- Three.js：3Dのガーネット ----------
let THREE = null;
async function gems(root) {
  const hosts = $$('[data-gem3d]', root).filter(h => !h.dataset.gemOn);
  if (!hosts.length || reduce) return;
  try { THREE = THREE || await import(CDN + 'three@0.186.1/build/three.module.min.js'); } catch (e) { console.warn('three', e); return; }
  hosts.forEach(host => { host.dataset.gemOn = '1'; makeGem(host); });
}
function makeGem(host) {
  const w = host.clientWidth || 160, h = host.clientHeight || 160;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, w / h, 0.1, 50);
  cam.position.set(0, 0.4, 5.2);
  // ブリリアントカット風：上が平らで下がとがった多面体
  const geo = new THREE.CylinderGeometry(0.95, 1.25, 0.45, 10, 1).toNonIndexed();
  const pav = new THREE.ConeGeometry(1.25, 1.35, 10, 1).toNonIndexed();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x9b111e, emissive: 0x2a0008, metalness: 0.15, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true, transparent: true, opacity: 0.95 });
  const gem = new THREE.Group();
  const top = new THREE.Mesh(geo, mat); top.position.y = 0.225;
  const bottom = new THREE.Mesh(pav, mat); bottom.rotation.x = Math.PI; bottom.position.y = -0.675;
  gem.add(top, bottom);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.95, 1.25, 0.45, 10, 1)), new THREE.LineBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.35 }));
  edges.position.y = 0.225; gem.add(edges);
  gem.rotation.x = 0.35;
  scene.add(gem);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const l1 = new THREE.PointLight(0xff4d6d, 30, 20); l1.position.set(2.5, 2, 3); scene.add(l1);
  const l2 = new THREE.PointLight(0xffd977, 18, 20); l2.position.set(-3, -1, 2); scene.add(l2);
  const l3 = new THREE.DirectionalLight(0xffffff, 1.4); l3.position.set(0, 4, 2); scene.add(l3);
  let t0 = performance.now();
  (function loop(now) {
    if (!document.body.contains(host)) { renderer.dispose(); return; } // 画面が変わったら止める
    const t = (now - t0) / 1000;
    gem.rotation.y = t * 0.6;
    gem.position.y = Math.sin(t * 1.4) * 0.08;
    l1.position.x = Math.sin(t * 0.8) * 3;
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })(t0);
  if (G) G.from(gem.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 1.2, ease: 'elastic.out(1,0.5)' });
}

// ---------- app.js から呼ばれる入口 ----------
function afterRender(root) {
  if (!root) return;
  markScroll(root);
  if (loco) { try { loco.removeScrollElements(root); loco.addScrollElements(root); } catch (e) {} }
  splitTitles(root);
  countUps(root);
  scrollReveals(root);
  autoIn(root);
  lotties(root);
  gems(root);
}
// あとから追加された要素（詳細画面・シートなど）にも Lottie と 3D を付ける
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches?.('[data-lottie],[data-gem3d]') || n.querySelector?.('[data-lottie],[data-gem3d]')) { lotties(n.parentNode || n); gems(n.parentNode || n); }
  }
}).observe(document.body, { childList: true, subtree: true });

window.MGX = {
  afterRender,
  /** 画面切り替え：Lenis でなめらかに上へ */
  toTop(immediate) { if (loco) loco.scrollTo(0, { immediate: !!immediate, duration: 0.6 }); else window.scrollTo(0, 0); },
  /** シートや詳細を開いている間は、背景のスクロールを止める */
  lock(on) { if (!loco) return; on ? loco.stop() : loco.start(); },
  checkBurst,
  /** シートの中身が変わったとき（Auto Animate・Lottie） */
  sheet(root) { autoIn(root); lotties(root); splitTitles(root); },
};
initAutoAnimate();
initScroll();
afterRender(document.body);
window.dispatchEvent(new Event('mgx:ready'));
