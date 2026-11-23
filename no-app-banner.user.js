// ==UserScript==
// @name         No App Banner
// @namespace    joesatow-no-app-banner
// @version      1.0
// @description  Tries to stop Safari's "Open in the app" bar at the top of sites like GitHub, X and YouTube by removing the apple-itunes-app tag that asks Safari to show it. Phone only.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @inject-into  content
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/no-app-banner.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/no-app-banner.user.js
// ==/UserScript==

// Safari shows its Smart App Banner when a page has <meta name="apple-itunes-app">.
// This removes that tag the moment it appears. Safari may read the tag before the
// script gets to run, in which case the bar can still show on some page loads.
(function () {
  'use strict';

  const SELECTOR = 'meta[name="apple-itunes-app" i]';

  function sweep(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(SELECTOR).forEach((m) => m.remove());
  }

  sweep(document);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches(SELECTOR)) node.remove();
        else if (node.firstElementChild) sweep(node);
      }
    }
  });
  observer.observe(document.documentElement || document, { childList: true, subtree: true });

  // The tag lives in <head>, so once the page has loaded there is nothing left to watch for.
  window.addEventListener('load', () => {
    sweep(document);
    setTimeout(() => observer.disconnect(), 3000);
  }, { once: true });
})();
