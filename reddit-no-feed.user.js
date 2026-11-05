// ==UserScript==
// @name         Reddit No Feed
// @namespace    reddit-no-feed
// @version      1.7
// @description  Hides the Reddit home feed (and Popular / All), plus the Recent Posts card and the Games, Custom Feeds and Recent sidebar sections.
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @match        https://old.reddit.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/reddit-no-feed.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/reddit-no-feed.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_POPULAR_AND_ALL = true; // r/popular and r/all are algorithm feeds too

  // Left sidebar sections to remove (matched by heading, any capitalization)
  const LEFT_SECTIONS = ['games on reddit', 'custom feeds', 'recent'];
  // Cards to remove anywhere on the page
  const ANYWHERE_SECTIONS = ['recent posts'];

  // Home page and its sort tabs
  const HOME_PATHS = ['/', '/best', '/hot', '/new', '/top', '/rising', '/home'];

  // ---- Styles ----
  // display:none (not just invisible) so the endless-scroll trigger is removed
  // from the page and Reddit stops loading more posts in the background.
  const style = document.createElement('style');
  style.textContent = `
    html.rnf-hide shreddit-feed,
    html.rnf-hide #main-content,
    html.rnf-hide main,
    html.rnf-hide #siteTable,
    html.rnf-hide .nav-buttons,
    html.rnf-hide #right-sidebar-container,
    html.rnf-hide [id^="right-sidebar"],
    html.rnf-hide recent-posts { display: none !important; }
    [data-rnf-hidden] { display: none !important; }

    /* Phone: "Open in app" / "Use the app" prompts */
    [bundlename*="xpromo" i],
    [id*="xpromo" i],
    xpromo-app-selector,
    xpromo-untagged-content-blocking-modal,
    shreddit-async-loader[bundlename*="app_selector" i] { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  function isFeed() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (HOME_PATHS.includes(path)) return true;
    if (HIDE_POPULAR_AND_ALL && /^\/r\/(popular|all)(\/|$)/i.test(path)) return true;
    return false;
  }

  // ---- Hide sections by their heading text ----
  const LEFT_NAV = '#left-sidebar, #left-sidebar-container, reddit-sidebar-nav, [id*="left-sidebar"]';
  // Never touch the top bar or the search box (its dropdown has a "Recent" heading too)
  const NEVER_HIDE = 'header, reddit-header-large, reddit-search-large, faceplate-search-input, search-dynamic-id-cache-controller, [role="search"]';

  function isProtected(el) {
    if (!el) return true;
    if (el.closest(NEVER_HIDE)) return true;
    let h = el.getRootNode().host;
    while (h) {
      if (h.closest(NEVER_HIDE)) return true;
      h = h.getRootNode().host;
    }
    return !!el.querySelector?.('input[type="search"], input[name="q"]');
  }

  function inLeftSidebar(el, host) {
    if (el.closest(LEFT_NAV) || host?.closest(LEFT_NAV)) return true;
    return false;
  }
  const SECTION = 'faceplate-expandable-section-helper, details, section, aside, #right-sidebar-container';

  // Reddit builds some cards inside "shadow" sections that normal searches can't
  // see into, so this walks into those too. When a match is inside one, the
  // whole sealed-off component (its host element) gets hidden.
  function scan(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.hasAttribute('data-rnf-hidden')) continue;
        if (looksLikeDivider(node) && !isProtected(node)) dividers.push(node);
        if (node.shadowRoot) scan(node.shadowRoot);
        continue;
      }

      const text = node.nodeValue.trim().toLowerCase();
      if (!text || text.length > 20) continue;

      const el = node.parentElement;
      if (!el || el.closest('[data-rnf-hidden]')) continue;

      const host = el.getRootNode().host; // set when inside a shadow section
      let match = ANYWHERE_SECTIONS.includes(text);
      if (!match && LEFT_SECTIONS.includes(text) && inLeftSidebar(el, host)) match = true;
      if (!match || isProtected(el)) continue;

      const section = host || el.closest(SECTION) || el.parentElement?.parentElement;
      if (section && section !== document.body && !isProtected(section)) section.setAttribute('data-rnf-hidden', '');
    }
  }

  // ---- Remove leftover divider lines in the left sidebar ----
  // If two visible dividers sit right on top of each other (nothing between
  // them), the upper one is left over from a removed section, so hide it.
  let dividers = [];

  // A divider is anything thin, wide and empty sitting in the left sidebar,
  // whether Reddit drew it as an <hr> or as an empty box with a border.
  const NOT_DIVIDERS = 'img, svg, input, button, a, video, canvas, iframe';
  function looksLikeDivider(node) {
    const isHr = node.matches('hr, [role="separator"]');
    if (!isHr && (node.childElementCount > 0 || node.textContent.trim() || node.matches(NOT_DIVIDERS))) return false;
    const r = node.getBoundingClientRect();
    return r.width > 100 && r.height > 0 && r.height <= 4 && r.left < 320;
  }

  function tidyDividers() {
    const visible = dividers
      .map((d) => ({ d, r: d.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height > 0)
      .sort((a, b) => a.r.top - b.r.top);

    for (let i = 0; i < visible.length - 1; i++) {
      const gap = visible[i + 1].r.top - visible[i].r.bottom;
      if (gap < 70) visible[i].d.setAttribute('data-rnf-hidden', '');
    }
  }

  function hideSections() {
    if (!document.body) return;
    dividers = [];
    scan(document.body);
    tidyDividers();
  }

  // Reddit changes pages without full reloads, so keep checking
  function apply() {
    document.documentElement.classList.toggle('rnf-hide', isFeed());
    hideSections();
  }

  apply();
  setInterval(apply, 400);
  window.addEventListener('popstate', apply);
})();
