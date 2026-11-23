// ==UserScript==
// @name         Instagram
// @namespace    joesatow-instagram
// @version      2.2
// @description  Instagram on the website, more like the app: a progress bar you can drag on every video, sound on by default, no "Use the app" bar, no Home or Reels buttons in the tab bar, and no unread-message count.
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        none
// @inject-into  auto
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/instagram.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/instagram.user.js
// ==/UserScript==

// What it does:
// - Progress bar: drag or tap to jump, on whichever video is most on screen.
//   It's added outside Instagram's own layout (nothing of theirs can hide or
//   remove it) but placed in the page, so it scrolls along with the video.
// - Sound on: videos play with sound once you've tapped the page once
//   (browsers don't allow sound before that). Until then videos wait paused
//   (with Instagram's play icon), so that one tap starts the video with sound.
//   Set SOUND_ON / START_PAUSED to false to stop either.
// - Hides the "Use the app" bar, and the Home and Reels buttons in the
//   bottom tab bar (change HIDE_TABS to pick which), and the unread count
//   on the Messages button.
//
// Bar not showing up? Add #igs-debug to the end of the page address and reload:
// a small box shows whether the script is running and what it sees.

(function () {
  'use strict';

  // ---- Settings ----
  const BAR_COLOR = '#ffffff';
  const SHOW_TIME_ALWAYS = false; // true: always show "0:12 / 0:45", not just while scrubbing
  const HIDE_TABS = ['home', 'reels']; // bottom tab bar buttons to remove (also: 'explore', 'messages')
  const HIDE_MESSAGE_COUNT = true;    // remove the unread-count badge on the Messages button
  const SOUND_ON = true;          // videos play with sound (after your first tap on the page)
  const START_PAUSED = true;      // until that first tap, videos wait paused, so tapping one starts it with sound
  const HIT_HEIGHT = 22;          // touchable height in px (the visible line is thinner)

  // ---- Right away, before the page draws anything ----
  // Phone-width layout only (that's where the bottom tab bar is). Hides the
  // chosen tab buttons, and the box each one sits in, so the old tab bar
  // never flashes. The script's checks below tidy up anything this misses.
  {
    const labels = { home: ['/', 'Home'], reels: ['/reels/', 'Reels'], explore: ['/explore/', 'Search and explore'] };
    const rules = [];
    for (const name of HIDE_TABS) {
      const t = labels[name];
      if (!t) continue;
      const icon = `a[href="${t[0]}"] svg[aria-label="${t[1]}"]`;
      const onlyThis = `:not(:has(a[href]:not([href="${t[0]}"])))`;
      rules.push(`a[href="${t[0]}"]:has(svg[aria-label="${t[1]}"])`,
        `:is(div,span,li):has(> ${icon})${onlyThis}`,
        `:is(div,span,li):has(> * > ${icon})${onlyThis}`,
        `:is(div,span,li):has(> * > * > ${icon})${onlyThis}`);
    }
    // the unread number inside the Messages button (anything there that isn't its icon)
    if (HIDE_MESSAGE_COUNT) rules.push('a[href^="/direct/"] :is(span, div):not(:has(svg)):not(svg *)');
    const early = document.createElement('style');
    // one rule each, so a browser that rejects one still uses the rest
    early.textContent = rules.map((r) => `@media (max-width: 767px) { ${r} { display: none !important; } }`).join('\n');
    (document.head || document.documentElement).appendChild(early);
  }

  function main() {
  let debug = false;
  try {
    if (location.hash.includes('igs-debug')) sessionStorage.setItem('igs-debug', '1');
    debug = sessionStorage.getItem('igs-debug') === '1';
  } catch (e) { debug = location.hash.includes('igs-debug'); }

  const style = document.createElement('style');
  style.textContent = `
    #igs-bar {
      position: absolute; left: 0; top: 0; width: 0; height: ${HIT_HEIGHT}px;
      z-index: 2147483000; cursor: pointer; touch-action: none;
      display: none; align-items: flex-end; -webkit-user-select: none; user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #igs-bar.igs-on { display: flex; }
    #igs-bar .igs-track {
      position: relative; width: 100%; height: 4px;
      background: rgba(255,255,255,.35); box-shadow: 0 0 2px rgba(0,0,0,.4);
      transition: height .12s;
    }
    #igs-bar:hover .igs-track, #igs-bar.igs-dragging .igs-track { height: 8px; }
    #igs-bar .igs-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: ${BAR_COLOR}; }
    #igs-bar .igs-knob {
      position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;
      border-radius: 50%; background: ${BAR_COLOR}; box-shadow: 0 0 3px rgba(0,0,0,.5);
      opacity: 0; transition: opacity .12s;
    }
    #igs-bar:hover .igs-knob, #igs-bar.igs-dragging .igs-knob { opacity: 1; }
    #igs-bar .igs-time {
      position: absolute; left: 8px; bottom: ${HIT_HEIGHT - 2}px; padding: 2px 6px; border-radius: 4px;
      background: rgba(0,0,0,.6); color: #fff; font: 600 12px/1.3 -apple-system, system-ui, sans-serif;
      opacity: ${SHOW_TIME_ALWAYS ? 1 : 0}; transition: opacity .12s; pointer-events: none; white-space: nowrap;
    }
    #igs-bar:hover .igs-time, #igs-bar.igs-dragging .igs-time { opacity: 1; }
    #igs-debug {
      position: fixed; left: 6px; top: 60px; z-index: 2147483001; max-width: 70vw;
      background: rgba(0,0,0,.8); color: #0f0; font: 11px/1.35 ui-monospace, monospace;
      padding: 4px 6px; border-radius: 4px; pointer-events: none; white-space: pre-wrap;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Lives on <html>, outside Instagram's app, so their re-renders never touch it
  const bar = document.createElement('div');
  bar.id = 'igs-bar';
  bar.innerHTML = '<div class="igs-time"></div><div class="igs-track"><div class="igs-fill"></div><div class="igs-knob"></div></div>';
  const track = bar.querySelector('.igs-track');
  const fill = bar.querySelector('.igs-fill');
  const knob = bar.querySelector('.igs-knob');
  const time = bar.querySelector('.igs-time');
  document.documentElement.appendChild(bar);


  let dbgBox = null;
  if (debug) {
    dbgBox = document.createElement('div');
    dbgBox.id = 'igs-debug';
    dbgBox.textContent = 'scrubber: running';
    document.documentElement.appendChild(dbgBox);
  }

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // Streamed videos sometimes report an unknown length; fall back to the seekable range
  function lengthOf(v) {
    if (isFinite(v.duration) && v.duration > 0) return v.duration;
    try { if (v.seekable && v.seekable.length) return v.seekable.end(v.seekable.length - 1); } catch (e) {}
    return 0;
  }

  // Pick the video most on screen (playing ones win ties)
  let target = null;
  let lastPick = 0;
  function pick() {
    const vw = innerWidth, vh = innerHeight;
    let best = null, bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) continue;
      const w = Math.min(r.right, vw) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) continue;
      const score = w * h * (v.paused ? 1 : 1.5);
      if (score > bestScore) { bestScore = score; best = v; }
    }
    return best;
  }

  function draw(t) {
    const d = target ? lengthOf(target) : 0;
    const f = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
    fill.style.width = (f * 100) + '%';
    knob.style.left = (f * 100) + '%';
    time.textContent = fmt(t) + ' / ' + fmt(d);
  }

  let dragging = false;
  let wasPlaying = false;

  // The bar sits in the page itself (not pinned to the screen), so it moves
  // with the page as you scroll, as smoothly as the video does. If the video
  // is inside its own scrolling panel (like the Reels tab), the bar goes in
  // that panel instead.
  function scrollerOf(video) {
    for (let el = video.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  }

  let host = null;        // the panel the bar lives in (null: the page)
  let topLimit = 0;       // bottom of any header pinned at the top of the screen
  let bottomLimit = 0;    // top of the tab bar pinned at the bottom
  const pinnedEdge = (x, y, top) => {
    let el = document.elementFromPoint(x, y);
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el === bar) return null;
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        const r = el.getBoundingClientRect();
        if (r.height > innerHeight * 0.3) return null; // a full-screen layer, not a header/tab bar
        return top ? r.bottom : r.top;
      }
    }
    return null;
  };
  function measureEdges() {
    topLimit = pinnedEdge(innerWidth / 2, 2, true) || 0;
    bottomLimit = pinnedEdge(innerWidth / 2, innerHeight - 2, false) || innerHeight;
  }

  let last = {};
  function setStyle(key, val) {
    if (last[key] !== val) { last[key] = val; bar.style[key] = val; }
  }

  function place() {
    if (!target || !target.isConnected) { bar.classList.remove('igs-on'); return null; }
    const r = target.getBoundingClientRect();
    // Tuck it away while the video's bottom edge is under a pinned header or tab bar
    if (r.width < 120 || r.bottom - HIT_HEIGHT < topLimit || r.bottom > bottomLimit + 1) {
      bar.classList.remove('igs-on');
      return r;
    }
    const parent = host || document.documentElement;
    if (bar.parentNode !== parent) {
      parent.appendChild(bar);
      if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
      last = {};
    }
    let top, left;
    if (host) {
      const hr = host.getBoundingClientRect();
      top = r.bottom - hr.top - host.clientTop + host.scrollTop - HIT_HEIGHT;
      left = r.left - hr.left - host.clientLeft + host.scrollLeft;
    } else {
      top = r.bottom + scrollY - HIT_HEIGHT;
      left = r.left + scrollX;
    }
    setStyle('top', Math.round(top) + 'px');
    setStyle('left', Math.round(left) + 'px');
    setStyle('width', Math.round(r.width) + 'px');
    bar.classList.add('igs-on');
    return r;
  }

  function frame(now) {
    if (!dragging && now - lastPick > 250) {
      lastPick = now;
      const t = pick();
      if (t !== target) { target = t; host = t ? scrollerOf(t) : null; }
      // after your first tap, a video held paused starts when you scroll to it
      if (tapped && target && held.has(target)) release(target);
      measureEdges();
    }
    const r = place();
    if (target && !dragging) draw(target.currentTime);
    if (dbgBox && now - (frame.dbgAt || 0) > 500) {
      frame.dbgAt = now;
      const n = document.querySelectorAll('video').length;
      dbgBox.textContent = 'instagram cleanup running\nvideos on page: ' + n +
        (target ? '\ntarget: ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' bottom ' + Math.round(r.bottom) +
          ' / screen ' + innerHeight + '\nin panel: ' + !!host + '  limits ' + Math.round(topLimit) + '-' + Math.round(bottomLimit) +
          '\nlength: ' + lengthOf(target).toFixed(1) + 's  at ' + target.currentTime.toFixed(1) +
          '\nmuted: ' + target.muted + '  sound wanted: ' + soundWanted + '  tapped: ' + tapped +
          '\nbar shown: ' + bar.classList.contains('igs-on') : '\ntarget: none');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- Sound on by default ----
  // Browsers only allow sound after you've tapped or clicked the page once.
  // So: on your first tap anywhere, the video you're on gets its sound
  // turned on (using Instagram's own sound button, so its icon matches), and
  // every video after that starts with sound. Muting one yourself keeps
  // sound off until you turn it back on.
  let soundWanted = SOUND_ON;
  let tapped = false;
  let mutedBefore = null;
  let clickVideo = null;
  let ourClick = false;
  const held = new WeakSet(); // videos paused here until your first tap

  // Turn sound on through Instagram's own button (so its icon matches)
  function unmute(v) {
    const btn = soundButtonFor(v);
    if (btn) { ourButtonAt = Date.now(); ourClick = true; try { btn.click(); } catch (err) {} ourClick = false; }
    if (v.muted) setMuted(v, false);
  }
  function release(v) {
    if (held.has(v)) { held.delete(v); if (v.paused) v.play().catch(() => {}); }
  }

  // Before your first tap: anything that starts playing waits paused
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!START_PAUSED || !SOUND_ON || tapped || v.tagName !== 'VIDEO') return;
    held.add(v);
    v.pause();
  }, true);
  // ...including any that already started before this script loaded
  if (START_PAUSED && SOUND_ON) {
    document.querySelectorAll('video').forEach((v) => { if (!v.paused) { held.add(v); v.pause(); } });
  }


  function soundButtonFor(video) {
    let el = video;
    for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
      const hit = el.querySelector('[aria-label*="audio" i], [aria-label*="sound" i], [aria-label*="mute" i]');
      if (hit) return hit.closest('button, [role="button"]') || hit;
    }
    return null;
  }

  // Your first tap goes through to Instagram as normal (so its own play
  // icon and tap-to-play keep working, and it stays in step). Just before
  // Instagram sees it, sound gets turned on; just after, if the video still
  // isn't playing, it gets started. So that one tap = playing, with sound.
  let firstTap = null;   // the video your first tap was for
  let firstTapAt = 0;

  // Before Instagram sees the tap
  window.addEventListener('click', (e) => {
    if (!e.isTrusted || ourClick) return;
    clickVideo = pick();
    if (!tapped) {
      tapped = true;
      firstTapAt = Date.now();
      const v = clickVideo;
      if (v) {
        firstTap = v;
        held.delete(v);
        const btn = soundButtonFor(v);
        const onSoundButton = btn && btn.contains(e.target);
        if (soundWanted && v.muted && !onSoundButton) unmute(v);
        // In case Instagram keeps this tap to itself, finish shortly after anyway
        setTimeout(() => finishFirstTap(v), 250);
      }
      mutedBefore = null;
      return;
    }
    mutedBefore = clickVideo ? clickVideo.muted : null;
  }, true);

  function finishFirstTap(v) {
    if (firstTap !== v) return;
    firstTap = null;
    if (soundWanted && v.muted) setMuted(v, false);
    if (v.paused) v.play().catch(() => {});
  }

  // After Instagram has handled the tap
  window.addEventListener('click', (e) => {
    if (!e.isTrusted || ourClick) return;
    const v = clickVideo;
    clickVideo = null;
    if (firstTap) { finishFirstTap(firstTap); return; }
    if (!v || mutedBefore === null) return;
    if (!mutedBefore && v.muted) { soundWanted = false; return; }  // you muted it
    if (mutedBefore && !v.muted) soundWanted = true;               // you unmuted it
    else if (soundWanted && v.muted) unmute(v);
    release(v);
  });

  // New videos: turn sound on as they start, once you've tapped the page.
  // If the browser refuses (it pauses the video), put it back to muted and
  // playing, and try again after your next tap.
  const retries = new WeakMap();
  const ours = new WeakMap(); // sound changes this script made, so they aren't mistaken for yours
  function setMuted(v, m) {
    ours.set(v, { muted: m, at: Date.now() });
    v.muted = m;
  }
  function soundOn(v) {
    if (!soundWanted || !tapped || !v.muted || v.paused) return;
    const n = retries.get(v) || 0;
    if (n >= 3) return; // Instagram keeps muting it: don't fight
    retries.set(v, n + 1);
    setMuted(v, false);
    setTimeout(() => {
      if (v.paused && !v.muted && v.isConnected) {
        setMuted(v, true);
        v.play().catch(() => {});
        tapped = false;
      }
    }, 200);
  }
  document.addEventListener('playing', (e) => { if (e.target.tagName === 'VIDEO') soundOn(e.target); }, true);
  document.addEventListener('volumechange', (e) => {
    const v = e.target;
    if (v.tagName !== 'VIDEO') return;
    const mine = ours.get(v);
    if (mine && mine.muted === v.muted && Date.now() - mine.at < 1000) { ours.delete(v); return; }
    // Changed right after you tapped: that's you using the sound button.
    // Remember it for the next videos.
    if (Date.now() - lastUserTap < 800 && !ourClickAt() && Date.now() - firstTapAt > 1000 && !v.paused && v.currentTime > 0.3) { soundWanted = !v.muted; return; }
    if (v.muted && !v.paused) setTimeout(() => soundOn(v), 0);
  }, true);
  // Instagram's own reaction to the script pressing its sound button
  let ourButtonAt = 0;
  const ourClickAt = () => Date.now() - ourButtonAt < 800;
  let lastUserTap = 0;
  window.addEventListener('pointerdown', (e) => { if (e.isTrusted) lastUserTap = Date.now(); }, true);

  // ---- Hide "Use the app" bars ----
  // Find the wording, then hide the smallest box around it that holds only
  // that bar (its text plus a close X), never the bottom tab bar it sits on.
  const NAG_TEXT = ['use the app', 'get the app', 'open app', 'open in app', 'use app', 'open instagram'];
  const NAG_XPATH = '//*[not(self::script or self::style)][' +
    NAG_TEXT.map((t) => `translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${t}'`).join(' or ') + ']';
  const nagWords = (s) => NAG_TEXT.includes(s.replace(/\s+/g, ' ').trim().toLowerCase());
  // A box's words, leaving out icon labels (the close X's svg has a hidden
  // "Close" title) and the close/dismiss button's own text
  const CLOSE_WORDS = /\b(close|dismiss|not now)\b/gi;
  const boxWords = (el) => {
    let t = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.parentElement && n.parentElement.closest('svg, script, style')) continue;
      t += ' ' + n.nodeValue;
    }
    return t.replace(CLOSE_WORDS, ' ');
  };

  // ---- Bottom tab bar: remove chosen buttons ----
  const TAB_LINKS = {
    home: 'a[href="/"]',
    reels: 'a[href="/reels/"], a[href^="/reels/?"]',
    explore: 'a[href="/explore/"]',
    messages: 'a[href^="/direct/"]',
  };
  const TAB_LABELS = { home: 'Home', reels: 'Reels', explore: 'Explore', messages: 'Direct' };
  const pinnedBottomBar = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') {
        const r = p.getBoundingClientRect();
        // the tab bar: wide, short, along the bottom of the screen
        return r.bottom >= innerHeight - 4 && r.width > innerWidth * 0.6 && r.height < 140 ? p : null;
      }
    }
    return null;
  };
  function hideNavTabs() {
    for (const name of HIDE_TABS) {
      const links = new Set(document.querySelectorAll(TAB_LINKS[name] || 'x-none'));
      if (TAB_LABELS[name]) {
        document.querySelectorAll(`svg[aria-label="${TAB_LABELS[name]}"]`).forEach((svg) => {
          const a = svg.closest('a, [role="link"], [role="button"]');
          if (a) links.add(a);
        });
      }
      for (const link of links) {
        if (link.closest('[data-igs-hidden]')) continue;
        const nav = pinnedBottomBar(link);
        if (!nav) continue; // only the bottom tab bar, not links elsewhere on the page
        // Hide the whole tab slot so the remaining buttons spread out evenly
        let tab = link;
        while (tab.parentElement && tab.parentElement !== nav &&
               tab.parentElement.querySelectorAll('a[href], [role="link"]').length <= 1) tab = tab.parentElement;
        tab.setAttribute('data-igs-hidden', '');
      }
    }
    if (HIDE_MESSAGE_COUNT) hideMessageCount();
  }

  // The red number on the Messages button (in the tab bar or the side menu)
  const COUNT = /^\d{1,3}\+?$/;
  function hideMessageCount() {
    for (const link of document.querySelectorAll('a[href^="/direct/"]')) {
      // the button's own box: the link plus anything sitting beside it in its slot
      let slot = link;
      for (let i = 0; i < 3 && slot.parentElement &&
           slot.parentElement.querySelectorAll('a[href], [role="link"]').length <= 1; i++) slot = slot.parentElement;
      for (const el of slot.querySelectorAll('span, div')) {
        if (el.closest('[data-igs-hidden]') || el.querySelector('svg, img')) continue; // the icon's box, not the badge
        if (!COUNT.test((el.textContent || '').trim())) continue;
        let badge = el;
        while (badge.parentElement && badge.parentElement !== slot && badge.parentElement !== link &&
               (badge.parentElement.textContent || '').trim() === el.textContent.trim() &&
               !badge.parentElement.querySelector('svg')) badge = badge.parentElement;
        badge.setAttribute('data-igs-hidden', '');
      }
    }
  }
  const TAB_HINT = 'a[href="/"], a[href^="/reels/"], a[href^="/direct/"], a[href="/explore/"], svg[aria-label="Home"], svg[aria-label="Reels"]';

  function hideAppNags() {
    const hits = document.evaluate(NAG_XPATH, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < hits.snapshotLength; i++) {
      let box = hits.snapshotItem(i);
      if (box.closest('[data-igs-hidden], #igs-bar')) continue;
      for (let p = box.parentElement; p && p !== document.body; p = p.parentElement) {
        if (!nagWords(boxWords(p))) break;              // holds other words: that's the page/tab bar
        if (p.querySelectorAll('a[href]').length > 1) break;   // holds other links (tab bar icons)
        if (p.getBoundingClientRect().height > 160) break;     // bigger than a bar
        box = p;
      }
      box.setAttribute('data-igs-hidden', '');
    }
  }
  style.textContent += '[data-igs-hidden] { display: none !important; }';

  // Check before each redraw when the page changes, so the bar never shows
  let nagQueued = false;
  new MutationObserver((records) => {
    // Anything new mentioning "app": check right now, before it's drawn
    for (const rec of records) {
      for (const n of rec.addedNodes) {
        if (/\bapp\b|instagram/i.test(n.textContent || '')) { try { hideAppNags(); } catch (e) {} }
        // Tab bar redrawn, or a new message count: tidy it before it's drawn
        if ((n.nodeType === 1 && (n.matches(TAB_HINT) || n.querySelector(TAB_HINT) || (n.closest && n.closest('a[href^="/direct/"]')))) ||
            COUNT.test((n.textContent || '').trim())) {
          try { hideNavTabs(); } catch (e) {}
          return;
        }
      }
    }
    if (nagQueued) return;
    nagQueued = true;
    requestAnimationFrame(() => { nagQueued = false; try { hideAppNags(); } catch (e) {} try { hideNavTabs(); } catch (e) {} });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  hideAppNags();
  hideNavTabs();

  // ---- Tap / drag to jump ----
  const timeAt = (clientX) => {
    const r = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return f * lengthOf(target);
  };
  const seek = (t) => { try { target.currentTime = t; } catch (e) {} };

  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!target || !(lengthOf(target) > 0)) return;
    dragging = true;
    wasPlaying = !target.paused;
    bar.classList.add('igs-dragging');
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
    const t = timeAt(e.clientX);
    draw(t);
    seek(t);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    const t = timeAt(e.clientX);
    draw(t);
    seek(t);
  });
  const end = (e) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
    bar.classList.remove('igs-dragging');
    // Scrubbing counts as your first tap: start the video, with sound
    if (!tapped && e.isTrusted && target) {
      tapped = true;
      if (soundWanted && target.muted) unmute(target);
      if (held.has(target)) { release(target); return; }
    }
    if (wasPlaying && target && target.paused) target.play().catch(() => {});
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  // Keep taps on the bar away from Instagram (tap-to-pause / mute / like)
  ['click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'dblclick']
    .forEach((ev) => bar.addEventListener(ev, (e) => { e.stopPropagation(); if (ev.startsWith('touch')) e.preventDefault(); }, { passive: false }));
  }
  if (document.body) main(); else document.addEventListener('DOMContentLoaded', main, { once: true });
})();
