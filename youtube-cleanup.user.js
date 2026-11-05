// ==UserScript==
// @name         YouTube Cleanup
// @namespace    youtube-cleanup
// @version      1.4
// @description  Strips YouTube down: no Ask YouTube, no Shorts button, no Create button, no topic chips, no Subscriptions sidebar list, and the home feed hidden behind a toggle.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-cleanup.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-cleanup.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_ASK_YOUTUBE = true;
  const HIDE_SHORTS_BUTTON = true;
  const HIDE_CREATE_BUTTON = true;
  const HIDE_CHIPS_BAR = true;           // "Add custom feed / All / ..." bar on the home page
  const HIDE_SUBSCRIPTIONS_LIST = true;  // channel list in the left sidebar
  const HOME_FEED_TOGGLE = true;         // home feed hidden, with a button to show it
  const HIDE_WATCH_CHIPS = true;         // "All / From <channel> / ..." bar next to a video
  const HIDE_WATCH_SHORTS = true;        // Shorts in the related videos next to a video

  // ---- Styles (injected immediately so nothing flashes) ----
  const HOME = 'ytd-browse[page-subtype="home"]';
  const css = [];

  css.push('[data-yc-hidden] { display: none !important; }');

  if (HIDE_ASK_YOUTUBE) {
    css.push(`
      html.yc-askpage ytd-app,
      html.yc-askpage ytm-app { visibility: hidden !important; }
    `);
  }

  if (HIDE_SHORTS_BUTTON) {
    css.push(`
      ytd-guide-entry-renderer:has(a[title="Shorts"]),
      ytd-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-mini-guide-entry-renderer[aria-label="Shorts"],
      ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
      ytm-pivot-bar-item-renderer:has(.pivot-shorts) { display: none !important; }
    `);
  }

  if (HIDE_CREATE_BUTTON) {
    css.push(`
      ytd-masthead #buttons ytd-button-renderer:has([aria-label="Create"]),
      ytd-masthead #buttons yt-button-view-model:has([aria-label="Create"]),
      ytd-masthead #buttons button-view-model:has([aria-label="Create"]),
      ytd-masthead #buttons ytd-topbar-menu-button-renderer:has([aria-label="Create"]) { display: none !important; }
    `);
  }

  if (HIDE_CHIPS_BAR) {
    css.push(`
      ${HOME} ytd-feed-filter-chip-bar-renderer,
      ${HOME} #chips-wrapper,
      ${HOME} ytd-rich-grid-renderer > #header,
      html.yc-home #frosted-glass { display: none !important; }
    `);
  }

  // The related-videos column next to a video (#secondary), or under it in
  // theater mode / narrow windows (#related)
  const RELATED = 'ytd-watch-flexy :is(#secondary, #related)';

  if (HIDE_WATCH_CHIPS) {
    css.push(`
      ${RELATED} yt-related-chip-cloud-renderer,
      ${RELATED} yt-chip-cloud-renderer,
      ${RELATED} #chips-wrapper,
      ${RELATED} ytd-feed-filter-chip-bar-renderer { display: none !important; }
    `);
  }

  if (HIDE_WATCH_SHORTS) {
    css.push(`
      ${RELATED} ytd-reel-shelf-renderer,
      ${RELATED} grid-shelf-view-model,
      ${RELATED} ytd-rich-shelf-renderer:has(a[href^="/shorts/"]),
      ${RELATED} yt-horizontal-list-renderer:has(a[href^="/shorts/"]),
      ${RELATED} ytd-item-section-renderer:has(> #contents > ytd-reel-shelf-renderer),
      ${RELATED} :is(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2),
      ${RELATED} ytd-compact-video-renderer:has(a[href^="/shorts/"]),
      ${RELATED} yt-lockup-view-model:has(a[href^="/shorts/"]) { display: none !important; }
    `);
  }

  if (HOME_FEED_TOGGLE) {
    // display:none (not just invisible) removes YouTube's endless-scroll trigger
    // from the page, so it stops loading more videos in the background.
    css.push(`
      html:not(.yc-feed-on) ${HOME} ytd-rich-grid-renderer,
      html:not(.yc-feed-on) ${HOME} ytd-continuation-item-renderer { display: none !important; }

      #yc-feed-toggle {
        display: block;
        margin: 48px auto;
        padding: 10px 20px;
        border: 0;
        border-radius: 18px;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        cursor: pointer;
        background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1));
        color: var(--yt-spec-text-primary, #f1f1f1);
      }
      #yc-feed-toggle:hover { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,.2)); }
      html.yc-feed-on #yc-feed-toggle { margin: 16px auto; }
    `);
  }

  const style = document.createElement('style');
  style.textContent = css.join('\n');
  (document.head || document.documentElement).appendChild(style);

  function hide(el) {
    if (el) el.setAttribute('data-yc-hidden', '');
  }

  function label(el) {
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return (aria || el.innerText || el.textContent || '').trim().toLowerCase();
  }

  // =====================================================================
  // Ask YouTube
  // =====================================================================
  const ASK_LABELS = ['ask', 'ask youtube'];
  const WRAPPERS = [
    'ytd-guide-entry-renderer', 'ytd-mini-guide-entry-renderer',
    'yt-button-view-model', 'button-view-model', 'ytd-button-renderer',
    'ytd-menu-service-item-renderer', 'tp-yt-paper-item',
    'ytm-pivot-bar-item-renderer', 'ytm-button-renderer',
  ].join(', ');

  function hideAskButtons() {
    document
      .querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], tp-yt-paper-item')
      .forEach((el) => {
        if (el.closest('[data-yc-hidden]')) return;
        if (!ASK_LABELS.includes(label(el))) return;
        hide(el.closest(WRAPPERS) || el);
      });
  }

  function onAskPage() {
    if (/^\/(ask|gemini)(\/|$)/i.test(location.pathname)) return true;
    for (const h of document.querySelectorAll('h1, h2, yt-formatted-string, span')) {
      const t = (h.textContent || '').trim().toLowerCase();
      if (t === 'dive deep into any topic') return true;
      if (t === 'ask youtube' && h.matches('h1, h2, h1 *, h2 *')) return true;
    }
    return false;
  }

  let leaving = false;
  function blockAskPage() {
    const ask = onAskPage();
    document.documentElement.classList.toggle('yc-askpage', ask);
    if (!ask || leaving) return;
    leaving = true;
    if (location.pathname !== '/') location.replace('/');
    setTimeout(() => (leaving = false), 1500);
  }

  // =====================================================================
  // Subscriptions list in the left sidebar
  // =====================================================================
  // The section is found by its first line of text ("Subscriptions >"), or by
  // its heading linking to your channel list. Checking only the FIRST line means
  // a plain "Subscriptions" link inside the Home section never takes Home with it.
  function hideSubscriptionsList() {
    document.querySelectorAll('ytd-guide-section-renderer:not([data-yc-hidden])').forEach((sec) => {
      const firstLine = (sec.innerText || '').trim().split('\n')[0].trim().toLowerCase();
      const headingLink = sec.querySelector(
        '#guide-section-title a[href*="/feed/channels"], ytd-guide-entry-renderer:first-child a[href*="/feed/channels"]'
      );
      if (firstLine === 'subscriptions' || headingLink) hide(sec);
    });
  }

  // =====================================================================
  // Home feed toggle
  // =====================================================================
  let feedOn = false; // off every time you open YouTube

  function placeToggle() {
    const browse = document.querySelector(HOME);
    if (!browse) return;
    const grid = browse.querySelector('ytd-rich-grid-renderer');
    if (!grid || !grid.parentElement) return;

    let btn = document.getElementById('yc-feed-toggle');
    if (btn && btn.nextElementSibling === grid) return; // already in place

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'yc-feed-toggle';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        feedOn = !feedOn;
        updateToggle();
        if (feedOn) window.dispatchEvent(new Event('resize')); // nudge YouTube to lay out the grid
      });
    }
    grid.parentElement.insertBefore(btn, grid);
    updateToggle();
  }

  function updateToggle() {
    document.documentElement.classList.toggle('yc-feed-on', feedOn);
    const btn = document.getElementById('yc-feed-toggle');
    if (btn) btn.textContent = feedOn ? 'Hide home feed' : 'Show home feed';
  }

  // =====================================================================
  // Apply
  // =====================================================================
  // =====================================================================
  // Shorts next to a video (backup for the style rules, in case YouTube
  // renames its elements): any row holding several /shorts/ links goes
  // =====================================================================
  function hideWatchShorts() {
    const col = document.querySelector('ytd-watch-flexy #secondary, ytd-watch-flexy #related');
    if (!col) return;
    const links = col.querySelectorAll('a[href^="/shorts/"]:not([data-yc-seen])');
    links.forEach((a) => {
      a.setAttribute('data-yc-seen', '');
      // Climb to the row that holds this Short and others (the shelf),
      // stopping before the whole related-videos list
      let el = a;
      while (el.parentElement && el.parentElement !== col) {
        const parent = el.parentElement;
        if (parent.id === 'items' || parent.id === 'contents') break;
        el = parent;
      }
      hide(el);
    });
  }

  function apply() {
    document.documentElement.classList.toggle('yc-home', location.pathname === '/');
    if (!document.body) return;

    if (HIDE_ASK_YOUTUBE) {
      hideAskButtons();
      blockAskPage();
    }
    if (HIDE_SUBSCRIPTIONS_LIST) hideSubscriptionsList();
    if (HOME_FEED_TOGGLE) placeToggle();
    if (HIDE_WATCH_SHORTS && location.pathname === '/watch') hideWatchShorts();
  }

  // Watch for changes as they happen so things are gone before you see them
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  updateToggle();
  setInterval(apply, 500);
  window.addEventListener('yt-navigate-finish', apply);
  window.addEventListener('popstate', apply);
})();
