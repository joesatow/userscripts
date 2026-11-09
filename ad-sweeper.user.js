// ==UserScript==
// @name         Ad Sweeper
// @namespace    ad-sweeper
// @version      1.1
// @description  Catch-all ad cleanup for every site: hides ad slots, sticky ad bars and "ad-free" upsells, mid-article ads, and pop-ups that open on their own (newsletter, giveaway, subscribe). Add #adsweep-off to a page's address to turn it off for that site.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/ad-sweeper.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/ad-sweeper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---- Sites it never touches (web apps where "pop-ups" are real features) ----
  const SKIP_SITES = [
    /(^|\.)mail\.google\.com$/, /(^|\.)docs\.google\.com$/, /(^|\.)drive\.google\.com$/,
    /(^|\.)github\.com$/, /(^|\.)claude\.ai$/,
    /(^|\.)powerbi\.com$/, /(^|\.)fabric\.microsoft\.com$/,
    /(^|\.)office\.com$/, /(^|\.)outlook\.(com|live\.com)$/,
  ];
  if (SKIP_SITES.some((re) => re.test(location.hostname))) return;
  if (window.top !== window && /^about:|^blob:/.test(location.href)) return;

  // ---- Per-site off switch (#adsweep-off / #adsweep-on in the address) ----
  const OFF_KEY = 'adsweep-off';
  try {
    if (location.hash.includes('adsweep-off')) localStorage.setItem(OFF_KEY, '1');
    if (location.hash.includes('adsweep-on')) localStorage.removeItem(OFF_KEY);
    if (localStorage.getItem(OFF_KEY) === '1') return;
  } catch (e) {}

  // ---- Troubleshooting panel (#adsweep-debug, stays on for the tab) ----
  let debugOn = false;
  try {
    if (location.hash.includes('adsweep-debug')) sessionStorage.setItem('adsweep-debug', '1');
    debugOn = sessionStorage.getItem('adsweep-debug') === '1';
  } catch (e) {}
  const debugLines = [];
  let debugBox = null;

  function note(what, el) {
    if (!debugOn || window.top !== window) return;
    const desc = el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '';
    debugLines.push(what + ': ' + desc.slice(0, 90));
    if (debugLines.length > 40) debugLines.shift();
    if (!document.body) return;
    if (!debugBox || !debugBox.isConnected) {
      debugBox = document.createElement('div');
      debugBox.setAttribute('data-adsweep-ui', '');
      debugBox.setAttribute('style', 'position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;max-height:40vh;overflow:auto;' +
        'background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 monospace;padding:6px 8px;border-radius:6px;white-space:pre-wrap;word-break:break-all');
      document.body.appendChild(debugBox);
    }
    debugBox.textContent = '[Ad Sweeper] ' + location.hostname + ' — removed:\n' + debugLines.join('\n');
  }

  // =====================================================================
  // 1. Known ad slots: hidden by style before the page draws (no flash)
  // =====================================================================
  const AD_HOSTS = [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google',
    'amazon-adsystem.com', 'adnxs.com', 'taboola.com', 'outbrain.com', 'criteo.', 'pubmatic.com',
    'rubiconproject.com', 'media.net', 'adsrvr.org', 'moatads.com', 'casalemedia.com', 'openx.net',
    'sharethrough.com', 'teads.tv', 'yieldmo.com', '33across.com', 'adthrive.com', 'raptive.com',
    'mediavine.com', 'ezoic', 'freestar', 'nativo.com', 'revcontent.com', 'mgid.com', 'zergnet.com',
  ];

  // Ad-network names matched anywhere in an element's name. Ad networks also
  // put these names on the page's own body and wrappers (e.g. Raptive adds
  // "adthrive-device-phone" to <body>), so these are never applied to the
  // page itself or to anything holding the headline or article (see the
  // style rules below).
  const BROAD_SELECTORS = [
    // Raptive / AdThrive (common on news, recipe and travel sites)
    '[class*="adthrive"]', '[id*="adthrive"]', '[class*="raptive-"]', '[id^="raptive-"]',
    // Mediavine
    '[id^="mediavine"]', '[class*="mv-sticky"]',
    // Ezoic, Freestar
    '[class*="ezoic-ad"]', '[id^="freestar"]', '[class*="fs-sticky"]',
    // Recommended-content ad widgets
    '[id*="taboola"]', '[class*="taboola"]', '[id*="outbrain"]', '[class*="revcontent"]', '[id*="rcjsload"]',
  ];

  // Exact ad names and ad frames
  const AD_SELECTORS = [
    // Google
    'ins.adsbygoogle', '[id^="div-gpt-ad"]', '[id^="google_ads_iframe"]', '[data-google-query-id]',
    '.mv-ad-box', '#mv-sticky', '.mv-rail-frame', '[id^="ezoic-pub-ad"]', '.ezoic-ad', '.OUTBRAIN',
    // Generic ad names (whole names only, so "download" or "header" never match)
    '[class~="ad"]', '[class~="ads"]', '[class~="advert"]', '[class~="advertisement"]', '[class~="ad-slot"]',
    '[class~="ad-unit"]', '[class~="adunit"]', '[class~="ad-wrapper"]', '[class~="ad-container"]', '[class~="ad-banner"]',
    '[class~="sticky-ad"]', '[class~="adsbox"]', '[class~="ad-placeholder"]', '[class~="advertising"]',
    '[id="ad"]', '[id^="ad-slot"]', '[id^="adslot"]', '[aria-label="Advertisement" i]', '[aria-label="Advertisements" i]',
    '[data-ad-slot]', '[data-adunit]', '[data-ad-unit]', '[data-native-ad]', '[data-ad-placement]',
    // Ad frames
    ...AD_HOSTS.map((h) => `iframe[src*="${h}"]`),
  ];

  const style = document.createElement('style');
  style.setAttribute('data-adsweep-ui', '');
  // Never the page itself, its main area or its article
  const PAGE = 'html, body, main, article, [role="main"]';
  style.textContent = `
    :is(${AD_SELECTORS.join(', ')}):not(${PAGE}) { display: none !important; }
    :is(${BROAD_SELECTORS.join(', ')}):not(${PAGE}):not(:has(h1, main, article, [role="main"])) { display: none !important; }
    [data-adsweep-hidden] { display: none !important; }

    /* Pages freeze scrolling while a pop-up is open; undo that once it's removed */
    html.adsweep-unlock, html.adsweep-unlock body {
      overflow: auto !important; position: static !important; height: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Last check before hiding anything: never the page itself, anything
  // holding the main content, an article or the headline, or anything with
  // a lot of text (ads and pop-ups are short; a page is not)
  function isPageContent(el) {
    if (el.matches(PAGE)) return true;
    if (el.querySelector('main, article, [role="main"]')) return true;
    const len = (el.textContent || '').replace(/\s+/g, ' ').trim().length;
    // A headline plus a fair amount of text is the page; a pop-up can have
    // a big headline but says little
    if (el.querySelector('h1') && len > 800) return true;
    return len > 3000;
  }

  function hide(el, why) {
    if (!el || el === document.body || el === document.documentElement || el.hasAttribute('data-adsweep-ui')) return false;
    if (el.hasAttribute('data-adsweep-hidden')) return false;
    if (isPageContent(el)) return false;
    el.setAttribute('data-adsweep-hidden', '');
    note(why, el);
    return true;
  }

  // =====================================================================
  // Helpers
  // =====================================================================
  const AD_LABEL = /^(advertisement|advertisements|advertising|sponsored|sponsored content|paid content|promoted|ad|ads|story continues below advertisement|article continues below advertisement|continue reading below)$/i;
  const UPSELL = /ad[\s-]?free|remove ads|go ad[\s-]?free|turn off ads|without ads|no ads for|disable (your )?ad ?block|whitelist (us|this site)|ad[\s-]?blocker detected/i;
  const NAG = /subscribe|newsletter|sign up|signup|giveaway|sweepstake|enter to win|join (us|our|now|free)|don['’]t miss|get (the|our) (latest|best)|exclusive|\b\d+% off|special offer|free (gift|trial|ebook|guide)|unlock|stay (in the loop|updated|informed)|be the first|inbox/i;

  const isAdFrame = (f) => {
    const src = (f.getAttribute('src') || '').toLowerCase();
    return AD_HOSTS.some((h) => src.includes(h));
  };

  const AD_SELECTOR_LIST = [...AD_SELECTORS, ...BROAD_SELECTORS].join(',');
  function adMarker(el) {
    if (el.matches && el.matches(AD_SELECTOR_LIST)) return true;
    if (el.querySelector && el.querySelector(AD_SELECTOR_LIST)) return true;
    return [...(el.querySelectorAll ? el.querySelectorAll('iframe') : [])].some(isAdFrame);
  }

  const inFrame = window.top !== window;

  const textLen = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().length;

  // When did you last tap, click or type? Pop-ups opened right after are
  // ones you asked for (menus, photo viewers, share sheets) and are kept.
  let lastInput = 0;
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((t) =>
    window.addEventListener(t, (e) => { if (e.isTrusted) lastInput = Date.now(); }, true));
  const youJustDidSomething = () => Date.now() - lastInput < 1500;

  // =====================================================================
  // 2. Ads marked with a label ("Advertisement", "Sponsored", ...)
  // =====================================================================
  function sweepLabels(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found = [];
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim();
      if (t && t.length <= 45 && AD_LABEL.test(t) && n.parentElement) found.push(n.parentElement);
    }
    for (const label of found) {
      if (label.closest('[data-adsweep-hidden], [data-adsweep-ui], nav')) continue;
      // Climb to the ad's box: a block holding the label plus an ad (frame,
      // ad marker or picture), with little real text in it
      let box = null;
      for (let el = label, i = 0; el && el !== document.body && i < 4; el = el.parentElement, i++) {
        const r = el.getBoundingClientRect();
        if (textLen(el) > 160) break; // that's article text, not an ad box
        // Ad-sized only: not taller than a big ad, and not holding headings
        // or paragraphs (while a page loads, its containers can be nearly
        // empty, and must not be mistaken for an ad box)
        if (r.height > 700) break;
        if (el.querySelector('h1, h2, main, article, nav, header') || el.querySelectorAll('p').length > 2) break;
        if (el !== label && (adMarker(el) || el.querySelector('iframe, ins, img, a[href*="//"]') || r.height >= 50)) box = el;
      }
      if (box) hide(box, 'labelled ad');
    }
  }

  // =====================================================================
  // 3. Sticky bars pinned to the top or bottom edge
  // =====================================================================
  // Ads, ad frames, or "ad-free / remove ads" upsells pinned to an edge.
  // A site's own header or menu bar (no ads, no upsell) is left alone.
  function sweepStickyBars() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const candidates = new Set([
      ...document.querySelectorAll('body > *, body > * > *, [style*="fixed"], [style*="sticky"], [class*="sticky" i], [class*="fixed" i], [class*="banner" i], [class*="bar" i], [id*="sticky" i], [id*="banner" i]'),
    ]);
    for (const el of candidates) {
      if (el.closest('[data-adsweep-hidden], [data-adsweep-ui]')) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.6 || r.height < 20 || r.height > vh * 0.4) continue;
      const atBottom = r.bottom >= vh - 4 && r.top > vh * 0.45;
      const atTop = r.top <= 4 && cs.position === 'fixed';
      const nearBottom = r.bottom >= vh * 0.6 && r.top > vh * 0.45; // e.g. a bar sitting on top of another bottom bar
      if (!atBottom && !atTop && !nearBottom) continue;
      const text = (el.textContent || '').trim();
      if (adMarker(el) || UPSELL.test(text) || (text.length < 30 && el.querySelector('iframe, ins'))) {
        hide(el, 'sticky ad bar');
      }
    }
  }

  // =====================================================================
  // 4. Pop-ups that open on their own
  // =====================================================================
  // A layer pinned over the middle of the screen, on top, wide enough to be
  // a pop-up, that appeared while you weren't tapping anything, and either
  // asks for your email or pushes a subscription, newsletter, giveaway or
  // offer. Its dimmed backdrop goes too.
  const seenModals = new WeakSet();

  // The pop-up layer around this element: the outermost container pinned to
  // the screen ("fixed"), or failing that the nearest screen-sized
  // "absolute" one. Never a wrapper around the whole page (some sites pin
  // their entire page; that must not be mistaken for a pop-up).
  function topLayer(el) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let fixed = null, absolute = null;
    for (let x = el; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
      const p = getComputedStyle(x).position;
      if (p === 'fixed') fixed = x;
      else if (p === 'absolute' && !absolute) {
        const r = x.getBoundingClientRect();
        if (r.width >= vw * 0.5 && r.height >= 120 && r.height <= vh * 1.2) absolute = x;
      }
    }
    return fixed || absolute;
  }

  function sweepPopups() {
    const vw = window.innerWidth, vh = window.innerHeight;
    // Whatever is on top in the middle of the screen
    const points = [[0.5, 0.45], [0.5, 0.3], [0.5, 0.65]];
    let removed = false;
    for (const [fx, fy] of points) {
      const hit = document.elementFromPoint(vw * fx, vh * fy);
      if (!hit || hit === document.body || hit === document.documentElement) continue;
      if (hit.closest('[data-adsweep-ui]')) continue;
      const layer = topLayer(hit);
      if (!layer || seenModals.has(layer)) continue;
      const cs = getComputedStyle(layer);
      const r = layer.getBoundingClientRect();
      if (cs.position !== 'fixed' && !(cs.position === 'absolute' && r.height >= vh * 0.9)) continue;
      if (r.width < vw * 0.5 || r.height < 120) continue;

      // Lots of text means it's the page (or a real dialog), not a pop-up ad
      if (textLen(layer) > 1500) { seenModals.add(layer); continue; }

      // Opened because of something you did: keep it (and don't look again)
      if (youJustDidSomething()) { seenModals.add(layer); continue; }

      const text = layer.textContent || '';
      const asksEmail = !!layer.querySelector('input[type="email"], input[name*="email" i], input[placeholder*="email" i]');
      const pushy = NAG.test(text) || UPSELL.test(text) || adMarker(layer) || layer.matches('[class*="newsletter" i], [id*="newsletter" i], [class*="popup" i], [id*="popup" i], [class*="modal" i][class*="promo" i]');
      if (asksEmail || pushy) {
        if (hide(layer, 'pop-up')) removed = true;
      } else {
        seenModals.add(layer); // something else (a menu, a viewer): leave it
      }
    }

    // Dimmed full-screen backdrops left behind with nothing in them
    if (removed || document.querySelector('[data-adsweep-hidden]')) {
      for (const el of document.querySelectorAll('body > *, body > * > *')) {
        if (el.hasAttribute('data-adsweep-hidden') || el.hasAttribute('data-adsweep-ui')) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
        if (textLen(el) > 20 || el.querySelector('img, video, iframe, input, button, a')) continue;
        if (hide(el, 'pop-up backdrop')) removed = true;
      }
    }

    if (removed) {
      document.documentElement.classList.add('adsweep-unlock');
      // Pages that froze scrolling with a class or inline style on body
      for (const el of [document.documentElement, document.body]) {
        if (el.style.overflow === 'hidden') el.style.overflow = '';
        if (el.style.position === 'fixed') el.style.position = '';
      }
    }
  }

  // =====================================================================
  // 5. Tidy up: boxes left empty once their ad is gone
  // =====================================================================
  function collapseEmptyWrappers() {
    for (const hidden of document.querySelectorAll('[data-adsweep-hidden]')) {
      let parent = hidden.parentElement;
      for (let i = 0; parent && parent !== document.body && i < 2; i++, parent = parent.parentElement) {
        if (parent.hasAttribute('data-adsweep-hidden')) break;
        const visibleKids = [...parent.children].filter((c) => !c.hasAttribute('data-adsweep-hidden') && getComputedStyle(c).display !== 'none');
        const ownText = [...parent.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim());
        if (visibleKids.length || ownText) break;
        const r = parent.getBoundingClientRect();
        if (r.height > 0 && r.height < 1200) hide(parent, 'empty ad space');
      }
    }
  }

  // =====================================================================
  // Running it: a full pass at the start, then the newly added parts,
  // a few times a second at most
  // =====================================================================
  const pendingRoots = new Set();
  let fullPass = true;
  let queued = false;
  let last = 0;

  function runSweep() {
    queued = false;
    last = Date.now();
    if (!document.body) return;
    if (fullPass) {
      fullPass = false;
      sweepLabels(document.body);
    } else {
      for (const root of pendingRoots) if (root.isConnected) sweepLabels(root);
    }
    pendingRoots.clear();
    if (!inFrame) {
      // Inside embedded pages the "screen" is just the frame, so pinned
      // bars and pop-ups only make sense on the main page
      sweepStickyBars();
      sweepPopups();
    }
    collapseEmptyWrappers();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    const wait = Math.max(0, 250 - (Date.now() - last));
    setTimeout(() => requestAnimationFrame(runSweep), wait);
  }

  new MutationObserver((records) => {
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node.nodeType === 1) pendingRoots.add(node);
        else if (node.nodeType === 3 && node.parentElement) pendingRoots.add(node.parentElement);
      }
    }
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Full passes now and then catch things that change without new elements
  setInterval(() => { fullPass = true; schedule(); }, 3000);
  window.addEventListener('load', () => { fullPass = true; schedule(); });
  schedule();
})();
