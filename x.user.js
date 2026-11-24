// ==UserScript==
// @name         X
// @namespace    joesatow-x
// @version      2.8
// @description  Logged-in X/Twitter without the feeds: hides the Home timeline, the Explore page's trends and tabs, the sidebar's What's happening, Who to follow and Premium boxes, and the "Discover more" posts under threads. Posts people send you, search, notifications and messages work as normal.
// @match        https://x.com/*
// @match        https://mobile.x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @run-at       document-start
// @inject-into  content
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
  const SHOW_FEED_BUTTON = false;  // a "Show feed" button under the note (off: the feed can't be opened)
  const HIDE_CLICKBAIT = true;     // when you show the feed: fold up cliffhanger / engagement-bait posts
  const FOLD_CUT_OFF = true;       // posts X cuts short with "Read more" / "Show more" count as clickbait
  const CAPTIONS_OFF = true;       // videos start with captions off (tap CC to turn them on)
  const KEEP_TABS = ['for you', 'following']; // Home's top tabs to keep (the rest go)

  // Clickbait checks (a post's text, any capitalization). A post is folded
  // into a "Hidden: looks like clickbait" bar you can tap to open.
  // 1. Ends on a cliffhanger: "...", "…", or pointing down at a thread
  const BAIT_ENDINGS = /(\.\.\.|…|👇+|⬇️+|🧵+|\(thread\)|a thread:?|thread:|read more:?|here'?s (what|why|how)( happened)?:?|the answer:?|story time:?)\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*$/iu;
  // 2. Bait phrases anywhere in the text
  const BAIT_PHRASES = [
    "you won't believe", 'you won’t believe', 'what happened next', 'what he said next', 'what she said next',
    'then i asked', 'then he said', 'then she said', 'then they said', 'wait for it', 'wait till the end',
    'watch till the end', 'watch until the end', 'nobody is talking about', 'no one is talking about',
    'will shock you', 'blew my mind', 'i was today years old', 'read that again', 'let that sink in',
    "most people don't know", 'most people don’t know', 'most people have no idea', 'bookmark this',
    'save this for later', 'like and repost', 'like & repost', 'rt if you', 'repost if you', 'like if you',
    'comment below', 'drop a ', 'reply with', "here's the crazy part", 'here’s the crazy part',
    'the ending is', 'turned out to be', 'this changes everything', 'is going viral', 'went viral',
    "i'll wait", 'i’ll wait', 'thread below', 'a short thread', 'long thread',
    'the first sign', 'the first one is', 'number one is', 'the biggest sign', 'the real reason is',
    'the reason is simple', 'here is why', 'here is what', 'here is how',
  ];
  // 4. Ends on a colon with nothing after it ("The first sign is this:"),
  //    unless the post has a photo, video, link card or quoted post to point at
  const BAIT_COLON = /[\p{L}\p{N})"'”’]\s*:\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*$/u;
  // 3. List-style teasers: "7 ways to…", "12 things I learned…"
  const BAIT_LISTICLE = /^\s*\d{1,2}\s+(ways|things|tips|reasons|lessons|habits|signs|secrets|mistakes|rules|books|tools|questions)\b/i;

  // Sidebar boxes to remove, matched by their heading (any capitalization)
  const SIDEBAR_HEADINGS = [
    "what's happening", 'what’s happening', 'who to follow', 'you might like',
    'subscribe to premium', 'trending now', "today's news", 'today’s news',
    'live on x', 'trends for you', 'explore',
  ];
  // Headings that start the recommended posts under a thread
  const DISCOVER_HEADINGS = ['discover more'];

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
  // The home timeline is labelled the same wherever it appears. This rule is
  // on for every page except a single post, so a post someone sends you can
  // never be caught by it.
  const HOME_TIMELINE_CSS = HIDE_HOME
    // Only the exact "Timeline: Your Home Timeline" label: X also labels the
    // whole main column "Home timeline" on every page (profiles, posts), so a
    // looser match blanks those pages
    ? `div[aria-label^="Timeline: Your Home Timeline" i] { display: none !important; }`
    : '';
  // Rules for the page you're on; swapped in as you move around X
  const PAGE_CSS = {
    home: [
      `${PRIMARY} section,`,
      `${PRIMARY} [role="tablist"],`,
      `[data-xnf-tab], [data-xnf-pill],`,
      `${PRIMARY} [data-testid="cellInnerDiv"] { display: none !important; }`,
    ].join('\n'),
    // Home with the feed shown: only the extra tabs go
    homeShown: `[data-xnf-tab="other"] { display: none !important; }`,
    explore: [
      `${PRIMARY} section,`,
      `${PRIMARY} [role="tablist"] { display: none !important; }`,
    ].join('\n'),
  };
  css.push(
    `#xnf-feedbox { padding: 40px 24px; text-align: center; font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: rgb(113, 118, 123); }`,
    `#xnf-feedbox button, #xnf-hidefeed { font: 600 15px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; border-radius: 999px; cursor: pointer; }`,
    `#xnf-feedbox button { margin-top: 16px; padding: 10px 20px; border: 1px solid rgb(83, 100, 113); background: transparent; color: rgb(29, 155, 240); }`,
    `#xnf-hidefeed { position: fixed; z-index: 2147483000; left: 12px; bottom: 76px; padding: 9px 14px; border: 0;`,
    `  background: rgba(39, 44, 48, .92); color: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.4); }`,
    `@media (min-width: 700px) { #xnf-hidefeed { bottom: 20px; left: auto; right: 20px; } }`,
    // A clickbait post: its contents are hidden and the cell shows a thin bar instead
    `[data-xnf-bait]:not([data-xnf-open]) > * { display: none !important; }`,
    `[data-xnf-bait]:not([data-xnf-open])::before { content: "Hidden: looks like clickbait \\00b7  tap to show"; display: block; cursor: pointer;`,
    `  padding: 10px 16px; font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: rgb(113, 118, 123);`,
    `  border-bottom: 1px solid rgba(113, 118, 123, .3); }`
  );
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

  // A single post (what a shared link opens): nothing on these pages is hidden
  // except the "Discover more" posts after the thread
  function isPostPath(p) {
    return /\/status(es)?\/\d+/.test(p);
  }

  // ---- Which page we're on (X changes pages without reloading) ----
  let lastPath = null;
  let page = '';
  // "Show feed" lasts until you close the tab (or tap "Hide feed")
  let feedShown = false;
  try {
    if (SHOW_FEED_BUTTON) feedShown = sessionStorage.getItem('xnf-feed') === '1';
    else sessionStorage.removeItem('xnf-feed');
  } catch (e) {}
  function setFeedShown(on) {
    feedShown = on;
    try { on ? sessionStorage.setItem('xnf-feed', '1') : sessionStorage.removeItem('xnf-feed'); } catch (e) {}
    updatePage(true);
    sweep();
    if (on) window.scrollTo(0, 0);
  }

  function updatePage(force) {
    const html = document.documentElement;
    if (!html) return;
    addStyle();
    const p = location.pathname.replace(/\/+$/, '') || '/';
    if (!force && p === lastPath && html.classList.contains('xnf-ready')) return;
    lastPath = p;
    page = isPostPath(p) ? 'post'
      : (p === '/home' || p === '/') ? 'home'
      : /^\/explore(\/|$)/.test(p) ? 'explore' : '';
    let want = '';
    if (page === 'home' && HIDE_HOME && feedShown) {
      want = PAGE_CSS.homeShown;
    } else if (page !== 'post') {
      want = HOME_TIMELINE_CSS;
      if ((page === 'home' && HIDE_HOME) || (page === 'explore' && HIDE_EXPLORE)) want += '\n' + PAGE_CSS[page];
      if (page === 'home') want += '\n' + PAGE_CSS.homeShown;
    }
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
    const tl = document.querySelector('div[aria-label^="Timeline: Your Home Timeline" i]');
    const labels = [...document.querySelectorAll(`${PRIMARY} [aria-label^="Timeline" i]`)].map(e => e.getAttribute('aria-label')).slice(0, 3);
    const msg = `X script ${GM_VERSION} running\npage: ${location.pathname} (${page || 'other'})\n` +
      `primaryColumn: ${!!document.querySelector(PRIMARY)}  home timeline: ${!!tl}\n` +
      `timelines: ${labels.join(' | ') || 'none'}\ncells: ${document.querySelectorAll('[data-testid="cellInnerDiv"]').length}` +
      captionDebug();
    if (debugBox.textContent !== msg) debugBox.textContent = msg; // only when changed, or it would keep re-triggering itself
  }
  const GM_VERSION = '2.8';

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

  // The post the address points to (never hidden)
  function isFocalCell(cell) {
    const m = location.pathname.match(/\/status(?:es)?\/(\d+)/);
    if (!m) return false;
    if (cell.querySelector('article[tabindex="-1"]')) return true;
    for (const a of cell.querySelectorAll('a[href*="/status/"]')) {
      if (new RegExp('/status/' + m[1] + '(?:$|[/?#])').test(a.getAttribute('href') || '') && a.querySelector('time')) return true;
    }
    return false;
  }

  function sweepDiscover() {
    if (!HIDE_DISCOVER_MORE) return;
    if (!isPostPath(location.pathname)) return;
    const cells = [...document.querySelectorAll(`${PRIMARY} [data-testid="cellInnerDiv"]`)];
    // Only cells after the post itself (and after a real post) can be "Discover more"
    let seenPost = false;
    let inDiscover = false;
    for (const cell of cells) {
      const focal = isFocalCell(cell);
      if (focal) { seenPost = true; inDiscover = false; unhide(cell); continue; }
      if (cell.querySelector('article')) seenPost = true;
      if (seenPost && !cell.querySelector('article') && isDiscoverCell(cell)) { inDiscover = true; hide(cell, 'discover more'); continue; }
      if (inDiscover) hide(cell, 'discover more (post)');
      else unhide(cell);
    }
    // Safety net: if every cell ended up hidden, show them all again
    if (cells.length && cells.every(c => c.hasAttribute(HIDE_ATTR))) cells.forEach(unhide);
  }

  function unhide(el) {
    if (el.hasAttribute(HIDE_ATTR)) el.removeAttribute(HIDE_ATTR);
  }

  // ---- Home: top tabs, the "posted" pill, and the Show / Hide feed buttons ----
  function sweepTabs() {
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      if (tab.closest(SIDEBAR)) continue;
      const box = tab.parentElement && tab.parentElement.getAttribute('role') === 'presentation' ? tab.parentElement : tab;
      const want = KEEP_TABS.includes(textOf(tab)) ? 'keep' : 'other';
      if (box.getAttribute('data-xnf-tab') !== want) box.setAttribute('data-xnf-tab', want);
    }
    // The "+" (add or manage tabs) button next to the tab list
    for (const list of document.querySelectorAll('[role="tablist"]')) {
      if (list.closest(SIDEBAR)) continue;
      let up = list.parentElement;
      for (let i = 0; up && i < 3; i++, up = up.parentElement) {
        for (const b of up.querySelectorAll('a, button, [role="button"]')) {
          if (list.contains(b) || b.closest('[role="tab"]') || b.querySelector('[role="tab"]')) continue;
          const label = ((b.getAttribute('aria-label') || '') + ' ' + textOf(b)).trim().toLowerCase();
          if (label === '+' || /\b(tabs?|add|manage|pin|pinned|customi[sz]e)\b/.test(label)) b.setAttribute('data-xnf-tab', 'other');
        }
      }
    }
  }

  // "↑ (faces) posted" / "Show 12 posts": only shows up for the hidden feed
  function sweepPill() {
    for (const el of document.querySelectorAll(`[aria-label*="new post" i], [aria-label*="new tweet" i], ${PRIMARY} [role="button"], ${PRIMARY} button`)) {
      if (el.hasAttribute('data-xnf-pill')) continue;
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      const t = textOf(el);
      if (/new (posts|tweets)/.test(label) || (t.length < 40 && /(^|\s)posted$|^show \d+ (posts|tweets)$|^\d+ new (posts|tweets)$/.test(t))) {
        el.setAttribute('data-xnf-pill', '');
      }
    }
  }

  let feedBox = null;
  let hideBtn = null;
  function sweepFeedButtons() {
    const onHome = page === 'home' && HIDE_HOME;
    const pc = document.querySelector(PRIMARY);
    if (onHome && !feedShown && pc) {
      if (!feedBox) {
        feedBox = document.createElement('div');
        feedBox.id = 'xnf-feedbox';
        feedBox.appendChild(document.createTextNode('Home feed hidden. Search, Notifications, Messages and links people send you still work.'));
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Show feed';
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setFeedShown(true); });
        if (SHOW_FEED_BUTTON) {
          feedBox.appendChild(document.createElement('br'));
          feedBox.appendChild(b);
        }
      }
      if (feedBox.parentElement !== pc || pc.lastElementChild !== feedBox) pc.appendChild(feedBox);
    } else if (feedBox && feedBox.isConnected) {
      feedBox.remove();
    }
    if (onHome && feedShown && document.body) {
      if (!hideBtn) {
        hideBtn = document.createElement('button');
        hideBtn.id = 'xnf-hidefeed';
        hideBtn.type = 'button';
        hideBtn.textContent = 'Hide feed';
        hideBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setFeedShown(false); window.scrollTo(0, 0); });
      }
      if (!hideBtn.isConnected) document.body.appendChild(hideBtn);
    } else if (hideBtn && hideBtn.isConnected) {
      hideBtn.remove();
    }
  }

  // ---- Clickbait in the shown feed ----
  function baitReason(text, hasMedia) {
    const t = text.trim();
    if (!t) return '';
    const lower = t.toLowerCase();
    if (BAIT_ENDINGS.test(t)) return 'cliffhanger ending';
    if (!hasMedia && BAIT_COLON.test(t) && !/https?:\/\/\S*$/.test(t)) return 'ends on a colon';
    for (const ph of BAIT_PHRASES) if (lower.includes(ph)) return 'bait phrase: ' + ph.trim();
    if (BAIT_LISTICLE.test(t)) return 'list teaser';
    return '';
  }

  function sweepBait() {
    if (!HIDE_CLICKBAIT || page !== 'home' || !feedShown) return;
    for (const cell of document.querySelectorAll(`${PRIMARY} [data-testid="cellInnerDiv"]`)) {
      if (cell.hasAttribute('data-xnf-open')) continue;
      const art = cell.querySelector('article');
      // The post's own text (not a quoted post's), without X's "Show more" link
      const tt = art && art.querySelector('[data-testid="tweetText"]');
      const text = tt ? tt.innerText || tt.textContent || '' : '';
      const sig = text.length + ':' + text.slice(0, 40);
      if (cell.getAttribute('data-xnf-checked') === sig) continue;
      cell.setAttribute('data-xnf-checked', sig);
      // X cuts long posts short with "Read more" / "Show more" (a link, or
      // sometimes plain text after the post): a teaser either way
      const cutByX = !!(art && (art.querySelector('[data-testid="tweet-text-show-more-link"]') ||
        [...art.querySelectorAll('a, button, [role="button"], span')].some(el => /^(read|show) more$/.test(textOf(el)) && !el.querySelector('span span'))));
      const hasMedia = !!(art && (art.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="card.wrapper"], video, img[src*="/media/"]') ||
        art.querySelectorAll('[data-testid="tweetText"]').length > 1));
      let why = '';
      if (text && cutByX && FOLD_CUT_OFF) why = 'cut off with "Read more"';
      else if (text) why = baitReason(cutByX ? text.replace(/(\.\.\.|…)\s*$/, '') : text, hasMedia);
      if (why) cell.setAttribute('data-xnf-bait', why);
      else if (cell.hasAttribute('data-xnf-bait')) cell.removeAttribute('data-xnf-bait');
    }
  }

  // Tap the "Hidden: looks like clickbait" bar to open that post
  document.addEventListener('click', (e) => {
    const cell = e.target && e.target.closest && e.target.closest('[data-xnf-bait]:not([data-xnf-open])');
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    cell.setAttribute('data-xnf-open', '');
  }, true);

  function sweep() {
    updatePage();
    if (document.body) {
      if (page === 'home' && HIDE_HOME) {
        sweepTabs();
        if (!feedShown) sweepPill();
        sweepBait();
      }
      sweepFeedButtons();
      sweepSidebar(document.body);
      sweepDiscover();
      sweepCaptions();
      showDebug();
    }
  }

  // ---- Captions off by default ----
  // X's videos can carry captions two ways: as tracks on the video itself, or
  // drawn by X's player behind its CC button. This turns the tracks off and,
  // if the CC button says captions are on, taps it once per video. Once you
  // tap CC yourself on a video, it leaves that video alone.
  const CC_LABEL = /caption|subtitle|\bcc\b/i;
  const CC_ON_LABEL = /(turn off|hide|disable|stop)\s.*(caption|subtitle|cc)|(caption|subtitle)s?\s*(are\s*)?on\b|(caption|subtitle)s?:\s*on\b/i;
  const ccLeftAlone = new WeakSet(); // videos where you tapped CC yourself
  let ccPrograms = 0;                // our own CC taps in flight (so they aren't mistaken for yours)
  let ccLog = [];

  function playerOf(el) {
    return el.closest('[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="tweetPhoto"], [aria-label*="video" i][role="group"]') ||
      el.closest('div:has(> video)') || el.parentElement;
  }

  function ccButtonsNear(video) {
    // Climb from the video until a level holds a CC button (X puts the controls next to the video)
    let up = video.parentElement;
    for (let i = 0; up && i < 8; i++, up = up.parentElement) {
      const found = [...up.querySelectorAll('button, [role="button"], [role="menuitemcheckbox"], [role="switch"]')]
        .filter(b => CC_LABEL.test(b.getAttribute('aria-label') || '') || /^cc$/i.test(textOf(b)));
      if (found.length) return found;
      if (up.querySelectorAll('video').length > 1) break; // reached a list of several videos
    }
    return [];
  }

  function ccIsOn(b) {
    const pressed = b.getAttribute('aria-pressed') || b.getAttribute('aria-checked');
    if (pressed === 'true') return true;
    if (pressed === 'false') return false;
    return CC_ON_LABEL.test(b.getAttribute('aria-label') || '');
  }

  function tracksOff(video) {
    if (ccLeftAlone.has(video) || !video.textTracks) return;
    for (const t of video.textTracks) {
      if ((t.kind === 'captions' || t.kind === 'subtitles' || !t.kind) && t.mode !== 'disabled') {
        t.mode = 'disabled';
        ccLog.push('track off');
      }
    }
  }

  function captionsOff(video) {
    if (!CAPTIONS_OFF || ccLeftAlone.has(video)) return;
    if (!video.hasAttribute('data-xnf-cc')) {
      video.setAttribute('data-xnf-cc', '');
      if (video.textTracks) {
        // X may switch a track back on when the video starts or changes quality
        video.textTracks.addEventListener('addtrack', () => tracksOff(video));
        video.textTracks.addEventListener('change', () => tracksOff(video));
      }
    }
    tracksOff(video);
    const src = video.currentSrc || video.src || video.getAttribute('poster') || 'x';
    if (video.getAttribute('data-xnf-cc') === src) return; // CC button already handled for this video
    const btns = ccButtonsNear(video);
    if (!btns.length) return;
    video.setAttribute('data-xnf-cc', src);
    for (const b of btns) {
      if (!ccIsOn(b)) continue;
      ccPrograms++;
      try { b.click(); } finally { ccPrograms--; }
      ccLog.push('tapped CC: ' + (b.getAttribute('aria-label') || 'cc'));
    }
  }

  function sweepCaptions() {
    if (!CAPTIONS_OFF) return;
    for (const v of document.querySelectorAll('video')) captionsOff(v);
  }

  // Your own tap on CC: leave that video's captions as you set them
  document.addEventListener('click', (e) => {
    if (ccPrograms || !e.isTrusted) return;
    const b = e.target && e.target.closest && e.target.closest('button, [role="button"], [role="menuitemcheckbox"], [role="switch"]');
    if (!b || !(CC_LABEL.test(b.getAttribute('aria-label') || '') || /^cc$/i.test(textOf(b)))) return;
    const p = playerOf(b);
    const vids = p ? p.querySelectorAll('video') : [];
    (vids.length ? vids : document.querySelectorAll('video')).forEach(v => ccLeftAlone.add(v));
  }, true);
  // Videos that start or switch source after the page has settled
  for (const ev of ['loadedmetadata', 'play']) {
    document.addEventListener(ev, (e) => { if (e.target && e.target.tagName === 'VIDEO') captionsOff(e.target); }, true);
  }

  function captionDebug() {
    if (!CAPTIONS_OFF) return '';
    const v = document.querySelector('video');
    if (!v) return '';
    const tracks = v.textTracks ? [...v.textTracks].map(t => t.kind + ':' + t.mode).join(',') : 'n/a';
    const btns = ccButtonsNear(v).map(b => `"${b.getAttribute('aria-label') || textOf(b)}" pressed=${b.getAttribute('aria-pressed') || b.getAttribute('aria-checked') || '-'}`);
    return `\nvideo tracks: ${tracks || 'none'}\nCC buttons: ${btns.join(' | ') || 'none found'}\ncc: ${ccLog.slice(-3).join(', ') || '-'}`;
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
