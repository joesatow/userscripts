// ==UserScript==
// @name         Instagram Scrubber
// @namespace    instagram-scrubber
// @version      1.0
// @description  Adds a progress bar you can drag to every Instagram video on the website (posts, Reels, stories), like the app's: tap or drag to jump, with the time shown while you do.
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @grant        none
// @inject-into  auto
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/instagram-scrubber.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/instagram-scrubber.user.js
// ==/UserScript==

// Instagram's security settings block scripts inside its own page code in
// Safari, so this runs in the userscript app's own space ("auto"). It only
// needs the video elements themselves, which work fine from there.

(function () {
  'use strict';

  // ---- Settings ----
  const BAR_COLOR = '#ffffff';
  const SHOW_TIME_ALWAYS = false; // true: always show "0:12 / 0:45", not just while scrubbing

  const style = document.createElement('style');
  style.textContent = `
    .igs-bar {
      position: absolute; left: 0; right: 0; bottom: 0; height: 18px;
      z-index: 2147483000; cursor: pointer; touch-action: none;
      display: flex; align-items: flex-end;
    }
    .igs-track {
      position: relative; width: 100%; height: 3px;
      background: rgba(255,255,255,.3); transition: height .12s;
    }
    .igs-bar:hover .igs-track, .igs-bar.igs-dragging .igs-track { height: 7px; }
    .igs-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: ${BAR_COLOR}; }
    .igs-knob {
      position: absolute; top: 50%; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px;
      border-radius: 50%; background: ${BAR_COLOR}; box-shadow: 0 0 3px rgba(0,0,0,.5);
      opacity: 0; transition: opacity .12s;
    }
    .igs-bar:hover .igs-knob, .igs-bar.igs-dragging .igs-knob { opacity: 1; }
    .igs-time {
      position: absolute; left: 8px; bottom: 14px; padding: 2px 6px; border-radius: 4px;
      background: rgba(0,0,0,.6); color: #fff; font: 600 12px/1.3 -apple-system, system-ui, sans-serif;
      opacity: ${SHOW_TIME_ALWAYS ? 1 : 0}; transition: opacity .12s; pointer-events: none;
    }
    .igs-bar:hover .igs-time, .igs-bar.igs-dragging .igs-time { opacity: 1; }
  `;
  document.head.appendChild(style);

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // The box the video fills: the outermost container exactly the video's
  // size (Instagram stacks see-through layers over the video inside it)
  function mediaBox(video) {
    const vr = video.getBoundingClientRect();
    let box = video.parentElement;
    for (let el = video.parentElement; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - vr.width) > 3 || Math.abs(r.height - vr.height) > 3) break;
      box = el;
    }
    return box;
  }

  const attached = new WeakSet();

  function attach(video) {
    if (attached.has(video)) return;
    const vr = video.getBoundingClientRect();
    if (vr.width < 120 || vr.height < 80) return; // not laid out yet, or a tiny preview
    attached.add(video);

    const box = mediaBox(video);
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';

    const bar = document.createElement('div');
    bar.className = 'igs-bar';
    const track = document.createElement('div');
    track.className = 'igs-track';
    const fill = document.createElement('div');
    fill.className = 'igs-fill';
    const knob = document.createElement('div');
    knob.className = 'igs-knob';
    const time = document.createElement('div');
    time.className = 'igs-time';
    track.append(fill, knob);
    bar.append(time, track);
    box.appendChild(bar);

    function draw(t) {
      const d = video.duration;
      const f = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
      fill.style.width = (f * 100) + '%';
      knob.style.left = (f * 100) + '%';
      time.textContent = fmt(t) + ' / ' + fmt(d);
    }

    // Smooth while playing, and right away on any change
    let raf = 0;
    function loop() {
      if (!dragging) draw(video.currentTime);
      raf = video.paused || !video.isConnected ? 0 : requestAnimationFrame(loop);
    }
    ['play', 'playing'].forEach((ev) => video.addEventListener(ev, () => { if (!raf) raf = requestAnimationFrame(loop); }));
    ['timeupdate', 'seeked', 'loadedmetadata', 'durationchange'].forEach((ev) =>
      video.addEventListener(ev, () => { if (!dragging) draw(video.currentTime); }));

    // Tap / drag to jump. The bar keeps these taps to itself, so Instagram's
    // tap-to-pause and tap-to-mute don't also fire.
    let dragging = false;
    let wasPlaying = false;
    const timeAt = (clientX) => {
      const r = track.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return f * (video.duration || 0);
    };
    const swallow = (e) => { e.stopPropagation(); };

    bar.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!(video.duration > 0)) return;
      dragging = true;
      wasPlaying = !video.paused;
      bar.classList.add('igs-dragging');
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      const t = timeAt(e.clientX);
      draw(t);
      video.currentTime = t;
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();
      const t = timeAt(e.clientX);
      draw(t);
      video.currentTime = t;
    });
    const end = (e) => {
      if (!dragging) return;
      e.stopPropagation();
      dragging = false;
      bar.classList.remove('igs-dragging');
      if (wasPlaying && video.paused) video.play().catch(() => {});
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick'].forEach((ev) => bar.addEventListener(ev, swallow));

    draw(video.currentTime);
  }

  function scan() {
    document.querySelectorAll('video').forEach(attach);
  }

  // Instagram adds videos as you scroll; check new ones as they appear
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; scan(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(scan, 2000);
  scan();
})();
