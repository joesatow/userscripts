// ==UserScript==
// @name         X No App Nag
// @namespace    x-no-app-nag
// @version      1.3
// @description  Logged-out X/Twitter in the browser: stops jumps to the App Store or X app, opens quote tweets and posts as normal pages, and hides "Open app" and login prompts.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @run-at       document-start
// @inject-into  auto
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      cdn.syndication.twimg.com
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js
// ==/UserScript==

// X's security settings block scripts from running inside its page code in
// Safari, so in the Userscripts app this runs in the app's own separate
// space. From there it can still hide the nags and catch your taps before
// X's code sees them. To find which post a quote card shows, it asks X's
// public embed service (the one embedded tweets on other sites use).

(function () {
  'use strict';

  // Addresses that switch to the App Store or the X app
  const APP_LINK = /^(itms-apps?|itms-appss|itmss|twitter|x-com|xcom|intent|market):|apps\.apple\.com|itunes\.apple\.com|app\.link\b|onelink\.me|play\.google\.com|app\.adjust\.com|\/i\/(redirect|app)\b/i;

  // Text of the nag prompts (any capitalization)
  const NAG_TEXT = [
    'open app', 'get the app', 'open the app', 'use the app', 'see more on x', 'see more in the app',
    'see this post in the app', 'view in the app', 'continue in the app', 'in the app', 'open x',
    "don't miss what's happening", 'don’t miss what’s happening', 'log in to x', 'sign up for x',
    'new to x?', 'people on x are the first to know', 'see what’s happening', "see what's happening",
  ];

  function isAppLink(url) {
    return !!url && APP_LINK.test(String(url));
  }

  // ---- Troubleshooting panel: add #xnag-debug to the address ----
  let debugOn = false;
  try {
    if (location.hash.includes('xnag-debug')) sessionStorage.setItem('xnag-debug', '1');
    debugOn = sessionStorage.getItem('xnag-debug') === '1';
  } catch (e) {}
  const debugLines = [];
  let debugBox = null;

  function showDebug() {
    if (!debugOn || !document.body) return;
    if (!debugBox || !debugBox.isConnected) {
      debugBox = document.createElement('div');
      debugBox.setAttribute('data-xnag-ui', '');
      debugBox.setAttribute('style', 'position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;max-height:35vh;overflow:auto;' +
        'background:rgba(0,0,0,.85);color:#9f9;font:11px/1.35 monospace;padding:6px 8px;border-radius:6px;white-space:pre-wrap;word-break:break-all;pointer-events:none');
      document.body.appendChild(debugBox);
    }
    debugBox.textContent = '[X No App Nag] running on ' + location.pathname + '\n' + (debugLines.join('\n') || 'nothing blocked yet');
  }

  function note(what, url) {
    try { console.info('[X No App Nag] blocked ' + what + ': ' + url); } catch (e) {}
    if (!debugOn) return;
    debugLines.push(what + ': ' + String(url || '').slice(0, 100));
    if (debugLines.length > 25) debugLines.shift();
    showDebug();
  }

  // =====================================================================
  // 1. Stop jumps to the App Store / X app
  // =====================================================================

  // Pop-ups
  const realOpen = window.open;
  window.open = function (url) {
    if (isAppLink(url)) { note('pop-up', url); return null; }
    return realOpen.apply(window, arguments);
  };

  // Links: tapped for real, or "clicked" from code
  function appLinkFrom(el) {
    const a = el && el.closest && el.closest('a[href]');
    return a && isAppLink(a.getAttribute('href')) ? a : null;
  }

  window.addEventListener('click', (e) => {
    const a = appLinkFrom(e.target);
    if (!a) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    note('link', a.href);
  }, true);

  const realClick = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () {
    const a = appLinkFrom(this);
    if (a) { note('scripted link', a.href); return; }
    return realClick.apply(this, arguments);
  };

  // Hidden embedded pages pointed at the app (an old trick for opening apps)
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  if (srcDesc && srcDesc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      enumerable: srcDesc.enumerable,
      get() { return srcDesc.get.call(this); },
      set(v) {
        if (isAppLink(v)) { note('app frame', v); return; }
        srcDesc.set.call(this, v);
      },
    });
  }

  // Where the browser supports it, stop this tab being sent to the App Store
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', (e) => {
      const url = e.destination && e.destination.url;
      if (isAppLink(url) && e.cancelable) {
        e.preventDefault();
        note('redirect', url);
      }
    });
  }

  // =====================================================================
  // 2. Open quote tweets and posts as normal pages
  // =====================================================================
  // Logged out, X intercepts taps on quote tweets and posts and tries to
  // push you into the app. Taking over the tap and loading the post's
  // address directly works, because X shows single posts to logged-out
  // visitors.

  const STATUS_PATH = /^\/[A-Za-z0-9_]{1,15}\/status\/(\d{5,25})|^\/i\/(?:web\/)?status\/(\d{5,25})/;

  function statusIdFromHref(href) {
    try {
      const u = new URL(href, location.href);
      if (!/(^|\.)(x|twitter)\.com$/i.test(u.hostname)) return null;
      const m = u.pathname.match(STATUS_PATH);
      return m ? m[1] || m[2] : null;
    } catch (e) {
      return null;
    }
  }

  function currentStatusId() {
    const m = location.pathname.match(STATUS_PATH);
    return m ? m[1] || m[2] : null;
  }

  // Open a post at its normal address (x.com/name/status/123), the same kind
  // shared links use. The short form without the name (x.com/i/status/123)
  // can be sent on to the App Store for logged-out phone visitors, so it's
  // only used when the name truly isn't known.
  function openPost(id, handle) {
    const name = handle && /^[A-Za-z0-9_]{1,15}$/.test(handle) && handle.toLowerCase() !== 'i' ? handle : null;
    location.href = location.origin + (name ? '/' + name : '/i') + '/status/' + id;
  }

  // The account name in a post address, if it has one
  function handleFromHref(href) {
    try {
      const m = new URL(href, location.href).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\//);
      return m && m[1].toLowerCase() !== 'i' ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  // Quote cards usually have no plain link to the quoted post. X attaches
  // the post's data to the page elements (React), so read the post's ID
  // from there: the nearest piece of data that looks like a post and
  // isn't the post this page is already showing.
  function reactFiber(el) {
    for (const k in el) if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return el[k];
    return null;
  }

  // Something that is clearly a post (not a user account, which also has
  // an ID): it has post text, or says it's a Tweet
  function postIdOf(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const id = obj.rest_id || obj.id_str || (obj.legacy && obj.legacy.id_str);
    if (!id || !/^\d{5,25}$/.test(String(id))) return null;
    const isPost = obj.__typename === 'Tweet' || obj.__typename === 'TweetWithVisibilityResults' ||
      'full_text' in obj || (obj.legacy && 'full_text' in obj.legacy) ||
      ('text' in obj && ('user' in obj || 'author' in obj)) || 'quoted_status_id_str' in obj;
    if (!isPost || 'screen_name' in obj || (obj.legacy && 'screen_name' in obj.legacy)) return null;
    return String(id);
  }

  // Search the data: likely keys first, then everything else, a few levels deep
  const LIKELY_KEYS = ['quotedTweet', 'quoted_status', 'quoted_status_result', 'quotedStatus', 'tweet', 'result', 'legacy', 'data', 'item', 'content', 'status'];
  function findPostId(obj, skip, depth, seen) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj) || obj instanceof Node) return null;
    seen.add(obj);
    const own = postIdOf(obj);
    if (own && own !== skip) return own;
    const keys = [...LIKELY_KEYS.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !LIKELY_KEYS.includes(k)).slice(0, 40)];
    for (const key of keys) {
      if (key === 'children' || key.startsWith('_') || key === 'ref') continue;
      let v;
      try { v = obj[key]; } catch (e) { continue; }
      const found = findPostId(v, skip, depth + 1, seen);
      if (found) return found;
    }
    return null;
  }

  function postIdFromData(el, skip) {
    let fiber = reactFiber(el);
    for (let i = 0; fiber && i < 25; i++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        // A link prop (some X components carry the address directly)
        const link = props.link || props.href || (props.to && (props.to.pathname || props.to));
        if (typeof link === 'string') {
          const fromLink = statusIdFromHref(link);
          if (fromLink && fromLink !== skip) return fromLink;
        }
        const found = findPostId(props, skip, 0, new WeakSet());
        if (found) return found;
      }
    }
    return null;
  }

  // Which post a tap belongs to, or null to leave the tap alone
  function postForTap(target) {
    if (!target || !target.closest) return null;

    // Taps on real controls (buttons, menus, pictures, videos, profile
    // links) are left to X
    const control = target.closest('button, [role="button"], [data-testid="tweetPhoto"], video, [data-testid="videoPlayer"], [data-testid="User-Name"] a, a[href]:not([href*="/status/"])');

    // A plain link to a post: load it as a normal page
    const a = target.closest('a[href*="/status/"]');
    if (a) {
      const id = statusIdFromHref(a.href);
      if (id && id !== currentStatusId() && !/\/(photo|video|analytics|likes|retweets|quotes)\b/.test(a.pathname)) {
        return { id, handle: handleFromHref(a.href) };
      }
      return null;
    }
    if (control) return null;

    const here = currentStatusId();

    // A quote card inside a post. If its post can't be found right away,
    // hand back what's needed to look it up (the tap is blocked either way,
    // so X's "see this post in the app" box never opens).
    const article = target.closest('article');
    const quote = target.closest('div[role="link"]');
    if (quote && article && article.contains(quote)) {
      const link = quote.querySelector('a[href*="/status/"]');
      const fromLink = link && statusIdFromHref(link.href);
      const outer = postOfArticle(article) || here;
      // The quoted account's name, as shown on the card ("@lamba85")
      const handle = (link && handleFromHref(link.href)) || handleShownIn(quote);
      const id = (fromLink && fromLink !== outer ? fromLink : null) || postIdFromData(quote, outer);
      if (id && id !== here) return { id, handle };
      return { lookup: true, outer, handle };
    }

    // A whole post (e.g. a reply in a thread)
    if (article) {
      const id = postOfArticle(article);
      return id && id !== here ? { id, handle: handleOfArticle(article) } : null;
    }
    return null;
  }

  // The "@name" shown on a card: a piece of text that is exactly "@name"
  // (the card's text runs together, so "@lamba85" and "16h" can touch)
  function handleShownIn(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const m = n.nodeValue.trim().match(/^@([A-Za-z0-9_]{1,15})$/);
      if (m) return m[1];
    }
    return null;
  }

  // A post's account name, from its timestamp link
  function handleOfArticle(article) {
    for (const t of article.querySelectorAll('a[href*="/status/"] time')) {
      if (article.querySelector('div[role="link"]')?.contains(t)) continue;
      const h = handleFromHref(t.closest('a').href);
      if (h) return h;
    }
    return null;
  }

  // A post's own ID: from its timestamp link, or from X's data
  function postOfArticle(article) {
    for (const t of article.querySelectorAll('a[href*="/status/"] time')) {
      // Skip timestamps inside a quote card
      if (t.closest('div[role="link"]') && article.querySelector('div[role="link"]')?.contains(t)) continue;
      const id = statusIdFromHref(t.closest('a').href);
      if (id) return id;
    }
    return postIdFromData(article, null);
  }

  // ---- Asking X's public embed service which post a post quotes ----
  const gmRequest =
    (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest) ? (d) => GM.xmlHttpRequest(d) :
    (typeof GM_xmlhttpRequest === 'function') ? (d) => GM_xmlhttpRequest(d) :
    null;

  // The embed service wants a small token worked out from the post's ID
  function embedToken(id) {
    return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
  }

  function quotedPostOf(outerId) {
    return new Promise((resolve) => {
      if (!gmRequest || !outerId) return resolve(null);
      gmRequest({
        method: 'GET',
        url: 'https://cdn.syndication.twimg.com/tweet-result?id=' + outerId + '&lang=en&token=' + embedToken(outerId),
        timeout: 8000,
        onload: (r) => {
          try {
            const data = JSON.parse(r.responseText);
            const q = data && (data.quoted_tweet || (data.quoted_status_result && data.quoted_status_result.result));
            const id = q && (q.id_str || q.rest_id);
            // The quoted account's name, so the normal address can be used
            const handle = q && ((q.user && q.user.screen_name) ||
              (q.core && q.core.user_results && q.core.user_results.result &&
               ((q.core.user_results.result.legacy && q.core.user_results.result.legacy.screen_name) ||
                (q.core.user_results.result.core && q.core.user_results.result.core.screen_name)))) || null;
            resolve(id && /^\d+$/.test(id) ? { id: String(id), handle } : null);
          } catch (e) { resolve(null); }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
    const found = postForTap(e.target);
    if (!found) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!found.lookup) return openPost(found.id, found.handle);

    // A quote card whose post isn't on the page: look it up, then open it.
    // If that fails, open the quoted person's profile instead.
    note('looking up quoted post of', found.outer);
    quotedPostOf(found.outer).then((q) => {
      if (q && q.id !== currentStatusId()) openPost(q.id, q.handle || found.handle);
      else if (found.handle) location.href = location.origin + '/' + found.handle;
      else note('could not find quoted post for', found.outer);
    });
  }, true);

  // =====================================================================
  // 3. Hide "Open app" and login prompts; keep the page scrollable
  // =====================================================================
  const style = document.createElement('style');
  style.textContent = `
    [data-testid="BottomBar"],
    [data-testid="TopNavBar"] a[href*="apps.apple.com"],
    a[href*="apps.apple.com"], a[href^="itms-apps:"], a[href^="twitter:"],
    [data-xnag-hidden] { display: none !important; }

    /* X freezes scrolling while a login prompt is open */
    html.xnag-unlock, html.xnag-unlock body { overflow: auto !important; overscroll-behavior: auto !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Returns true if it hid something new
  function hide(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.hasAttribute('data-xnag-hidden') || el.hasAttribute('data-xnag-ui')) return false;
    el.setAttribute('data-xnag-hidden', '');
    return true;
  }

  const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);

  // Compare with all apostrophe styles treated the same (’ ‘ ` ´ ')
  const plain = (s) => String(s).toLowerCase().replace(/[’‘`´]/g, "'");
  const NAG_PLAIN = NAG_TEXT.map(plain);

  function hasNagText(el) {
    const t = plain(el.textContent || '');
    return NAG_PLAIN.some((s) => t.includes(s));
  }

  // "Open app" style buttons, found by their text on any kind of element
  const APP_BUTTON = /^(open app|open x|get the app|open in app|open in the app|use app|use the app|open the app)$/i;

  // The pinned layer (pop-up) around an element: its outermost "fixed"
  // container, unless that's something huge holding the page itself
  function pinnedLayer(el) {
    let layer = null;
    for (let x = el; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
      if (getComputedStyle(x).position === 'fixed') layer = x;
    }
    if (layer && (layer.textContent || '').length > 1500) return null;
    return layer;
  }

  function sweep() {
    if (!document.body) return;
    showDebug();

    // "Open app" / "Open X" buttons (the button itself, or its clickable wrapper)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    const buttons = [];
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim();
      if (t.length <= 20 && APP_BUTTON.test(t) && n.parentElement && !n.parentElement.closest('[data-xnag-hidden], [data-xnag-ui], article')) buttons.push(n.parentElement);
    }
    for (const el of buttons) {
      // The whole button: its clickable wrapper, or else the largest small
      // box around the words that holds nothing but them (so no empty
      // pill is left behind)
      let target = el.closest('a, button, [role="button"], [role="link"]');
      if (!target) {
        const words = el.textContent.trim();
        target = el;
        for (let x = el.parentElement; x && x !== document.body; x = x.parentElement) {
          if (x.textContent.trim() !== words || x.getBoundingClientRect().height > 80) break;
          target = x;
        }
      }
      // Inside an "in the app" pop-up: remove the whole pop-up instead
      const layer = pinnedLayer(target);
      if (layer && hasNagText(layer) && !layer.querySelector('article')) { if (hide(layer)) note('app pop-up', textOf(layer)); }
      else if (hide(target)) note('app button', textOf(target));
    }

    // "See this post in the app" and similar boxes, wherever X puts them
    for (const el of document.querySelectorAll('div, section, aside')) {
      if (el.children.length > 30 || el.closest('[data-xnag-hidden], [data-xnag-ui], article')) continue;
      const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join(' ');
      if (!own.trim()) continue;
      if (!/see this post in the app|use the app to|see more in the app|continue in the app|view in the app/i.test(own)) continue;
      const layer = pinnedLayer(el);
      if (layer && hide(layer)) { note('app pop-up', textOf(layer)); document.documentElement.classList.add('xnag-unlock'); }
    }

    // Login / app pop-ups. X puts its pop-ups in a "layers" area; anything
    // there that's a sheet or dialog and talks about logging in or the app
    // goes, along with its dimmed backdrop.
    const layers = document.getElementById('layers');
    const dialogs = document.querySelectorAll(
      '[data-testid="sheetDialog"], [role="dialog"], [aria-modal="true"], [data-testid="app-bar-close"]'
    );
    let removed = false;
    dialogs.forEach((d) => {
      if (d.closest('[data-xnag-hidden]') || !hasNagText(d)) return;
      // Hide the whole pop-up layer (backdrop included) when it's in #layers
      let box = d;
      if (layers && layers.contains(d)) {
        while (box.parentElement && box.parentElement !== layers) box = box.parentElement;
      }
      hide(box);
      removed = true;
    });

    // Bottom banners asking you to log in or sign up
    document.querySelectorAll('div[style*="position: fixed"], div[style*="bottom: 0"]').forEach((el) => {
      if (el.hasAttribute('data-xnag-hidden') || el.closest('article')) return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < window.innerHeight * 0.5 && r.bottom >= window.innerHeight - 4 && hasNagText(el)) {
        hide(el);
        removed = true;
      }
    });

    if (removed || document.documentElement.style.overflow === 'hidden') {
      document.documentElement.classList.add('xnag-unlock');
    }
  }

  // X's pages change constantly while scrolling, so check at most about
  // five times a second (each check waits for the next screen redraw)
  let queued = false;
  let last = 0;
  function schedule() {
    if (queued) return;
    queued = true;
    const wait = Math.max(0, 200 - (Date.now() - last));
    setTimeout(() => requestAnimationFrame(() => {
      queued = false;
      last = Date.now();
      sweep();
    }), wait);
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(schedule, 1000);
})();
