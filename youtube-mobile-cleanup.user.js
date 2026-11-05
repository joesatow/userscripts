// ==UserScript==
// @name         YouTube Mobile Cleanup
// @namespace    youtube-mobile-cleanup
// @version      1.0
// @description  Mobile YouTube stripped down: no Ask YouTube, no Shorts tab, no Create button, no topic chips, no Subscriptions tab, and the home feed hidden behind a toggle.
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-mobile-cleanup.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/youtube-mobile-cleanup.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_ASK_YOUTUBE = true;
  const HIDE_SHORTS = true;              // Shorts tab in the bottom bar, plus Shorts rows
  const HIDE_CREATE_BUTTON = true;       // the "+" in the bottom bar / top bar
  const HIDE_CHIPS_BAR = true;           // "All / Music / Gaming ..." bar on the home page
  const HIDE_SUBSCRIPTIONS_TAB = true;   // Subscriptions tab in the bottom bar
  const HOME_FEED_TOGGLE = true;         // home feed hidden, with a button to show it

  // Bottom bar tabs to remove, by their label
  const TABS_REMOVE = [];
  if (HIDE_SHORTS) TABS_REMOVE.push('shorts');
  if (HIDE_CREATE_BUTTON) TABS_REMOVE.push('create');
  if (HIDE_SUBSCRIPTIONS_TAB) TABS_REMOVE.push('subscriptions');

  // ---- Styles (in place before the page draws, so nothing flashes) ----
  const css = ['[data-ycm-hidden] { display: none !important; }'];

  if (HIDE_ASK_YOUTUBE) {
    css.push('html.ycm-askpage ytm-app { visibility: hidden !important; }');
  }

  if (HIDE_SHORTS) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-shorts),
      ytm-pivot-bar-item-renderer:has([aria-label="Shorts"]),
      ytm-reel-shelf-renderer,
      ytm-shorts-lockup-view-model,
      ytm-rich-section-renderer:has(ytm-reel-shelf-renderer),
      ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model) { display: none !important; }
    `);
  }

  if (HIDE_CREATE_BUTTON) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-create),
      ytm-pivot-bar-item-renderer:has([aria-label="Create"]),
      ytm-mobile-topbar-renderer :is(ytm-button-renderer, button-view-model, yt-button-view-model):has([aria-label="Create"]) { display: none !important; }
    `);
  }

  if (HIDE_SUBSCRIPTIONS_TAB) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-subs),
      ytm-pivot-bar-item-renderer:has([aria-label="Subscriptions"]) { display: none !important; }
    `);
  }

  if (HIDE_CHIPS_BAR) {
    css.push(`
      html.ycm-home ytm-feed-filter-chip-bar-renderer,
      html.ycm-home ytm-chip-cloud-renderer,
      html.ycm-home .chip-bar-contents { display: none !important; }
    `);
  }

  if (HOME_FEED_TOGGLE) {
    // display:none (not just invisible) removes the endless-scroll trigger,
    // so YouTube stops loading more videos in the background.
    css.push(`
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-rich-grid-renderer,
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-section-list-renderer,
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-continuation-item-renderer { display: none !important; }

      #ycm-feed-toggle {
        display: block;
        margin: 40px auto;
        padding: 10px 20px;
        border: 0;
        border-radius: 18px;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        background: rgba(255, 255, 255, .12);
        color: inherit;
      }
      html.ycm-feed-on #ycm-feed-toggle { margin: 12px auto; }
      html:not(.ycm-home) #ycm-feed-toggle { display: none !important; }
    `);
  }

  const style = document.createElement('style');
  style.textContent = css.join('\n');
  (document.head || document.documentElement).appendChild(style);

  function hide(el) {
    if (el) el.setAttribute('data-ycm-hidden', '');
  }

  function label(el) {
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return (aria || el.innerText || el.textContent || '').trim().toLowerCase();
  }

  // =====================================================================
  // Bottom bar tabs (backup for the style rules above, matched by label)
  // =====================================================================
  function trimTabs() {
    document.querySelectorAll('ytm-pivot-bar-item-renderer:not([data-ycm-hidden])').forEach((tab) => {
      const text = (tab.innerText || '').trim().toLowerCase();
      const aria = (tab.querySelector('[aria-label]')?.getAttribute('aria-label') || '').trim().toLowerCase();
      const name = text || aria;
      if (TABS_REMOVE.includes(name)) hide(tab);
      else if (aria && TABS_REMOVE.includes(aria)) hide(tab);
    });
  }

  // =====================================================================
  // Ask YouTube
  // =====================================================================
  const ASK_LABELS = ['ask', 'ask youtube'];

  function hideAskButtons() {
    document
      .querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"]')
      .forEach((el) => {
        if (el.closest('[data-ycm-hidden]')) return;
        if (!ASK_LABELS.includes(label(el))) return;
        hide(el.closest('ytm-button-renderer, button-view-model, yt-button-view-model, ytm-menu-item, ytm-pivot-bar-item-renderer') || el);
      });
  }

  function onAskPage() {
    if (/^\/(ask|gemini)(\/|$)/i.test(location.pathname)) return true;
    for (const h of document.querySelectorAll('h1, h2, span')) {
      const t = (h.textContent || '').trim().toLowerCase();
      if (t === 'dive deep into any topic') return true;
      if (t === 'ask youtube' && h.matches('h1, h2, h1 *, h2 *')) return true;
    }
    return false;
  }

  let leaving = false;
  function blockAskPage() {
    const ask = onAskPage();
    document.documentElement.classList.toggle('ycm-askpage', ask);
    if (!ask || leaving) return;
    leaving = true;
    if (location.pathname !== '/') location.replace('/');
    setTimeout(() => (leaving = false), 1500);
  }

  // =====================================================================
  // Home feed toggle
  // =====================================================================
  let feedOn = false; // off every time you open YouTube

  function placeToggle() {
    const browse = document.querySelector('ytm-browse');
    if (!browse) return;
    const feed = browse.querySelector('ytm-rich-grid-renderer, ytm-section-list-renderer');
    if (!feed || !feed.parentElement) return;

    let btn = document.getElementById('ycm-feed-toggle');
    if (btn && btn.nextElementSibling === feed) return;

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'ycm-feed-toggle';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        feedOn = !feedOn;
        updateToggle();
        if (feedOn) window.dispatchEvent(new Event('resize'));
      });
    }
    feed.parentElement.insertBefore(btn, feed);
    updateToggle();
  }

  function updateToggle() {
    document.documentElement.classList.toggle('ycm-feed-on', feedOn);
    const btn = document.getElementById('ycm-feed-toggle');
    if (btn) btn.textContent = feedOn ? 'Hide home feed' : 'Show home feed';
  }

  // =====================================================================
  // Apply
  // =====================================================================
  function apply() {
    document.documentElement.classList.toggle('ycm-home', location.pathname === '/');
    if (!document.body) return;

    trimTabs();
    if (HIDE_ASK_YOUTUBE) {
      hideAskButtons();
      blockAskPage();
    }
    if (HOME_FEED_TOGGLE && location.pathname === '/') placeToggle();
  }

  // Run the moment YouTube adds anything, before the screen is drawn
  let running = false;
  new MutationObserver(() => {
    if (running) return;
    running = true;
    try { apply(); } finally { running = false; }
  }).observe(document.documentElement, { childList: true, subtree: true });

  updateToggle();
  apply();
  setInterval(apply, 1000);
  window.addEventListener('popstate', apply);
  window.addEventListener('state-navigateend', apply);
})();
