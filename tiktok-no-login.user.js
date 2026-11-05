// ==UserScript==
// @name         TikTok No Login Popup
// @namespace    tiktok-no-login
// @version      1.0
// @description  Removes TikTok's "Log in" pop-ups when you're not logged in, and turns page scrolling back on.
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

  // ---- Styles: hide known login pop-ups before they're drawn ----
  const style = document.createElement('style');
  style.textContent = `
    #loginContainer,
    [data-e2e="login-modal"],
    [data-e2e="modal-login"],
    [id^="login-modal"],
    [data-tnf-hidden] { display: none !important; }

    /* TikTok freezes scrolling while the pop-up is open; undo that */
    html.tnf-unlock, html.tnf-unlock body {
      overflow: auto !important;
      position: static !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  function text(el) {
    return (el.innerText || el.textContent || '').trim().toLowerCase();
  }

  function isLoginPrompt(el) {
    const t = text(el);
    return LOGIN_TEXT.some((s) => t.includes(s));
  }

  // The full-screen layer that holds a dialog (so the dark backdrop goes too)
  function overlayFor(dialog) {
    let el = dialog;
    while (el.parentElement && el.parentElement !== document.body) {
      const r = el.parentElement.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) break;
      el = el.parentElement;
      if (getComputedStyle(el).position === 'fixed') return el;
    }
    return el;
  }

  function clean() {
    if (!document.body) return;

    const dialogs = document.querySelectorAll(
      '[role="dialog"], [aria-modal="true"], [class*="ModalContainer"], [class*="DivModal"]'
    );

    for (const d of dialogs) {
      if (d.closest('[data-tnf-hidden]') || !isLoginPrompt(d)) continue;

      // Prefer TikTok's own way out, so the page stays happy
      const dismiss = [...d.querySelectorAll('button, [role="button"], a, div[tabindex]')]
        .find((b) => DISMISS_TEXT.includes(text(b)));
      if (dismiss) {
        dismiss.click();
        continue;
      }
      const close = d.querySelector(
        '[data-e2e="modal-close-inner-button"], [data-e2e="modal-close-button"], [aria-label="Close" i]'
      );
      if (close) close.click();

      // Remove it either way, in case the click didn't take
      overlayFor(d).setAttribute('data-tnf-hidden', '');
    }

    // Banners like "Log in to see more" at the bottom of the page
    document.querySelectorAll('[class*="LoginBanner"], [class*="BottomLogin"], [data-e2e*="login-banner"]')
      .forEach((el) => el.setAttribute('data-tnf-hidden', ''));

    document.documentElement.classList.add('tnf-unlock');
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      clean();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(clean, 1000);
})();
