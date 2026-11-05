// ==UserScript==
// @name         FB No Feeds
// @namespace    fb-no-feeds
// @version      1.6
// @description  Hides the Facebook home feed and Marketplace browse feed, trims the left sidebar, and removes Sponsored and Birthdays. Marketplace search, listings, messages and everything else still work.
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/fb-no-feeds.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/fb-no-feeds.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_HOME_FEED = true;
  const HIDE_MARKETPLACE_FEED = true;
  const HIDE_REELS_AND_WATCH_FEED = true; // only the browse pages; a specific video/reel someone sends you still opens

  // Left sidebar on the home page: only these stay (edit to taste)
  const LEFT_SIDEBAR_KEEP = ['saved', 'groups', 'marketplace', 'events'];

  // Right column sections to remove
  const RIGHT_SIDEBAR_REMOVE = ['sponsored', 'birthdays'];

  // Marketplace pages that are NOT algorithmic feeds (always shown)
  const MARKETPLACE_ALLOWED =
    /\/(search|item|you|inbox|create|notifications|saved|selling|buying|profile)(\/|$)/;

  // ---- Styles (injected immediately so the feed never flashes) ----
  const style = document.createElement('style');
  style.textContent = `
    html.nf-feed div[role="main"],
    html.nf-hide div[role="feed"] { display: none !important; }
    html.nf-mp div[role="main"] { visibility: hidden !important; }
    html.nf-mp a[href*="/marketplace/item/"] { display: none !important; }
    html.nf-mp .nf-col-hidden { display: none !important; }
    [data-nf-hidden] { display: none !important; }

    /* Top bar Video/Reels and Gaming tabs: hidden by style alone, so they never appear */
    [role="banner"] li:has(a[href*="/watch"]),
    [role="banner"] li:has(a[href*="/reel"]),
    [role="banner"] li:has(a[href*="/video"]),
    [role="banner"] li:has(a[href*="/gaming"]) { display: none !important; }

    /* Keep the sidebars invisible until the script has trimmed them */
    html.nf-home:not(.nf-left-ready) div[role="navigation"]:has(a[href*="/marketplace"]):not([role="banner"] *),
    html.nf-home:not(.nf-rail-ready) [role="complementary"] { visibility: hidden !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // ---- Decide what kind of page this is ----
  function currentPath() {
    return location.pathname.replace(/\/+$/, '') || '/';
  }

  function isHome() {
    const path = currentPath();
    return path === '/' || path === '/home.php';
  }

  function pageType() {
    const path = currentPath();
    const params = new URLSearchParams(location.search);

    if (HIDE_HOME_FEED && isHome()) return 'feed';

    if (HIDE_REELS_AND_WATCH_FEED) {
      if (path === '/reels') return 'feed';
      if (path.startsWith('/watch') && !params.has('v')) return 'feed';
    }

    if (HIDE_MARKETPLACE_FEED && path.startsWith('/marketplace')) {
      // search results, listings, inbox, selling, etc. stay visible
      if (params.has('query')) return null;
      if (MARKETPLACE_ALLOWED.test(path)) return null;
      return 'marketplace';
    }

    return null;
  }

  function hide(el) {
    if (el && el !== document.body && el !== document.documentElement) {
      el.setAttribute('data-nf-hidden', '');
    }
  }

  // ---- Marketplace: hide the whole content column to the right of the sidebar ----
  // Facebook's class names are random, so find the "Search Marketplace" box and
  // walk up until we reach the sidebar column, then hide whatever sits beside it.
  function hideMarketplaceColumn() {
    if (document.querySelector('.nf-col-hidden')) return; // already done for this page
    const input = document.querySelector(
      'input[aria-label*="Search Marketplace" i], input[placeholder*="Search Marketplace" i]'
    );
    if (!input) return;

    let el = input;
    while (el.parentElement && el.parentElement !== document.body) {
      const parent = el.parentElement;
      const right = el.getBoundingClientRect().right;
      const beside = [...parent.children].filter((c) => {
        if (c === el) return false;
        if (c.classList.contains('nf-col-hidden')) return true;
        const r = c.getBoundingClientRect();
        return r.left >= right - 2 && r.width > 300;
      });
      if (beside.length) {
        beside.forEach((c) => c.classList.add('nf-col-hidden'));
        return;
      }
      el = parent;
    }
  }

  function unhideAll() {
    document.querySelectorAll('.nf-col-hidden').forEach((c) => c.classList.remove('nf-col-hidden'));
  }

  // ---- Home page left sidebar: keep only the chosen links ----
  // Find the sidebar by its Marketplace link (left side, below the top bar),
  // then climb up to the full sidebar column.
  let leftRoot = null;
  function findLeftSidebar() {
    if (leftRoot && leftRoot.isConnected) return leftRoot; // reuse, it's expensive to find
    leftRoot = findLeftSidebarFresh();
    return leftRoot;
  }

  function findLeftSidebarFresh() {
    const mp = [...document.querySelectorAll('a[href*="/marketplace"]')].find((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.left < 250 && r.top > 60;
    });
    if (!mp) return null;

    let el = mp;
    while (el.parentElement && el.parentElement !== document.body) {
      if (el.parentElement.getBoundingClientRect().width > 450) break;
      el = el.parentElement;
    }
    return el;
  }

  const expanded = new WeakSet();

  function labelOf(el) {
    return (el.innerText || el.textContent || '').trim().split('\n')[0].trim().toLowerCase();
  }

  function trimLeftSidebar() {
    const root = findLeftSidebar();
    if (!root) return;

    // Events lives under "See more", so open that list once
    if (!expanded.has(root) && LEFT_SIDEBAR_KEEP.includes('events') && !root.querySelector('a[href*="/events"]')) {
      const more = [...root.querySelectorAll('[role="button"]')].find((b) => labelOf(b) === 'see more');
      if (more) {
        expanded.add(root);
        more.click();
      }
    }

    // Every piece of text either belongs to a kept link, or gets hidden
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toHide = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest('[data-nf-hidden]')) continue;

      const clickable = el.closest('a, [role="button"], [role="link"]');
      if (clickable && root.contains(clickable)) {
        if (!LEFT_SIDEBAR_KEEP.includes(labelOf(clickable))) toHide.push(clickable);
      } else {
        toHide.push(el); // headings like "Your shortcuts", footer text
      }
    }
    toHide.forEach(hide);

    // Lines and footer
    root.querySelectorAll('hr, [role="separator"], footer, [role="contentinfo"]').forEach(hide);

    // Done once Events is showing (or there's no "See more" left to open): reveal the sidebar
    const waitingForEvents =
      LEFT_SIDEBAR_KEEP.includes('events') &&
      !root.querySelector('a[href*="/events"]') &&
      [...root.querySelectorAll('[role="button"]')].some((b) => labelOf(b) === 'see more');
    if (!waitingForEvents) document.documentElement.classList.add('nf-left-ready');
  }

  // ---- Right column: remove Sponsored and Birthdays ----
  const RIGHT_HEADINGS = ['sponsored', 'birthdays', 'contacts', 'group conversations', 'group chats'];

  function trimRightSidebar() {
    const rail = document.querySelector('[role="complementary"]');
    if (!rail) return;

    // Find the section headings
    const heads = {};
    const walker = document.createTreeWalker(rail, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue.trim().toLowerCase();
      if (RIGHT_HEADINGS.includes(t) && !heads[t] && node.parentElement) heads[t] = node.parentElement;
    }

    const targets = RIGHT_SIDEBAR_REMOVE.filter((k) => heads[k] && !heads[k].closest('[data-nf-hidden]'));
    if (!targets.length) {
      // Nothing left to remove: reveal the column once it has loaded something
      if (Object.keys(heads).length) document.documentElement.classList.add('nf-rail-ready');
      return;
    }

    // The sections all sit side by side inside one container: find it
    const all = Object.values(heads);
    let container = rail;
    if (all.length > 1) {
      let c = all[0];
      while (c && !all.every((h) => c.contains(h))) c = c.parentElement;
      if (c) container = c;
    }

    // Hide each unwanted section (its top-level piece inside that container)
    targets.forEach((k) => {
      let el = heads[k];
      while (el.parentElement && el.parentElement !== container) el = el.parentElement;
      hide(el);
    });

    // Remove divider lines left dangling at the top or doubled up
    let prevWasLineOrNothing = true;
    [...container.children].forEach((child) => {
      if (child.hasAttribute('data-nf-hidden')) return;
      const r = child.getBoundingClientRect();
      if (r.height === 0) return;
      const isLine = r.height <= 4 && !child.textContent.trim();
      if (isLine && prevWasLineOrNothing) hide(child);
      else prevWasLineOrNothing = isLine;
    });
  }

  // ---- Top bar: remove the Video/Reels and Gaming tabs ----
  const TOP_TABS_REMOVE = ['/watch', '/reel', '/video', '/gaming'];

  function trimTopBar() {
    const bar = document.querySelector('[role="banner"]');
    if (!bar) return;
    bar.querySelectorAll('a[href]').forEach((a) => {
      if (a.closest('[data-nf-hidden]')) return;
      let path;
      try { path = new URL(a.href, location.origin).pathname; } catch { return; }
      if (!TOP_TABS_REMOVE.some((p) => path.startsWith(p))) return;
      hide(a.closest('li') || a);
    });
  }

  // ---- Apply (Facebook is a single-page app and re-renders constantly, so keep checking) ----
  function apply() {
    const type = pageType();
    const root = document.documentElement;
    root.classList.toggle('nf-hide', !!type);
    root.classList.toggle('nf-feed', type === 'feed');
    root.classList.toggle('nf-mp', type === 'marketplace');
    root.classList.toggle('nf-home', isHome());

    if (type === 'marketplace') hideMarketplaceColumn();
    else if (document.querySelector('.nf-col-hidden')) unhideAll();

    if (!document.body) return;
    trimTopBar();
    if (isHome()) trimLeftSidebar();
    trimRightSidebar();
  }

  // Run the moment Facebook adds anything, before the browser draws it
  let running = false;
  new MutationObserver(() => {
    if (running) return;
    running = true;
    try { apply(); } finally { running = false; }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Safety net: never leave a sidebar invisible if something on the page changes
  setTimeout(() => {
    document.documentElement.classList.add('nf-left-ready', 'nf-rail-ready');
  }, 4000);

  apply();
  setInterval(apply, 1000);
  window.addEventListener('popstate', apply);
})();
