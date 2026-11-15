// ==UserScript==
// @name         Instagram Scrubber
// @namespace    instagram-scrubber
// @version      1.1
// @description  Adds a progress bar you can drag to Instagram videos on the website (posts, Reels, stories), like the app's: tap or drag to jump, with the time shown while you do.
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @grant        none
// @inject-into  auto
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/instagram-scrubber.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/instagram-scrubber.user.js
// ==/UserScript==

// How it works: one bar floats above the whole page (outside Instagram's own
// layout, so nothing of theirs can hide, clip or remove it) and lines itself
// up with the bottom edge of whichever video is most on screen.
//
// Not showing up? Add #igs-debug to the end of the page address and reload:
// a small box shows whether the script is running and what it sees.

(function () {
  'use strict';

  // ---- Settings ----
  const BAR_COLOR = '#ffffff';
  const SHOW_TIME_ALWAYS = false; // true: always show "0:12 / 0:45", not just while scrubbing
  const HIT_HEIGHT = 22;          // touchable height in px (the visible line is thinner)

  let debug = false;
  try {
    if (location.hash.includes('igs-debug')) sessionStorage.setItem('igs-debug', '1');
    debug = sessionStorage.getItem('igs-debug') === '1';
  } catch (e) { debug = location.hash.includes('igs-debug'); }

  const style = document.createElement('style');
  style.textContent = `
    #igs-bar {
      position: fixed; left: 0; top: 0; width: 0; height: ${HIT_HEIGHT}px;
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

  function place() {
    if (!target || !target.isConnected) { bar.classList.remove('igs-on'); return null; }
    const r = target.getBoundingClientRect();
    const vh = innerHeight;
    // Only when the video's bottom edge is on screen (where the app puts its bar)
    if (r.bottom > vh + 1 || r.bottom < HIT_HEIGHT + 20 || r.width < 120) { bar.classList.remove('igs-on'); return r; }
    const left = Math.max(r.left, 0);
    const right = Math.min(r.right, innerWidth);
    bar.style.left = left + 'px';
    bar.style.width = (right - left) + 'px';
    bar.style.top = (r.bottom - HIT_HEIGHT) + 'px';
    bar.classList.add('igs-on');
    return r;
  }

  function frame(now) {
    if (!dragging && now - lastPick > 250) {
      lastPick = now;
      target = pick();
    }
    const r = place();
    if (target && !dragging) draw(target.currentTime);
    if (dbgBox && now - (frame.dbgAt || 0) > 500) {
      frame.dbgAt = now;
      const n = document.querySelectorAll('video').length;
      dbgBox.textContent = 'scrubber v1.1 running\nvideos on page: ' + n +
        (target ? '\ntarget: ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' bottom ' + Math.round(r.bottom) +
          ' / screen ' + innerHeight + '\nlength: ' + lengthOf(target).toFixed(1) + 's  at ' + target.currentTime.toFixed(1) +
          '\nbar shown: ' + bar.classList.contains('igs-on') : '\ntarget: none');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

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
    if (wasPlaying && target && target.paused) target.play().catch(() => {});
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  // Keep taps on the bar away from Instagram (tap-to-pause / mute / like)
  ['click', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'dblclick']
    .forEach((ev) => bar.addEventListener(ev, (e) => { e.stopPropagation(); if (ev.startsWith('touch')) e.preventDefault(); }, { passive: false }));
})();
