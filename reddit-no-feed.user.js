// ==UserScript==
// @name         Reddit No Feed
// @namespace    reddit-no-feed
// @version      1.13
// @description  Hides the Reddit home feed (and Popular / All), plus the Recent Posts card and the Games, Custom Feeds and Recent sidebar sections. Also removes ads (promoted posts, in-comment and sidebar ads) folds up Community highlights, removes Suggested communities, and takes Trending, Trending communities and the AI Ask button out of search.
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

  const FOLD_HIGHLIGHTS = true; // "Community highlights" starts folded up (tap to open)
  const HIDE_SUGGESTED = true; // "Suggested communities" boxes in feeds (kept on the Explore page)
  const SEARCH_NO_TRENDING = true; // no Trending list in the search box
  const SEARCH_NO_ASK = true;      // no AI "Ask" button in the search box
  const HIDE_ADS = true; // promoted posts in feeds, ads in comments and the sidebar

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
  ` + (FOLD_HIGHLIGHTS ? `
    /* Search lists, when they aren't inside the search box's own section */
    #reddit-trending-searches-partial-container [id$="trending_query"],
    #reddit-trending-searches-partial-container [id$="trending_query"] ~ li,
    #reddit-trending-searches-partial-container #subreddit_typeahead_section,
    #reddit-trending-searches-partial-container #subreddit_typeahead_section ~ search-telemetry-tracker,
    .expanded-composer-ask-pill { display: none !important; }

    /* Keep Community highlights out of sight until it's been folded up */
    community-highlight-carousel:not([data-rnf-folded]),
    details:not([data-rnf-folded]) community-highlight-carousel { display: none !important; }
  ` : '') + (HIDE_SUGGESTED ? `
    shreddit-app:not([pagetype="explore"]) in-feed-community-recommendations,
    shreddit-app:not([pagetype="explore"]) in-feed-community-recommendations + hr { display: none !important; }
  ` : '') + (HIDE_ADS ? `
    /* Ads: hidden before they're drawn. The line after an ad goes too, so
       there's no doubled divider where it was. */
    shreddit-ad-post,
    shreddit-comments-page-ad,
    shreddit-comment-tree-ad,
    shreddit-sidebar-ad,
    shreddit-dynamic-ad-link,
    [data-faceplate-tracking-context*='"promoted":true'],
    div[data-before-content="advertisement"],
    .promotedlink,
    .native-ad-container,
    shreddit-ad-post + hr,
    article:has(> shreddit-ad-post),
    article:has(> shreddit-ad-post) + hr { display: none !important; }
  ` : '');
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
      if (HIDE_ADS && (text === 'ad' || text === 'promoted' || text === 'sponsored')) { hideAdPost(el, host); continue; }
      if (FOLD_HIGHLIGHTS && text === 'community highlights') { foldHighlights(el, host); continue; }
      let match = ANYWHERE_SECTIONS.includes(text);
      if (!match && LEFT_SECTIONS.includes(text) && inLeftSidebar(el, host)) match = true;
      if (!match || isProtected(el)) continue;

      const section = host || el.closest(SECTION) || el.parentElement?.parentElement;
      if (section && section !== document.body && !isProtected(section)) section.setAttribute('data-rnf-hidden', '');
    }
  }

  // Backup for ads the style rules miss: a post whose header says "Ad" or
  // "Promoted" (only the small label near the top, never a post's title or text)
  const POST = 'shreddit-post, shreddit-ad-post, article, [data-testid="post-container"], .thing';
  function hideAdPost(el, host) {
    let post = el.closest(POST) || host?.closest(POST);
    if (!post || isProtected(post) || el.closest('h1, h2, h3, [slot="title"], [slot="text-body"], p')) return;
    const pr = post.getBoundingClientRect(), lr = el.getBoundingClientRect();
    if (lr.top - pr.top > 120) return; // not in the post's header
    // the post's own wrapper too, so no empty gap or doubled divider is left
    let box = post;
    while (box.parentElement && box.parentElement.matches('article, faceplate-tracker, shreddit-post') && box.parentElement.childElementCount === 1) box = box.parentElement;
    post = box;
    post.setAttribute('data-rnf-hidden', '');
    const next = post.nextElementSibling;
    if (next && next.matches('hr')) next.setAttribute('data-rnf-hidden', '');
  }

  // ---- Search box: no AI "Ask" button, no Trending lists ----
  // Reddit's search box is built from sealed-off sections (some nested inside
  // others) that page-wide styles can't reach, so a small style rule is put
  // inside each one as it's built. Only the empty-search list is touched:
  // Trending and Trending communities go, your Recent searches stay, and
  // nothing changes once you start typing.
  const ASK_SETTINGS = ['show-ask-button', 'ask-button-variant', 'show-ask-text', 'expanded-composer-enabled', 'expanded-composer-ask-enabled'];
  const SEARCH_HOSTS = 'reddit-search-large, reddit-search-small, faceplate-search-input';
  const LIST = '#reddit-trending-searches-partial-container';
  const SEARCH_CSS = [
    SEARCH_NO_ASK && `
    .expanded-composer-ask-pill,
    rpl-tooltip:has(> .expanded-composer-ask-pill),
    hr.trailing-divider,
    .trailing-content-container,
    faceplate-tracker:has(a[href="/answers/"]) { display: none !important; }`,
    SEARCH_NO_TRENDING && `
    ${LIST} [id$="trending_query"],
    ${LIST} [id$="trending_query"] ~ li,
    ${LIST} div:has(> [icon-name="rising-outline"]),
    ${LIST} > div > search-telemetry-tracker,
    ${LIST} #subreddit_typeahead_section,
    ${LIST} #subreddit_typeahead_section ~ search-telemetry-tracker { display: none !important; }`,
  ].filter(Boolean).join('\n');

  const styledRoots = new WeakSet();
  function styleRoot(root) {
    if (!styledRoots.has(root)) {
      styledRoots.add(root);
      const st = document.createElement('style');
      st.textContent = SEARCH_CSS;
      root.prepend(st);
      // Parts of the search box get built later (when you tap it): handle
      // those the moment they appear, before they're drawn
      new MutationObserver(() => {
        if (!st.isConnected) root.prepend(st); // the section rebuilt itself: put the rule back
        styleInside(root);
      }).observe(root, { childList: true, subtree: true });
    }
    styleInside(root);
  }
  function styleInside(root) {
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) styleRoot(el.shadowRoot);
  }

  function tidySearch() {
    if (SEARCH_NO_ASK) {
      for (const el of document.querySelectorAll(ASK_SETTINGS.map((a) => `[${a}]`).join(','))) {
        if (!el.localName.includes('search')) continue; // only search boxes
        ASK_SETTINGS.forEach((a) => el.removeAttribute(a));
      }
    }
    if (SEARCH_CSS) for (const el of document.querySelectorAll(SEARCH_HOSTS)) if (el.shadowRoot && !styledRoots.has(el.shadowRoot)) styleRoot(el.shadowRoot);
  }

  // Reddit's Community highlights box: press its own fold button once
  // (the button lives inside the box's sealed-off section)
  function foldCarousels() {
    for (const c of document.querySelectorAll('community-highlight-carousel:not([data-rnf-folded])')) {
      const btn = c.shadowRoot && (c.shadowRoot.querySelector('button[aria-expanded]') || c.shadowRoot.querySelector('button'));
      const started = +(c.dataset.rnfSeen || (c.dataset.rnfSeen = Date.now()));
      if (!btn && c.closest('details[data-rnf-folded]')) { c.setAttribute('data-rnf-folded', ''); continue; } // folded as a fold-out already
      if (!btn) {
        // not built yet; after 4s give up and just show it as Reddit made it
        if (Date.now() - started > 4000) c.setAttribute('data-rnf-folded', '');
        continue;
      }
      if (btn.getAttribute('aria-expanded') !== 'false') btn.click();
      c.setAttribute('data-rnf-folded', '');
    }
  }

  // Fold "Community highlights" once per page; opening it yourself sticks
  function foldHighlights(el, host) {
    if (host && host.closest('community-highlight-carousel')) return; // handled by foldCarousels
    const details = el.closest('details') || host?.closest('details');
    if (details) {
      if (details.hasAttribute('data-rnf-folded')) return;
      details.open = false;
      details.setAttribute('data-rnf-folded', '');
      return;
    }
    // Not a standard fold-out: press its own collapse button once
    const toggle = el.closest('button, [role="button"], [aria-expanded]') || host?.closest('button, [role="button"], [aria-expanded]');
    if (!toggle || toggle.hasAttribute('data-rnf-folded')) return;
    toggle.setAttribute('data-rnf-folded', '');
    const btn = toggle.matches('[aria-expanded]') ? toggle : toggle.querySelector('[aria-expanded]') || toggle;
    if (btn.getAttribute('aria-expanded') !== 'false') btn.click();
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
    if (FOLD_HIGHLIGHTS) foldCarousels();
    tidySearch();
    hideSections();
  }

  apply();
  setInterval(apply, 400);
  // Tapping into search: make sure its newest parts are handled at once
  ['pointerdown', 'focusin'].forEach((ev) => document.addEventListener(ev, () => tidySearch(), true));
  // As the page builds: fold the highlights box as soon as it's ready (it
  // stays hidden until then) and tidy the search box, before they're drawn
  {
    let queued = false;
    const ASK_SEL = ASK_SETTINGS.map((x) => `[${x}]`).join(',');
    new MutationObserver((records) => {
      // Right away, before anything new is drawn, but only looking at what's
      // new (re-checking the whole page on every change slows loading)
      let search = false;
      for (const rec of records) {
        if (rec.type === 'attributes') { if (rec.target.localName.includes('search')) search = true; continue; }
        for (const n of rec.addedNodes) {
          if (n.nodeType === 1 && (n.matches(SEARCH_HOSTS) || n.matches(ASK_SEL) || n.querySelector(SEARCH_HOSTS + ',' + ASK_SEL))) { search = true; break; }
        }
        if (search) break;
      }
      if (search) tidySearch();
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (FOLD_HIGHLIGHTS && document.querySelector('community-highlight-carousel:not([data-rnf-folded])')) foldCarousels();
      });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ASK_SETTINGS });
  }
  window.addEventListener('popstate', apply);
})();
