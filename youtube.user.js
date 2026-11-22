// ==UserScript==
// @name         YouTube
// @namespace    joesatow-youtube
// @version      2.0
// @description  Strips YouTube down: no Ask YouTube, Shorts, Create, topic chips or Subscriptions list, and the home feed behind a button. On the computer also: related videos behind a button, theater mode by default, and sponsor segments skipped (SponsorBlock).
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @sandbox      raw
// @connect      sponsor.ajay.app
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/youtube.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/youtube.user.js
// ==/UserScript==

// One script for both: the computer version runs on the full site, the phone
// version on the mobile site (m.youtube.com).
const __onMobileSite = ['m.youtube.com'].includes(location.hostname);

if (!__onMobileSite) {
// ======================= Computer site =======================
(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_ASK_YOUTUBE = true;
  const HIDE_SHORTS_BUTTON = true;
  const HIDE_CREATE_BUTTON = true;
  const HIDE_CHIPS_BAR = true;           // "Add custom feed / All / ..." bar on the home page
  const HIDE_SUBSCRIPTIONS_LIST = true;  // channel list in the left sidebar
  const HOME_FEED_TOGGLE = true;         // home feed hidden, with a button to show it
  const HIDE_WATCH_CHIPS = true;         // "All / From <channel> / ..." bar next to a video
  const HIDE_WATCH_SHORTS = true;        // Shorts in the related videos next to a video
  const DEFAULT_THEATER = true;          // videos open in theater (wide) mode
  const RELATED_TOGGLE = true;           // related videos hidden, with a button to show them
  const SKIP_SPONSORS = true;            // skip segments viewers have marked (SponsorBlock)
  // Which kinds of segment to skip. Others you can add:
  //   'intro', 'outro', 'preview' (recaps/teasers), 'filler' (tangents),
  //   'music_offtopic' (non-music parts of music videos)
  const SKIP_CATEGORIES = ['sponsor', 'selfpromo', 'interaction'];

  // ---- Styles (injected immediately so nothing flashes) ----
  const HOME = 'ytd-browse[page-subtype="home"]';
  const css = [];

  css.push('[data-yc-hidden] { display: none !important; }');

  if (HIDE_ASK_YOUTUBE) {
    css.push(`
      html.yc-askpage ytd-app,
      html.yc-askpage ytm-app { visibility: hidden !important; }
    `);
  }

  if (HIDE_SHORTS_BUTTON) {
    css.push(`
      ytd-guide-entry-renderer:has(a[title="Shorts"]),
      ytd-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-mini-guide-entry-renderer[aria-label="Shorts"],
      ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[title="Shorts"]),
      ytm-pivot-bar-item-renderer:has(.pivot-shorts) { display: none !important; }
    `);
  }

  if (HIDE_CREATE_BUTTON) {
    css.push(`
      ytd-masthead #buttons ytd-button-renderer:has([aria-label="Create"]),
      ytd-masthead #buttons yt-button-view-model:has([aria-label="Create"]),
      ytd-masthead #buttons button-view-model:has([aria-label="Create"]),
      ytd-masthead #buttons ytd-topbar-menu-button-renderer:has([aria-label="Create"]) { display: none !important; }
    `);
  }

  if (HIDE_CHIPS_BAR) {
    css.push(`
      ${HOME} ytd-feed-filter-chip-bar-renderer,
      ${HOME} #chips-wrapper,
      ${HOME} ytd-rich-grid-renderer > #header,
      html.yc-home #frosted-glass { display: none !important; }
    `);
  }

  // The related-videos column next to a video (#secondary), or under it in
  // theater mode / narrow windows (#related)
  const RELATED = 'ytd-watch-flexy :is(#secondary, #related)';

  if (HIDE_WATCH_CHIPS) {
    css.push(`
      ${RELATED} yt-related-chip-cloud-renderer,
      ${RELATED} yt-chip-cloud-renderer,
      ${RELATED} #chips-wrapper,
      ${RELATED} ytd-feed-filter-chip-bar-renderer { display: none !important; }
    `);
  }

  if (HIDE_WATCH_SHORTS) {
    css.push(`
      ${RELATED} ytd-reel-shelf-renderer,
      ${RELATED} grid-shelf-view-model,
      ${RELATED} ytd-rich-shelf-renderer:has(a[href^="/shorts/"]),
      ${RELATED} yt-horizontal-list-renderer:has(a[href^="/shorts/"]),
      ${RELATED} :is(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2),
      ${RELATED} ytd-compact-video-renderer:has(a[href^="/shorts/"]),
      ${RELATED} yt-lockup-view-model:has(a[href^="/shorts/"]) { display: none !important; }
    `);
  }

  if (HOME_FEED_TOGGLE) {
    // display:none (not just invisible) removes YouTube's endless-scroll trigger
    // from the page, so it stops loading more videos in the background.
    css.push(`
      html:not(.yc-feed-on) ${HOME} ytd-rich-grid-renderer,
      html:not(.yc-feed-on) ${HOME} ytd-continuation-item-renderer { display: none !important; }

      #yc-feed-toggle {
        display: block;
        margin: 48px auto;
        padding: 10px 20px;
        border: 0;
        border-radius: 18px;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        cursor: pointer;
        background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1));
        color: var(--yt-spec-text-primary, #f1f1f1);
      }
      #yc-feed-toggle:hover { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,.2)); }
      html.yc-feed-on #yc-feed-toggle { margin: 16px auto; }
    `);
  }

  if (RELATED_TOGGLE) {
    // The list of related videos next to (or, in theater mode, below) the
    // video. display:none also stops it loading more as you scroll.
    css.push(`
      html:not(.yc-related-on) ytd-watch-flexy ytd-watch-next-secondary-results-renderer { display: none !important; }

      #yc-related-toggle {
        display: block;
        width: 100%;
        margin: 0 0 12px;
        padding: 10px 16px;
        border: 0;
        border-radius: 18px;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        cursor: pointer;
        background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1));
        color: var(--yt-spec-text-primary, #f1f1f1);
      }
      #yc-related-toggle:hover { background: var(--yt-spec-10-percent-layer, rgba(255,255,255,.2)); }
    `);
  }

  const style = document.createElement('style');
  style.textContent = css.join('\n');
  (document.head || document.documentElement).appendChild(style);

  // =====================================================================
  // Theater mode by default
  // =====================================================================
  // YouTube remembers theater mode in a cookie named "wide". Setting it
  // before YouTube starts makes videos open in theater mode straight away.
  if (DEFAULT_THEATER) {
    try { document.cookie = 'wide=1; domain=.youtube.com; path=/; max-age=31536000; SameSite=Lax'; } catch (e) {}
  }

  // Backup: if a video still opens in the normal layout, press YouTube's own
  // theater button once for that video. If you switch theater mode off
  // yourself, it stays off for that video.
  // Per video: whether theater mode has been reached, and how many tries so
  // far. It only counts as done once theater mode is actually on, so a
  // press made before the player was ready gets tried again. Once it's on,
  // switching it off yourself is left alone for that video.
  const theater = { vid: '', done: false, tries: 0, lastTry: 0 };

  function ensureTheater() {
    if (location.pathname !== '/watch') return;
    const vid = new URLSearchParams(location.search).get('v') || '';
    if (!vid) return;
    if (theater.vid !== vid) Object.assign(theater, { vid, done: false, tries: 0, lastTry: 0 });
    if (theater.done) return;

    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || flexy.hidden) return;
    if (flexy.hasAttribute('theater') || flexy.hasAttribute('fullscreen')) { theater.done = true; return; }
    if (theater.tries >= 4 || Date.now() - theater.lastTry < 1000) return;

    const sizeBtn = document.querySelector('.ytp-size-button');
    const player = document.querySelector('#movie_player');
    if (!sizeBtn || !player) return; // player not ready yet; try again on the next check
    theater.tries++;
    theater.lastTry = Date.now();
    if (theater.tries <= 2) {
      sizeBtn.click();
    } else {
      // Pressing the button didn't take: use YouTube's own "t" shortcut
      // (sent once, to the page; YouTube's shortcuts listen there)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', keyCode: 84, which: 84, bubbles: true, cancelable: true }));
    }
  }

  function hide(el) {
    if (el) el.setAttribute('data-yc-hidden', '');
  }

  function label(el) {
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return (aria || el.innerText || el.textContent || '').trim().toLowerCase();
  }

  // =====================================================================
  // Ask YouTube
  // =====================================================================
  const ASK_LABELS = ['ask', 'ask youtube'];
  const WRAPPERS = [
    'ytd-guide-entry-renderer', 'ytd-mini-guide-entry-renderer',
    'yt-button-view-model', 'button-view-model', 'ytd-button-renderer',
    'ytd-menu-service-item-renderer', 'tp-yt-paper-item',
    'ytm-pivot-bar-item-renderer', 'ytm-button-renderer',
  ].join(', ');

  function hideAskButtons() {
    document
      .querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], tp-yt-paper-item')
      .forEach((el) => {
        if (el.closest('[data-yc-hidden]')) return;
        if (!ASK_LABELS.includes(label(el))) return;
        hide(el.closest(WRAPPERS) || el);
      });
  }

  function onAskPage() {
    if (/^\/(ask|gemini)(\/|$)/i.test(location.pathname)) return true;
    for (const h of document.querySelectorAll('h1, h2, yt-formatted-string, span')) {
      const t = (h.textContent || '').trim().toLowerCase();
      if (t === 'dive deep into any topic') return true;
      if (t === 'ask youtube' && h.matches('h1, h2, h1 *, h2 *')) return true;
    }
    return false;
  }

  let leaving = false;
  function blockAskPage() {
    const ask = onAskPage();
    document.documentElement.classList.toggle('yc-askpage', ask);
    if (!ask || leaving) return;
    leaving = true;
    if (location.pathname !== '/') location.replace('/');
    setTimeout(() => (leaving = false), 1500);
  }

  // =====================================================================
  // Subscriptions list in the left sidebar
  // =====================================================================
  // The section is found by its first line of text ("Subscriptions >"), or by
  // its heading linking to your channel list. Checking only the FIRST line means
  // a plain "Subscriptions" link inside the Home section never takes Home with it.
  function hideSubscriptionsList() {
    document.querySelectorAll('ytd-guide-section-renderer:not([data-yc-hidden])').forEach((sec) => {
      const firstLine = (sec.innerText || '').trim().split('\n')[0].trim().toLowerCase();
      const headingLink = sec.querySelector(
        '#guide-section-title a[href*="/feed/channels"], ytd-guide-entry-renderer:first-child a[href*="/feed/channels"]'
      );
      if (firstLine === 'subscriptions' || headingLink) hide(sec);
    });
  }

  // =====================================================================
  // Home feed toggle
  // =====================================================================
  let feedOn = false; // off every time you open YouTube

  function placeToggle() {
    const browse = document.querySelector(HOME);
    if (!browse) return;
    const grid = browse.querySelector('ytd-rich-grid-renderer');
    if (!grid || !grid.parentElement) return;

    let btn = document.getElementById('yc-feed-toggle');
    if (btn && btn.nextElementSibling === grid) return; // already in place

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'yc-feed-toggle';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        feedOn = !feedOn;
        updateToggle();
        if (feedOn) window.dispatchEvent(new Event('resize')); // nudge YouTube to lay out the grid
      });
    }
    grid.parentElement.insertBefore(btn, grid);
    updateToggle();
  }

  function updateToggle() {
    document.documentElement.classList.toggle('yc-feed-on', feedOn);
    const btn = document.getElementById('yc-feed-toggle');
    if (btn) btn.textContent = feedOn ? 'Hide home feed' : 'Show home feed';
  }

  // =====================================================================
  // Related videos toggle (in the column next to / below the video)
  // =====================================================================
  let relatedOn = false; // hidden every time you open YouTube

  function placeRelatedToggle() {
    const list = document.querySelector('ytd-watch-flexy ytd-watch-next-secondary-results-renderer');
    if (!list || !list.parentElement) return;

    let btn = document.getElementById('yc-related-toggle');
    if (btn && btn.nextElementSibling === list) return; // already in place

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'yc-related-toggle';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        relatedOn = !relatedOn;
        updateRelatedToggle();
        if (relatedOn) window.dispatchEvent(new Event('resize')); // nudge YouTube to lay out the list
      });
    }
    list.parentElement.insertBefore(btn, list);
    updateRelatedToggle();
  }

  function updateRelatedToggle() {
    document.documentElement.classList.toggle('yc-related-on', relatedOn);
    const btn = document.getElementById('yc-related-toggle');
    if (btn) btn.textContent = relatedOn ? 'Hide related videos' : 'Show related videos';
  }

  // =====================================================================
  // Apply
  // =====================================================================
  // =====================================================================
  // Shorts next to a video (backup for the style rules, in case YouTube
  // renames its elements): any row holding several /shorts/ links goes
  // =====================================================================
  function hideWatchShorts() {
    const col = document.querySelector('ytd-watch-flexy #secondary, ytd-watch-flexy #related');
    if (!col) return;
    const links = col.querySelectorAll('a[href^="/shorts/"]:not([data-yc-seen])');
    links.forEach((a) => {
      a.setAttribute('data-yc-seen', '');
      // Climb to the row that holds this Short and others (the shelf), but
      // never so far that it also holds a normal video: that would be the
      // whole related-videos list (which is what happened when YouTube
      // changed how it builds the list)
      let el = a;
      while (el.parentElement && el.parentElement !== col) {
        const parent = el.parentElement;
        if (parent.id === 'items' || parent.id === 'contents') break;
        if (parent.querySelector('a[href^="/watch"]')) break;
        el = parent;
      }
      hide(el);
    });
  }

  // =====================================================================
  // Skip sponsor segments (SponsorBlock)
  // =====================================================================
  // Viewers mark where sponsor segments start and end; SponsorBlock's free
  // public database stores those times. For each video this asks the
  // database for its segments and jumps past them as you reach them.
  //
  // Privacy: it never sends the video's ID. It sends the first 4 characters
  // of a scrambled (SHA-256) version of it; the database answers with every
  // video matching those 4 characters, and the right one is picked out here.

  const SB_API = 'https://sponsor.ajay.app/api/skipSegments/';
  const SB_LABEL = {
    sponsor: 'sponsor', selfpromo: 'self-promotion', interaction: '"like and subscribe" reminder',
    intro: 'intro', outro: 'outro', preview: 'preview', filler: 'tangent', music_offtopic: 'non-music section',
  };
  // Same colors the SponsorBlock extension uses on the progress bar
  const SB_COLOR = {
    sponsor: '#00d400', selfpromo: '#ffff00', interaction: '#cc00ff', intro: '#00ffff',
    outro: '#0202ed', preview: '#008fd6', filler: '#7300ff', music_offtopic: '#ff9900',
  };

  const sb = {
    vid: '',          // video the segments belong to
    segments: [],     // [{ start, end, category }]
    allowed: new Set(), // segments you chose to watch (Undo)
    lastTime: -1,     // playback position at the last check
    ourSeek: false,   // the next "seeking" is the script's own jump
    video: null,
    barFor: '',       // what the progress-bar markers were drawn for
  };

  function sbRequest(url) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET', url, timeout: 10000,
          onload: (r) => resolve(r.status === 200 ? r.responseText : null),
          onerror: () => resolve(null), ontimeout: () => resolve(null),
        });
      } else {
        fetch(url).then((r) => (r.ok ? r.text() : null)).then(resolve, () => resolve(null));
      }
    });
  }

  async function sbHashPrefix(id) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
  }

  async function sbLoad(vid) {
    try {
      const prefix = await sbHashPrefix(vid);
      const url = SB_API + prefix +
        '?categories=' + encodeURIComponent(JSON.stringify(SKIP_CATEGORIES)) +
        '&actionTypes=' + encodeURIComponent(JSON.stringify(['skip']));
      const text = await sbRequest(url);
      if (sb.vid !== vid) return; // moved on to another video meanwhile
      const list = text ? JSON.parse(text) : [];
      const mine = (Array.isArray(list) ? list : []).find((v) => v && v.videoID === vid);
      sb.segments = ((mine && mine.segments) || [])
        .filter((s) => s.actionType === 'skip' && Array.isArray(s.segment) && s.segment[1] - s.segment[0] > 0.5)
        .map((s) => ({ start: s.segment[0], end: s.segment[1], category: s.category }))
        .sort((a, b) => a.start - b.start);
      sb.barFor = '';
    } catch (e) {
      sb.segments = [];
    }
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  // A small note over the video: "Skipped sponsor (0:45) · Undo"
  function sbToast(seg, index) {
    const player = document.querySelector('#movie_player');
    if (!player) return;
    document.getElementById('yc-sb-toast')?.remove();
    const box = document.createElement('div');
    box.id = 'yc-sb-toast';
    box.setAttribute('style', 'position:absolute;left:12px;bottom:72px;z-index:70;display:flex;gap:10px;align-items:center;' +
      'padding:7px 12px;border-radius:6px;background:rgba(0,0,0,.78);color:#fff;font:500 13px/1.2 Roboto,Arial,sans-serif');
    const msg = document.createElement('span');
    msg.textContent = 'Skipped ' + (SB_LABEL[seg.category] || seg.category) + ' (' + fmtTime(seg.end - seg.start) + ')';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo';
    undo.setAttribute('style', 'border:0;border-radius:4px;padding:3px 8px;cursor:pointer;background:rgba(255,255,255,.2);color:#fff;font:inherit');
    undo.addEventListener('click', (e) => {
      e.stopPropagation();
      sb.allowed.add(index);
      if (sb.video) {
        sb.ourSeek = true;
        sb.video.currentTime = seg.start;
        sb.lastTime = seg.start;
      }
      box.remove();
    });
    box.append(msg, undo);
    player.appendChild(box);
    setTimeout(() => box.remove(), 5000);
  }

  function sbCheck() {
    const v = sb.video;
    if (!v || !sb.segments.length) { if (v) sb.lastTime = v.currentTime; return; }
    const t = v.currentTime;
    for (let i = 0; i < sb.segments.length; i++) {
      const seg = sb.segments[i];
      if (sb.allowed.has(i)) continue;
      // Reached the segment by playing into it (not by seeking into its middle)
      if (t >= seg.start && t < seg.end - 0.3 && sb.lastTime < seg.start + 0.5) {
        sb.ourSeek = true;
        v.currentTime = Math.min(seg.end, v.duration || seg.end);
        sb.lastTime = seg.end;
        sbToast(seg, i);
        return;
      }
    }
    sb.lastTime = t;
  }

  function sbAttach() {
    const v = document.querySelector('#movie_player video.html5-main-video, #movie_player video');
    if (!v || v === sb.video) return;
    sb.video = v;
    v.addEventListener('timeupdate', () => { if (location.pathname === '/watch') sbCheck(); });
    v.addEventListener('seeking', () => {
      // Your own seek: remember where you went, so a segment you jumped
      // into the middle of is left alone
      if (sb.ourSeek) { sb.ourSeek = false; return; }
      sb.lastTime = v.currentTime;
    });
  }

  // Colored marks on the progress bar where segments are
  function sbDrawBar() {
    const bar = document.querySelector('#movie_player .ytp-progress-bar');
    const v = sb.video;
    if (!bar || !v || !(v.duration > 0)) return;
    const key = sb.vid + '|' + sb.segments.length + '|' + Math.round(v.duration);
    let layer = bar.querySelector('#yc-sb-bar');
    if (layer && sb.barFor === key) return;
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'yc-sb-bar';
      layer.setAttribute('style', 'position:absolute;inset:0;pointer-events:none;z-index:35');
      bar.appendChild(layer);
    }
    layer.replaceChildren(...sb.segments.map((s) => {
      const mark = document.createElement('div');
      mark.setAttribute('style', 'position:absolute;top:0;bottom:0;opacity:.85;' +
        'left:' + (s.start / v.duration * 100) + '%;width:' + ((s.end - s.start) / v.duration * 100) + '%;' +
        'background:' + (SB_COLOR[s.category] || '#00d400'));
      return mark;
    }));
    sb.barFor = key;
  }

  function sponsorTick() {
    if (location.pathname !== '/watch') return;
    const vid = new URLSearchParams(location.search).get('v') || '';
    if (!vid) return;
    sbAttach();
    if (vid !== sb.vid) {
      Object.assign(sb, { vid, segments: [], allowed: new Set(), lastTime: -1, barFor: '' });
      sbLoad(vid);
    }
    sbDrawBar();
  }

  function apply() {
    document.documentElement.classList.toggle('yc-home', location.pathname === '/');
    if (!document.body) return;

    if (HIDE_ASK_YOUTUBE) {
      hideAskButtons();
      blockAskPage();
    }
    if (HIDE_SUBSCRIPTIONS_LIST) hideSubscriptionsList();
    if (HOME_FEED_TOGGLE) placeToggle();
    if (HIDE_WATCH_SHORTS && location.pathname === '/watch') hideWatchShorts();
    if (RELATED_TOGGLE && location.pathname === '/watch') placeRelatedToggle();
    if (DEFAULT_THEATER) ensureTheater();
    if (SKIP_SPONSORS) sponsorTick();
  }

  // Watch for changes as they happen so things are gone before you see them
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  updateToggle();
  updateRelatedToggle();
  setInterval(apply, 500);
  window.addEventListener('yt-navigate-finish', apply);
  window.addEventListener('popstate', apply);
})();
} else {
// ======================= Mobile site =======================
(function () {
  'use strict';

  // ---- Settings ----
  const HIDE_ASK_YOUTUBE = true;
  const HIDE_SHORTS = true;              // Shorts tab in the bottom bar, plus Shorts rows
  const HIDE_CREATE_BUTTON = true;       // the "+" in the bottom bar / top bar
  const HIDE_CHIPS_BAR = true;           // "All / Music / Gaming ..." bar on the home page
  const HIDE_SUBSCRIPTIONS_TAB = true;   // Subscriptions tab in the bottom bar
  const HOME_FEED_TOGGLE = true;         // home feed hidden, with a button to show it

  // Bottom bar tabs to remove, by their label
  const TABS_REMOVE = [];
  if (HIDE_SHORTS) TABS_REMOVE.push('shorts');
  if (HIDE_CREATE_BUTTON) TABS_REMOVE.push('create');
  if (HIDE_SUBSCRIPTIONS_TAB) TABS_REMOVE.push('subscriptions');

  // ---- Styles (in place before the page draws, so nothing flashes) ----
  const css = ['[data-ycm-hidden] { display: none !important; }'];

  if (HIDE_ASK_YOUTUBE) {
    css.push('html.ycm-askpage ytm-app { visibility: hidden !important; }');
  }

  if (HIDE_SHORTS) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-shorts),
      ytm-pivot-bar-item-renderer:has([aria-label="Shorts"]),
      ytm-reel-shelf-renderer,
      ytm-shorts-lockup-view-model,
      ytm-rich-section-renderer:has(ytm-reel-shelf-renderer),
      ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model) { display: none !important; }
    `);
  }

  if (HIDE_CREATE_BUTTON) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-create),
      ytm-pivot-bar-item-renderer:has([aria-label="Create"]),
      ytm-mobile-topbar-renderer :is(ytm-button-renderer, button-view-model, yt-button-view-model):has([aria-label="Create"]) { display: none !important; }
    `);
  }

  if (HIDE_SUBSCRIPTIONS_TAB) {
    css.push(`
      ytm-pivot-bar-item-renderer:has(.pivot-subs),
      ytm-pivot-bar-item-renderer:has([aria-label="Subscriptions"]) { display: none !important; }
    `);
  }

  if (HIDE_CHIPS_BAR) {
    css.push(`
      html.ycm-home ytm-feed-filter-chip-bar-renderer,
      html.ycm-home ytm-chip-cloud-renderer,
      html.ycm-home .chip-bar-contents { display: none !important; }
    `);
  }

  if (HOME_FEED_TOGGLE) {
    // display:none (not just invisible) removes the endless-scroll trigger,
    // so YouTube stops loading more videos in the background.
    css.push(`
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-rich-grid-renderer,
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-section-list-renderer,
      html.ycm-home:not(.ycm-feed-on) ytm-browse ytm-continuation-item-renderer { display: none !important; }

      #ycm-feed-toggle {
        display: block;
        margin: 40px auto;
        padding: 10px 20px;
        border: 0;
        border-radius: 18px;
        font: 500 14px/20px Roboto, Arial, sans-serif;
        background: rgba(255, 255, 255, .12);
        color: inherit;
      }
      html.ycm-feed-on #ycm-feed-toggle { margin: 12px auto; }
      html:not(.ycm-home) #ycm-feed-toggle { display: none !important; }
    `);
  }

  const style = document.createElement('style');
  style.textContent = css.join('\n');
  (document.head || document.documentElement).appendChild(style);

  function hide(el) {
    if (el) el.setAttribute('data-ycm-hidden', '');
  }

  function label(el) {
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    return (aria || el.innerText || el.textContent || '').trim().toLowerCase();
  }

  // =====================================================================
  // Bottom bar tabs (backup for the style rules above, matched by label)
  // =====================================================================
  function trimTabs() {
    document.querySelectorAll('ytm-pivot-bar-item-renderer:not([data-ycm-hidden])').forEach((tab) => {
      const text = (tab.innerText || '').trim().toLowerCase();
      const aria = (tab.querySelector('[aria-label]')?.getAttribute('aria-label') || '').trim().toLowerCase();
      const name = text || aria;
      if (TABS_REMOVE.includes(name)) hide(tab);
      else if (aria && TABS_REMOVE.includes(aria)) hide(tab);
    });
  }

  // =====================================================================
  // Ask YouTube
  // =====================================================================
  const ASK_LABELS = ['ask', 'ask youtube'];

  function hideAskButtons() {
    document
      .querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"]')
      .forEach((el) => {
        if (el.closest('[data-ycm-hidden]')) return;
        if (!ASK_LABELS.includes(label(el))) return;
        hide(el.closest('ytm-button-renderer, button-view-model, yt-button-view-model, ytm-menu-item, ytm-pivot-bar-item-renderer') || el);
      });
  }

  function onAskPage() {
    if (/^\/(ask|gemini)(\/|$)/i.test(location.pathname)) return true;
    for (const h of document.querySelectorAll('h1, h2, span')) {
      const t = (h.textContent || '').trim().toLowerCase();
      if (t === 'dive deep into any topic') return true;
      if (t === 'ask youtube' && h.matches('h1, h2, h1 *, h2 *')) return true;
    }
    return false;
  }

  let leaving = false;
  function blockAskPage() {
    const ask = onAskPage();
    document.documentElement.classList.toggle('ycm-askpage', ask);
    if (!ask || leaving) return;
    leaving = true;
    if (location.pathname !== '/') location.replace('/');
    setTimeout(() => (leaving = false), 1500);
  }

  // =====================================================================
  // Home feed toggle
  // =====================================================================
  let feedOn = false; // off every time you open YouTube

  function placeToggle() {
    const browse = document.querySelector('ytm-browse');
    if (!browse) return;
    const feed = browse.querySelector('ytm-rich-grid-renderer, ytm-section-list-renderer');
    if (!feed || !feed.parentElement) return;

    let btn = document.getElementById('ycm-feed-toggle');
    if (btn && btn.nextElementSibling === feed) return;

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'ycm-feed-toggle';
      btn.type = 'button';
      btn.addEventListener('click', () => {
        feedOn = !feedOn;
        updateToggle();
        if (feedOn) window.dispatchEvent(new Event('resize'));
      });
    }
    feed.parentElement.insertBefore(btn, feed);
    updateToggle();
  }

  function updateToggle() {
    document.documentElement.classList.toggle('ycm-feed-on', feedOn);
    const btn = document.getElementById('ycm-feed-toggle');
    if (btn) btn.textContent = feedOn ? 'Hide home feed' : 'Show home feed';
  }

  // =====================================================================
  // Apply
  // =====================================================================
  function apply() {
    document.documentElement.classList.toggle('ycm-home', location.pathname === '/');
    if (!document.body) return;

    trimTabs();
    if (HIDE_ASK_YOUTUBE) {
      hideAskButtons();
      blockAskPage();
    }
    if (HOME_FEED_TOGGLE && location.pathname === '/') placeToggle();
  }

  // Run the moment YouTube adds anything, before the screen is drawn
  let running = false;
  new MutationObserver(() => {
    if (running) return;
    running = true;
    try { apply(); } finally { running = false; }
  }).observe(document.documentElement, { childList: true, subtree: true });

  updateToggle();
  apply();
  setInterval(apply, 1000);
  window.addEventListener('popstate', apply);
  window.addEventListener('state-navigateend', apply);
})();
}
