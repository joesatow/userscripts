// ==UserScript==
// @name         TikTok No Login Popup
// @namespace    tiktok-no-login
// @version      1.3
// @description  Removes TikTok's "Log in" pop-ups when you're not logged in, without a flash, and keeps the page clickable and scrollable.
// @match        https://www.tiktok.com/*
// @match        https://m.tiktok.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok-no-login.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/tiktok-no-login.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Text that marks a login prompt (any capitalization)
  const LOGIN_TEXT = [
    'log in to tiktok',
    'log in or sign up',
    'log in to follow',
    'log in to continue',
    'sign up for tiktok',
    'log in to see more',
  ];
  // Buttons that dismiss it without logging in
  const DISMISS_TEXT = ['continue as guest', 'not now', 'maybe later'];

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

  // Check the instant anything changes, before the screen is redrawn
  let running = false;
  new MutationObserver(() => {
    if (running) return;
    running = true;
    try { clean(); } finally { running = false; }
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(clean, 1000);
})();
