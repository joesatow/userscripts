// ==UserScript==
// @name         FB Mobile Cleanup
// @namespace    fb-mobile-cleanup
// @version      1.0
// @description  Mobile Facebook without feeds: the home feed, Marketplace browse feed, Reels and Video are replaced by a simple page with Marketplace search and your shortcuts. Nothing from the feed is loaded at all.
// @match        https://m.facebook.com/*
// @match        https://mobile.facebook.com/*
// @match        https://touch.facebook.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/fb-mobile-cleanup.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/fb-mobile-cleanup.user.js
// ==/UserScript==

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
