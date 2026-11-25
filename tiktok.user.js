// ==UserScript==
// @name         TikTok
// @namespace    joesatow-tiktok
// @version      2.2
// @description  Removes TikTok's "Log in" and "Open the app" pop-ups and its "Open app" / "Watch on TikTok" banners, makes videos fill the screen, starts videos paused (your first tap plays with sound), and keeps the page clickable and scrollable.
// @match        https://www.tiktok.com/*
// @match        https://m.tiktok.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok.user.js
// ==/UserScript==

// What it does:
// - Removes "Log in" pop-ups and keeps the page clickable and scrollable.
// - Removes the "TikTok / Open app" banner at the top and the "Enjoy more
//   content in the app / Watch on TikTok" banner at the bottom.
// - Videos open paused. Your first tap starts the one on screen, with sound
//   (browsers don't allow sound before a tap). After that, videos play as
//   normal. Set START_PAUSED to false to turn this off.
// - Removes "use the app" pop-ups (e.g. "Open TikTok" / "Not now").
// - Videos fill the whole screen, like the app, instead of stopping short
//   where the bottom banner used to be. Set FULL_SCREEN to false to stop.
//
// Something not right? Add #tnf-debug to the end of the page address and
// reload: a box shows the boxes around the video and their sizes.

(function () {
  'use strict';

  // ---- Settings ----
  const START_PAUSED = true; // videos wait paused until your first tap, which starts one with sound
  const SOUND_ON = true;     // that first tap turns the sound on
  const FULL_SCREEN = true;  // videos fill the screen down to the bottom

  // Text that marks a login prompt (any capitalization)
  const LOGIN_TEXT = [
    'log in to tiktok',
    'log in or sign up',
    'log in to follow',
    'log in to continue',
    'sign up for tiktok',
    'log in to see more',
    // "Use the app" pop-ups
    'open tiktok',
    'open the app',
    'open app',
    'get the app',
    'get tiktok',
    'download tiktok',
    'download the app',
    'in the tiktok app',
    'in the app',
    'tiktok app',
    'continue in app',
    'switch to the app',
  ];
  // Buttons that dismiss it without logging in
  const DISMISS_TEXT = ['continue as guest', 'not now', 'maybe later', 'stay in browser', 'continue in browser',
    'continue on web', 'watch in browser', 'use browser', 'stay on web', 'cancel'];
  // Wording of "use the app" pop-ups that aren't marked as dialogs
  const APP_PROMPT_TEXT = ['open tiktok', 'open the app', 'get the app', 'get tiktok', 'download tiktok',
    'download the app', 'in the tiktok app', 'in the app', 'tiktok app', 'continue in app', 'switch to the app',
    'not now', 'stay in browser', 'continue in browser'];

  // Anything that looks like a pop-up window
  const DIALOGS = '[role="dialog"], [aria-modal="true"], [class*="ModalContainer"], [class*="DivModal"], [class*="TUXModal"]';
  // The dimmed backdrop TikTok puts behind a pop-up
  const BACKDROPS = '[class*="ModalMask"], [class*="ModalOverlay"], [class*="TUXModal-overlay"], [class*="ModalBackdrop"]';

  // How long a pop-up stays hidden while the script waits to see whether it
  // turns into a login prompt (TikTok draws the box first, the text after)
  const SETTLE_MS = 450;

  // ---- Styles ----
  const style = document.createElement('style');
  style.textContent = `
    /* Known login pop-ups: never shown */
    #loginContainer,
    [data-e2e="login-modal"],
    [data-e2e="modal-login"],
    [id^="login-modal"],
    [data-tnf-hidden] { display: none !important; }

    /* Every other pop-up, and its dimmed backdrop, starts invisible. It's
       only shown once it has had time to fill in and clearly isn't a login
       prompt. This is what stops the login box flashing on screen. */
    :is(${DIALOGS}, ${BACKDROPS}):not([data-tnf-ok]) { visibility: hidden !important; }

    /* "Open app" / "Watch on TikTok" banners (found by their wording below;
       these are TikTok's usual names for them, to catch them before they draw) */
    [class*="OpenAppBanner"], [class*="DivOpenApp"], [class*="AppDownloadBanner"],
    [class*="DownloadBanner"], [class*="BottomAppBanner"], [class*="SmartBanner"],
    [data-tnf-banner] { display: none !important; }

    /* TikTok freezes the page while its pop-up is open; undo that */
    html.tnf-unlock, html.tnf-unlock body {
      overflow: auto !important;
      position: static !important;
      pointer-events: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function text(el) {
    return (el.innerText || el.textContent || '').trim().toLowerCase();
  }

  function isLoginPrompt(el) {
    const t = (el.textContent || '').toLowerCase();
    return LOGIN_TEXT.some((s) => t.includes(s));
  }

  function hide(el) {
    if (el && el !== document.body && el !== document.documentElement) {
      el.setAttribute('data-tnf-hidden', '');
    }
  }

  // The full-screen layer that holds a dialog (so the backdrop goes too)
  function overlayFor(dialog) {
    let el = dialog;
    while (el.parentElement && el.parentElement !== document.body) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) break;
      // Stop before anything that holds the video itself
      if (el.parentElement.querySelector('video')) break;
      el = el.parentElement;
    }
    return el;
  }

  // See-through layers left covering the page: full-screen, pinned in place,
  // with no video, pictures or real text in them. These swallow clicks.
  function clearInvisibleBlockers() {
    for (const el of document.body.querySelectorAll('div')) {
      if (el.hasAttribute('data-tnf-hidden')) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.pointerEvents === 'none' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) continue;
      if (el.querySelector('video, img, canvas, iframe, input, textarea')) continue;
      if ((el.textContent || '').trim().length > 40) continue;
      hide(el);
    }
  }

  // TikTok switches off clicking ("pointer-events: none") on the page's main
  // containers while its pop-up is open, and leaves it off after the pop-up is
  // removed. Clicks then fall through to the page background. Switch it back
  // on for the containers around the video and the main layout.
  function restoreClicking() {
    const starts = [
      ...document.querySelectorAll('video'),
      document.getElementById('app'),
      document.getElementById('main-content-video_detail'),
      document.querySelector('main'),
    ].filter(Boolean);

    const fix = (el) => {
      if (el.closest('[data-tnf-hidden]')) return;
      if (getComputedStyle(el).pointerEvents === 'none') {
        el.style.setProperty('pointer-events', 'auto', 'important');
      }
    };

    // Each container from the video up to the page
    for (const start of starts) {
      for (let el = start; el && el !== document.documentElement; el = el.parentElement) fix(el);
    }
    // The page's top few layers of layout (covers the side panels too)
    document.querySelectorAll('body > *, #app > *, #app > * > *, #app > * > * > *').forEach((el) => {
      if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') fix(el);
    });
  }

  // Leftover blockers are only looked for in the few seconds after a pop-up
  // is removed (checking the whole page constantly would slow TikTok down)
  let lastRemoval = 0;
  let lastSweep = 0;
  let lastClickFix = 0;
  const firstSeen = new WeakMap();

  function clean() {
    if (!document.body) return;

    const now = Date.now();
    let releasedOne = false;

    for (const d of document.querySelectorAll(DIALOGS)) {
      if (d.closest('[data-tnf-hidden]')) continue;

      if (!isLoginPrompt(d)) {
        if (d.hasAttribute('data-tnf-ok')) continue;
        // Not a login prompt yet. Keep it hidden until it has had time to
        // fill in, then show it (if login text turns up later, the next
        // check still catches it).
        if (!firstSeen.has(d)) {
          firstSeen.set(d, now);
          setTimeout(clean, SETTLE_MS + 20);
        }
        const hasContent = (d.textContent || '').trim().length > 0 || d.querySelector('img, svg, input, button');
        if (hasContent && now - firstSeen.get(d) >= SETTLE_MS) {
          d.setAttribute('data-tnf-ok', '');
          releasedOne = true;
        } else if (!hasContent) {
          setTimeout(clean, 200); // still empty: look again shortly
        }
        continue;
      }
      d.removeAttribute('data-tnf-ok');

      // Prefer TikTok's own way out, so the page knows it's closed
      const dismiss = [...d.querySelectorAll('button, [role="button"], a, div[tabindex]')]
        .find((b) => DISMISS_TEXT.includes(text(b)));
      if (dismiss) {
        dismiss.click();
      } else {
        const close = d.querySelector(
          '[data-e2e="modal-close-inner-button"], [data-e2e="modal-close-button"], [aria-label="Close" i]'
        );
        if (close) close.click();
      }

      hide(overlayFor(d));
      lastRemoval = Date.now();
    }

    // Banners like "Log in to see more"
    document.querySelectorAll('[class*="LoginBanner"], [class*="BottomLogin"], [data-e2e*="login-banner"]')
      .forEach(hide);

    // A normal pop-up was just shown: show its dimmed backdrop too.
    // (Backdrops of login pop-ups stay invisible, and invisible things
    // don't block clicks.)
    if (releasedOne) {
      document.querySelectorAll(BACKDROPS).forEach((b) => {
        if (!b.closest('[data-tnf-hidden]')) b.setAttribute('data-tnf-ok', '');
      });
    }

    if (now - lastRemoval < 3000 && now - lastSweep > 150) {
      lastSweep = now;
      // While its pop-up is open, TikTok marks the rest of the page as
      // off-limits ("inert"), which blocks clicks. Undo that.
      document.querySelectorAll('[inert]').forEach((el) => {
        if (!el.closest('[data-tnf-hidden]')) el.removeAttribute('inert');
      });
      clearInvisibleBlockers();
    }

    // Once a login pop-up has been removed on this page, keep clicking switched
    // on (TikTok can switch it off again later, e.g. when you scroll)
    if (lastRemoval && now - lastClickFix > 300) {
      lastClickFix = now;
      restoreClicking();
    }

    document.documentElement.classList.add('tnf-unlock');
  }

  // ---- "Open app" banners ----
  // Each banner is found by a phrase in it, then the biggest box around that
  // phrase is hidden as long as the box holds nothing but the banner's own
  // wording (never the video, captions or the search bar).
  const BANNERS = [
    { find: ['open app', 'global video community'], allowed: ['tiktok', 'global video community', 'open app'] },
    { find: ['enjoy more content in the app', 'watch on tiktok'], allowed: ['enjoy more content in the app', 'watch on tiktok', 'tiktok'] },
  ];

  function leftover(el, allowed) {
    let t = (el.textContent || '').toLowerCase();
    for (const a of allowed) t = t.split(a).join('');
    return t.replace(/[\s ​·•|]+/g, '').length;
  }

  function bannerBox(start, allowed) {
    let box = null;
    for (let el = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.querySelector('video, input, textarea')) break;
      if (leftover(el, allowed) > 0) break;
      const r = el.getBoundingClientRect();
      if (r.height > innerHeight * 0.4) break;
      box = el;
    }
    return box;
  }

  function hideBanners() {
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found = [];
    const appPromptNodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (t.length < 6 || t.length > 200) continue;
      const lt = t.trim().toLowerCase();
      for (const b of BANNERS) if (b.find.includes(lt)) found.push([n.parentElement, b]);
      if (APP_PROMPT_TEXT.some((p) => lt.includes(p))) appPromptNodes.push(n);
    }
    for (const [el, b] of found) {
      if (!el || el.closest('[data-tnf-banner], [data-tnf-hidden]')) continue;
      const box = bannerBox(el, b.allowed);
      if (box) box.setAttribute('data-tnf-banner', '');
    }

    // "Use the app" pop-ups that aren't marked as dialogs: the floating box
    // (fixed in place, no video in it) around the wording
    for (const n of appPromptNodes) {
      const el = n.parentElement;
      if (!el || el.closest('[data-tnf-banner], [data-tnf-hidden]')) continue;
      let box = null;
      for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        if (a.querySelector('video')) break;
        const pos = getComputedStyle(a).position;
        if (pos === 'fixed') { box = a; break; }
      }
      if (!box) continue;
      // Take its dimmed backdrop too when the box sits inside one
      const up = box.parentElement;
      if (up && up !== document.body && !up.querySelector('video') && getComputedStyle(up).position === 'fixed') box = up;
      const dismiss = [...box.querySelectorAll('button, [role="button"], a, div[tabindex]')]
        .find((b) => DISMISS_TEXT.includes(text(b)));
      if (dismiss) { try { dismiss.click(); } catch (err) {} }
      box.setAttribute('data-tnf-banner', '');
      lastRemoval = Date.now();
    }
  }

  let bannerQueued = false;
  function queueBanners() {
    if (bannerQueued) return;
    bannerQueued = true;
    requestAnimationFrame(() => { bannerQueued = false; hideBanners(); fillScreen(); });
  }

  // ---- Videos start paused ----
  // Until your first tap, any video that starts playing is paused again.
  // Your first tap goes through to TikTok as normal; just before TikTok sees
  // it, sound is turned on (through TikTok's own "Unmute" button, so its
  // icon matches); just after, if the video still isn't playing, it's
  // started. So that one tap = playing, with sound.
  let tapped = false;
  const held = new WeakSet();

  function pick() {
    const vw = innerWidth, vh = innerHeight;
    let best = null, bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w < 80 || h < 80) continue;
      if (w * h > bestScore) { bestScore = w * h; best = v; }
    }
    return best;
  }

  function unmuteButton() {
    return [...document.querySelectorAll('button, [role="button"], div[tabindex]')]
      .find((b) => text(b) === 'unmute' || /^unmute/i.test(b.getAttribute('aria-label') || ''));
  }

  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!START_PAUSED || tapped || !v || v.tagName !== 'VIDEO') return;
    held.add(v);
    v.pause();
  }, true);
  if (START_PAUSED) {
    const pauseAll = () => document.querySelectorAll('video').forEach((v) => { if (!v.paused && !tapped) { held.add(v); v.pause(); } });
    pauseAll();
    document.addEventListener('DOMContentLoaded', pauseAll, { once: true });
  }

  let firstTap = null;
  function finishFirstTap(v) {
    if (firstTap !== v) return;
    firstTap = null;
    if (SOUND_ON && v.muted) v.muted = false;
    if (v.paused) v.play().catch(() => {
      // Safari said no to sound: play muted rather than not at all
      v.muted = true;
      v.play().catch(() => {});
    });
  }

  window.addEventListener('click', (e) => {
    if (!e.isTrusted || tapped) return;
    tapped = true;
    const v = pick();
    if (!v) return;
    firstTap = v;
    held.delete(v);
    if (SOUND_ON && v.muted) {
      const btn = unmuteButton();
      if (btn && !btn.contains(e.target)) { try { btn.click(); } catch (err) {} }
    }
    setTimeout(() => finishFirstTap(v), 250);
  }, true);
  window.addEventListener('click', (e) => {
    if (e.isTrusted && firstTap) finishFirstTap(firstTap);
  });

  // ---- Full screen ----
  // TikTok sizes the video's boxes to stop where its bottom banner was, which
  // leaves a black strip once the banner is gone. Going from the outside in,
  // each box around the video that has empty space under it (after whatever
  // sits below it, like the search bar) is stretched down to the bottom.
  let stretched = new Set();
  function fillScreen() {
    if (!FULL_SCREEN || !document.body) return;
    const v = pick();
    if (!v) return;
    const vh = innerHeight, vw = innerWidth;
    const chain = [];
    for (let el = v; el && el !== document.body && el !== document.documentElement; el = el.parentElement) chain.unshift(el);
    for (const el of chain) {
      if (el.closest('[data-tnf-hidden], [data-tnf-banner]')) return;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.top < -2 || r.top > vh * 0.25) continue; // not the player on screen now
      // Bottom of this box plus whatever comes after it in the page
      let below = r.bottom;
      for (let sib = el.nextElementSibling; sib; sib = sib.nextElementSibling) {
        const cs = getComputedStyle(sib);
        if (cs.display === 'none' || cs.position === 'fixed' || cs.position === 'absolute') continue;
        const sr = sib.getBoundingClientRect();
        if (sr.height > 0) below = Math.max(below, sr.bottom);
      }
      // Room left inside the box around it (the screen, for the outermost)
      const up = el.parentElement;
      const limit = up === document.body ? vh : Math.min(vh, up.getBoundingClientRect().bottom);
      const gap = limit - below;
      if (gap <= 2 || below < vh * 0.4) continue;
      setHeight(el, Math.round(r.height + gap));
      stretched.add(el);
    }
  }
  function unstretch() {
    for (const el of stretched) ['height', 'max-height', 'min-height'].forEach((p) => el.style.removeProperty(p));
    stretched = new Set();
  }
  function setHeight(el, h) {
    el.style.setProperty('height', h + 'px', 'important');
    el.style.setProperty('max-height', 'none', 'important');
    el.style.setProperty('min-height', h + 'px', 'important');
  }
  // Black behind everything, so nothing light shows at the edges
  const fsStyle = document.createElement('style');
  fsStyle.textContent = FULL_SCREEN ? `
    html, body { background: #000 !important; }
  ` : '';
  (document.head || document.documentElement).appendChild(fsStyle);
  addEventListener('resize', () => setTimeout(() => { unstretch(); fillScreen(); }, 100));
  document.addEventListener('scrollend', fillScreen, true);

  // ---- Debug box (#tnf-debug) ----
  function debug() {
    if (!/tnf-debug/.test(location.hash) || !document.body) return;
    let box = document.getElementById('tnf-debug');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'tnf-debug';
      box.style.cssText = 'position:fixed;left:4px;right:4px;top:40px;z-index:2147483647;background:rgba(0,0,0,.85);color:#0f0;font:10px/1.3 monospace;padding:6px;white-space:pre-wrap;pointer-events:none;max-height:70vh;overflow:hidden';
      document.documentElement.appendChild(box);
    }
    const v = pick();
    const lines = ['TikTok 2.2  screen ' + innerWidth + 'x' + innerHeight + '  videos ' + document.querySelectorAll('video').length];
    for (let el = v; el && el !== document.documentElement; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      lines.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0].slice(0, 40) + '  ' + Math.round(r.top) + '..' + Math.round(r.bottom) + '  ' + cs.position + (stretched.has(el) ? '  STRETCHED' : ''));
    }
    lines.push('hidden banners: ' + document.querySelectorAll('[data-tnf-banner]').length + '  hidden pop-ups: ' + document.querySelectorAll('[data-tnf-hidden]').length);
    box.textContent = lines.join('\n');
  }

  // Check the instant anything changes, before the screen is redrawn
  let running = false;
  new MutationObserver(() => {
    if (running) return;
    running = true;
    try { clean(); } finally { running = false; }
    queueBanners();
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => { clean(); hideBanners(); fillScreen(); debug(); }, 1000);
})();
