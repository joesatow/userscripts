// ==UserScript==
// @name         Facebook
// @namespace    joesatow-facebook
// @version      2.0
// @description  Facebook without feeds. On the full site: hides the home feed and Marketplace browse feed, trims the left sidebar, removes Sponsored and Birthdays. On the mobile site: the home feed, Marketplace browse feed, Reels and Video are replaced by a simple page with Marketplace search and your shortcuts.
// @match        https://www.facebook.com/*
// @match        https://web.facebook.com/*
// @match        https://m.facebook.com/*
// @match        https://mobile.facebook.com/*
// @match        https://touch.facebook.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/facebook.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/facebook.user.js
// ==/UserScript==

// One script for both: the computer version runs on the full site, the phone
// version on the mobile site (m.facebook.com, mobile.facebook.com, touch.facebook.com).
const __onMobileSite = ['m.facebook.com', 'mobile.facebook.com', 'touch.facebook.com'].includes(location.hostname);

if (!__onMobileSite) {
// ======================= Computer site =======================
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
} else {
// ======================= Mobile site =======================
(function () {
  'use strict';

  // ---- Settings ----
  const BLOCK_HOME_FEED = true;
  const BLOCK_MARKETPLACE_FEED = true;
  const BLOCK_REELS_AND_VIDEO = true;

  // Shortcuts shown on the replacement page (label, link)
  const SHORTCUTS = [
    ['Groups', '/groups/'],
    ['Saved', '/saved/'],
    ['Events', '/events/'],
    ['Notifications', '/notifications/'],
    ['Marketplace inbox', '/marketplace/inbox/'],
    ['Your listings', '/marketplace/you/selling/'],
    ['Menu', '/bookmarks/'],
  ];

  // Marketplace pages that are NOT feeds (always allowed)
  const MARKETPLACE_ALLOWED =
    /\/(search|item|you|inbox|create|notifications|saved|selling|buying|profile)(\/|$)/;

  // ---- Which pages get replaced ----
  function blockedKind() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(location.search);

    if (BLOCK_HOME_FEED && (path === '/' || path === '/home.php')) return 'home';

    if (BLOCK_REELS_AND_VIDEO) {
      if (path === '/reels' || path === '/reel') return 'home';
      if (path.startsWith('/watch') && !params.has('v')) return 'home';
    }

    if (BLOCK_MARKETPLACE_FEED && path.startsWith('/marketplace')) {
      if (params.has('query')) return null;
      if (MARKETPLACE_ALLOWED.test(path)) return null;
      return 'marketplace';
    }
    return null;
  }

  // ---- The replacement page ----
  // Stopping the page before Facebook's code runs means the feed is never
  // downloaded, so there is nothing to flash and nothing loading in the background.
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function replacementPage(kind) {
    const links = SHORTCUTS.map(
      ([label, href]) => `<a class="tile" href="${esc(href)}">${esc(label)}</a>`
    ).join('');

    const fbSearch = kind === 'home' ? `
      <form action="/search/top/" method="get">
        <input name="q" type="search" placeholder="Search Facebook" autocomplete="off">
      </form>` : '';

    return `
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Facebook</title>
        <style>
          :root { color-scheme: dark; }
          body {
            margin: 0; padding: 20px 16px 40px;
            background: #18191a; color: #e4e6eb;
            font: 16px/1.4 system-ui, -apple-system, Roboto, sans-serif;
          }
          h1 { font-size: 22px; margin: 4px 0 18px; color: #fff; }
          form { margin: 0 0 12px; }
          input {
            width: 100%; box-sizing: border-box;
            padding: 14px 16px; border: 0; border-radius: 24px;
            background: #3a3b3c; color: #e4e6eb; font-size: 16px;
          }
          input::placeholder { color: #b0b3b8; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; }
          .tile {
            display: block; padding: 16px 14px; border-radius: 12px;
            background: #242526; color: #e4e6eb; text-decoration: none; font-weight: 600;
          }
          .tile:active { background: #3a3b3c; }
        </style>
      </head>
      <body>
        <h1>${kind === 'marketplace' ? 'Marketplace' : 'Facebook'}</h1>
        <form action="/marketplace/search/" method="get">
          <input name="query" type="search" placeholder="Search Marketplace" autocomplete="off"
                 ${kind === 'marketplace' ? 'autofocus' : ''}>
        </form>
        ${fbSearch}
        <div class="grid">${links}</div>
      </body>`;
  }

  function takeOver(kind) {
    window.stop();
    document.documentElement.innerHTML = replacementPage(kind);
  }

  // ---- On a fresh page load: replace before Facebook starts ----
  const kindAtLoad = blockedKind();
  if (kindAtLoad) {
    takeOver(kindAtLoad);
    return;
  }

  // ---- Facebook switches pages without reloading, so watch the address ----
  // If it moves to a blocked page, reload so the replacement can step in first.
  // Hide the page meanwhile so the feed never shows.
  const style = document.createElement('style');
  style.textContent = 'html.nfm-leaving body { visibility: hidden !important; }';
  (document.head || document.documentElement).appendChild(style);

  let lastUrl = location.href;
  function check() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (!blockedKind()) return;

    // Loop guard: never reload the same address twice in a row
    let last = '';
    try { last = sessionStorage.getItem('nfm-reload') || ''; } catch (e) {}
    if (last === location.href) return;
    try { sessionStorage.setItem('nfm-reload', location.href); } catch (e) {}

    document.documentElement.classList.add('nfm-leaving');
    location.reload();
  }

  try { sessionStorage.removeItem('nfm-reload'); } catch (e) {}
  setInterval(check, 150);
  window.addEventListener('popstate', check);
})();
}
