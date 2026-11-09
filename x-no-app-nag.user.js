// ==UserScript==
// @name         X No App Nag
// @namespace    x-no-app-nag
// @version      1.0
// @description  Logged-out X/Twitter in the browser: stops jumps to the App Store or X app, opens quote tweets and posts as normal pages, and hides "Open app" and login prompts.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/x-no-app-nag.user.js
// ==/UserScript==

// Runs inside X's own page code ("@inject-into page" for the Userscripts app,
// "@grant none" for Tampermonkey), before X's code starts, so it can step in
// before X's app jumps.

(function () {
  'use strict';

  // Addresses that switch to the App Store or the X app
  const APP_LINK = /^(itms-apps?|itms-appss|itmss|twitter|x-com|xcom|intent|market):|apps\.apple\.com|itunes\.apple\.com|app\.link\b|onelink\.me|play\.google\.com|app\.adjust\.com|\/i\/(redirect|app)\b/i;

  // Text of the nag prompts (any capitalization)
  const NAG_TEXT = [
    'open app', 'get the app', 'open the app', 'use the app', 'see more on x', 'see more in the app',
    "don't miss what's happening", 'don’t miss what’s happening', 'log in to x', 'sign up for x',
    'new to x?', 'people on x are the first to know', 'see what’s happening', "see what's happening",
  ];

  function isAppLink(url) {
    return !!url && APP_LINK.test(String(url));
  }

  function note(what, url) {
    try { console.info('[X No App Nag] blocked ' + what + ': ' + url); } catch (e) {}
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

  function openPost(id) {
    location.href = location.origin + '/i/status/' + id;
  }

  // Quote cards usually have no plain link to the quoted post. X attaches
  // the post's data to the page elements (React), so read the post's ID
  // from there: the nearest piece of data that looks like a post and
  // isn't the post this page is already showing.
  function reactFiber(el) {
    for (const k in el) if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) return el[k];
    return null;
  }

  function findPostId(obj, skip, depth, seen) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return null;
    seen.add(obj);
    const id = obj.rest_id || obj.id_str || (obj.legacy && obj.legacy.id_str);
    const looksLikePost = id && /^\d{5,25}$/.test(String(id)) &&
      ('full_text' in obj || 'text' in obj || 'legacy' in obj || 'quoted_status_id_str' in obj || 'user' in obj || 'core' in obj);
    if (looksLikePost && String(id) !== skip) return String(id);
    for (const key of ['tweet', 'quotedTweet', 'quoted_status', 'quoted_status_result', 'result', 'legacy', 'data', 'item', 'content']) {
      const found = findPostId(obj[key], skip, depth + 1, seen);
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
      if (id && id !== currentStatusId() && !/\/(photo|video|analytics|likes|retweets|quotes)\b/.test(a.pathname)) return id;
      return null;
    }
    if (control) return null;

    const here = currentStatusId();

    // A quote card inside a post
    const article = target.closest('article');
    const quote = target.closest('div[role="link"]');
    if (quote && article && article.contains(quote)) {
      const link = quote.querySelector('a[href*="/status/"]');
      const fromLink = link && statusIdFromHref(link.href);
      const outer = postOfArticle(article);
      const id = (fromLink && fromLink !== outer ? fromLink : null) || postIdFromData(quote, outer || here);
      return id && id !== here ? id : null;
    }

    // A whole post (e.g. a reply in a thread)
    if (article) {
      const id = postOfArticle(article);
      return id && id !== here ? id : null;
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

  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
    const id = postForTap(e.target);
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openPost(id);
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

  function hide(el) {
    if (el && el !== document.body && el !== document.documentElement) el.setAttribute('data-xnag-hidden', '');
  }

  // Compare with all apostrophe styles treated the same (’ ‘ ` ´ ')
  const plain = (s) => String(s).toLowerCase().replace(/[’‘`´]/g, "'");
  const NAG_PLAIN = NAG_TEXT.map(plain);

  function hasNagText(el) {
    const t = plain(el.textContent || '');
    return NAG_PLAIN.some((s) => t.includes(s));
  }

  function sweep() {
    if (!document.body) return;

    // "Open app" / "Get the app" buttons and links
    document.querySelectorAll('a, button, [role="button"], [role="link"]').forEach((el) => {
      if (el.hasAttribute('data-xnag-hidden')) return;
      const t = (el.textContent || '').trim().toLowerCase();
      if (t === 'open app' || t === 'get the app' || t === 'open in app' || t === 'use app' || t === 'open the app') hide(el);
    });

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
