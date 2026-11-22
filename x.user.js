// ==UserScript==
// @name         X
// @namespace    joesatow-x
// @version      2.1
// @description  Logged-in X/Twitter without the feeds: hides the Home timeline, the Explore page's trends and tabs, the sidebar's What's happening, Who to follow and Premium boxes, and the "Discover more" posts under threads. Posts people send you, search, notifications and messages work as normal.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @run-at       document-start
// @inject-into  auto
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/x.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/x.user.js
// ==/UserScript==

// Works from the browser extension's own space (X's security settings block
// page scripts in Safari), so it only uses style rules and the page's markup.
//
// Troubleshooting: add #xnf-debug to an X address. Things this script hides
// by itself get a red outline and a label instead of vanishing (things hidden
// by style rules alone still vanish). #xnf-nodebug ends it.

(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_HOME = true;          // the Home timeline (For you / Following)
  const HIDE_EXPLORE = true;       // Explore's trends and tabs (the search box stays)
  const HIDE_SIDEBAR = true;       // What's happening, Who to follow, Premium, news (computer)
  const HIDE_DISCOVER_MORE = true; // "Discover more" recommended posts under a thread

  // Sidebar boxes to remove, matched by their heading (any capitalization)
  const SIDEBAR_HEADINGS = [
    "what's happening", 'what’s happening', 'who to follow', 'you might like',
    'subscribe to premium', 'trending now', "today's news", 'today’s news',
    'live on x', 'trends for you', 'explore',
  ];
  // Headings that start the recommended posts under a thread
  const DISCOVER_HEADINGS = ['discover more', 'more posts', 'more tweets'];

  let DEBUG = false;
  try {
    if (location.hash.includes('xnf-debug')) sessionStorage.setItem('xnf-debug', '1');
    if (location.hash.includes('xnf-nodebug')) sessionStorage.removeItem('xnf-debug');
    DEBUG = sessionStorage.getItem('xnf-debug') === '1';
  } catch (e) {}

  const HIDE_ATTR = 'data-xnf-hide';
  const PRIMARY = '[data-testid="primaryColumn"]';
  const SIDEBAR = '[data-testid="sidebarColumn"]';

  // ---- Style rules (in place before X draws anything, so nothing flashes) ----
  const css = [];
  // The home timeline is labelled the same on every page it appears, so this
  // rule is always on
  if (HIDE_HOME) {
    css.push(
      `div[aria-label^="Timeline: Your Home Timeline" i],`,
      `div[aria-label*="Home Timeline" i] { display: none !important; }`
    );
  }
  // Rules for the page you're on; swapped in as you move around X
  const PAGE_CSS = {
    home: [
      `${PRIMARY} section,`,
      `${PRIMARY} [role="tablist"],`,
      `${PRIMARY} [data-testid="cellInnerDiv"] { display: none !important; }`,
      `${PRIMARY}::after {`,
      `  content: "Home feed hidden. Search, Notifications, Messages and links people send you still work.";`,
      `  display: block; padding: 48px 24px; text-align: center; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;`,
      `  color: rgb(113, 118, 123); }`,
    ].join('\n'),
    explore: [
      `${PRIMARY} section,`,
      `${PRIMARY} [role="tablist"] { display: none !important; }`,
    ].join('\n'),
  };
  if (HIDE_SIDEBAR) {
    css.push(
      `html:not(.xnf-search) ${SIDEBAR} section,`,
      `${SIDEBAR} [aria-label="Timeline: Trending now"],`,
      `${SIDEBAR} aside:not([aria-label="Relevant people"]) { display: none !important; }`
    );
  }
  if (DEBUG) {
    css.push(
      `[${HIDE_ATTR}] { display: block !important; outline: 2px solid red !important; outline-offset: -2px; position: relative; opacity: .6; }`,
      `[${HIDE_ATTR}]::before { content: "X: " attr(${HIDE_ATTR}); position: absolute; z-index: 9; top: 0; left: 0;`,
      `  background: red; color: #fff; font: 11px monospace; padding: 1px 4px; }`
    );
  } else {
    css.push(`[${HIDE_ATTR}] { display: none !important; }`);
  }

  const baseStyle = document.createElement('style');
  baseStyle.id = 'xnf-style';
  baseStyle.textContent = css.join('\n');
  const pageStyle = document.createElement('style');
  pageStyle.id = 'xnf-page-style';

  // Put the style elements in (again, if X's page rebuild took them out)
  function addStyle() {
    const root = document.head || document.documentElement;
    if (!root) return false;
    if (!baseStyle.isConnected) root.appendChild(baseStyle);
    if (!pageStyle.isConnected) root.appendChild(pageStyle);
    return true;
  }

  // ---- Which page we're on (X changes pages without reloading) ----
  let lastPath = null;
  let page = '';
  function updatePage() {
    const html = document.documentElement;
    if (!html) return;
    addStyle();
    const p = location.pathname.replace(/\/+$/, '') || '/';
    if (p === lastPath && html.classList.contains('xnf-ready')) return;
    lastPath = p;
    page = (p === '/home' || p === '/') ? 'home' : /^\/explore(\/|$)/.test(p) ? 'explore' : '';
    const want = (page === 'home' && HIDE_HOME) || (page === 'explore' && HIDE_EXPLORE) ? PAGE_CSS[page] : '';
    if (pageStyle.textContent !== want) pageStyle.textContent = want;
    html.classList.add('xnf-ready');
    html.classList.toggle('xnf-search', p === '/search');
  }

  // ---- #xnf-debug: a small box saying the script is running and what it sees ----
  let debugBox = null;
  function showDebug() {
    if (!DEBUG || !document.body) return;
    if (!debugBox || !debugBox.isConnected) {
      debugBox = document.createElement('div');
      debugBox.style.cssText = 'position:fixed;z-index:2147483647;left:8px;bottom:80px;background:#c00;color:#fff;' +
        'font:12px/1.35 monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(debugBox);
    }
    const tl = document.querySelector('div[aria-label*="Home Timeline" i]');
    const labels = [...document.querySelectorAll(`${PRIMARY} [aria-label^="Timeline" i]`)].map(e => e.getAttribute('aria-label')).slice(0, 3);
    const msg = `X script ${GM_VERSION} running\npage: ${location.pathname} (${page || 'other'})\n` +
      `primaryColumn: ${!!document.querySelector(PRIMARY)}  home timeline: ${!!tl}\n` +
      `timelines: ${labels.join(' | ') || 'none'}\ncells: ${document.querySelectorAll('[data-testid="cellInnerDiv"]').length}`;
    if (debugBox.textContent !== msg) debugBox.textContent = msg; // only when changed, or it would keep re-triggering itself
  }
  const GM_VERSION = '2.1';

  function textOf(el) {
    return (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function hide(el, why) {
    if (!el || el.hasAttribute(HIDE_ATTR)) return;
    el.setAttribute(HIDE_ATTR, why);
  }

  // ---- Sidebar boxes found by their heading ----
  function sweepSidebar(scope) {
    if (!HIDE_SIDEBAR) return;
    const side = scope.closest ? scope.closest(SIDEBAR) || scope.querySelector(SIDEBAR) : null;
    if (!side) return;
    const keep = side.querySelector('form[role="search"], [data-testid="SearchBox_Search_Input"], nav[aria-label="Footer"]');
    for (const h of side.querySelectorAll('h2, [role="heading"]')) {
      const t = textOf(h);
      if (!SIDEBAR_HEADINGS.includes(t)) continue;
      // Climb to the box: stop just below the level shared with the search box / footer
      let box = h;
      while (box.parentElement && box.parentElement !== side) {
        const up = box.parentElement;
        if (up.querySelector('form[role="search"], [data-testid="SearchBox_Search_Input"], nav[aria-label="Footer"]')) break;
        if (up.querySelectorAll('h2').length > 1) break; // holds more than one box
        box = up;
      }
      if (keep && box.contains(keep)) continue;
      hide(box, 'sidebar: ' + t);
    }
  }

  // ---- "Discover more" posts under a thread ----
  function isDiscoverCell(cell) {
    for (const h of cell.querySelectorAll('h2, [role="heading"]')) {
      const t = textOf(h);
      if (DISCOVER_HEADINGS.some(d => t === d || t.startsWith(d + ' '))) return true;
    }
    return false;
  }

  function sweepDiscover() {
    if (!HIDE_DISCOVER_MORE) return;
    if (!/\/status\/\d+/.test(location.pathname)) return;
    const cells = document.querySelectorAll(`${PRIMARY} [data-testid="cellInnerDiv"]`);
    for (const cell of cells) {
      if (cell.hasAttribute(HIDE_ATTR)) continue;
      if (isDiscoverCell(cell)) { hide(cell, 'discover more'); continue; }
      // Anything after a hidden Discover cell is a recommended post
      const prev = cell.previousElementSibling;
      if (prev && prev.getAttribute(HIDE_ATTR) && prev.getAttribute(HIDE_ATTR).startsWith('discover')) {
        hide(cell, 'discover more (post)');
      }
    }
  }

  function sweep() {
    updatePage();
    if (document.body) {
      sweepSidebar(document.body);
      sweepDiscover();
      showDebug();
    }
  }

  // ---- Start ----
  function start() {
    if (!document.documentElement) { setTimeout(start, 0); return; }
    updatePage();

    // Handle changes as they happen (before the screen is drawn)
    let queued = false;
    const mo = new MutationObserver(() => {
      updatePage();
      if (queued) return;
      queued = true;
      Promise.resolve().then(() => { queued = false; sweep(); });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', sweep);
    setInterval(() => { updatePage(); showDebug(); }, 250); // safety net for page changes that touch no markup
    if (document.readyState !== 'loading') sweep();
    else document.addEventListener('DOMContentLoaded', sweep);
  }

  start();
})();
