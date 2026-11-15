// ==UserScript==
// @name         Cookie Banner Begone
// @namespace    cookie-banner-begone
// @version      1.0
// @description  Answers cookie banners for you on every site: clicks "Reject all" / "Necessary only" when there is one (so the site saves your answer), otherwise hides the banner and unfreezes the page. Add #cookies-off to a page's address to turn it off for that site.
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @inject-into  auto
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/cookie-banner-begone.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/cookie-banner-begone.user.js
// ==/UserScript==

// Runs in every page and every embedded frame (some cookie pop-ups live in
// their own frame), but only acts on things that are clearly cookie banners.

(function () {
  'use strict';

  // ---- Settings ----
  // 'reject': click "Reject all" / "Necessary only" when offered, else hide
  // 'hide':   never click anything, just hide the banner
  // 'accept': click "Accept all" (fewest "enable cookies to view" gaps)
  const ANSWER = 'reject';

  // ---- Per-site off switch (#cookies-off / #cookies-on in the address) ----
  const OFF_KEY = 'cookies-off';
  try {
    if (location.hash.includes('cookies-off')) localStorage.setItem(OFF_KEY, '1');
    if (location.hash.includes('cookies-on')) localStorage.removeItem(OFF_KEY);
    if (localStorage.getItem(OFF_KEY) === '1') return;
  } catch (e) {}

  // =====================================================================
  // The common cookie-banner services, by name
  // =====================================================================
  // Banner boxes and their dimmed backdrops: hidden before they're drawn
  const KNOWN_BANNERS = [
    '#onetrust-consent-sdk', '#onetrust-banner-sdk', '.onetrust-pc-dark-filter',  // OneTrust
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',                 // Cookiebot
    '.qc-cmp2-container', '#qc-cmp2-container', '.qc-cmp-cleanslate',            // Quantcast
    '#truste-consent-track', '.truste_box_overlay', '.truste_overlay', '#consent_blackbar', // TrustArc
    '#didomi-host', '.didomi-popup-backdrop',                                     // Didomi
    '#usercentrics-root', '#usercentrics-cmp-ui',                                 // Usercentrics
    '[id^="sp_message_container"]', '.sp_veil',                                   // Sourcepoint
    '.osano-cm-window', '.osano-cm-dialog',                                       // Osano
    '.cky-consent-container', '.cky-overlay', '.cky-modal',                       // CookieYes
    '.cmplz-cookiebanner', '#cmplz-cookiebanner-container',                       // Complianz
    '#termly-code-snippet-support', '.termly-styles-root',                        // Termly
    '#iubenda-cs-banner', '.iubenda-cs-overlay',                                  // iubenda
    '.klaro .cookie-notice', '.klaro .cookie-modal',                              // Klaro
    '.fc-consent-root', '.fc-dialog-overlay',                                     // Google consent
    '#cookie-notice', '#cookie-law-info-bar', '.cli-modal-backdrop',              // WordPress plugins
    '#BorlabsCookieBox', '#axeptio_overlay', '#cmpbox', '#cmpbox2',               // Borlabs, Axeptio, consentmanager
    '#hs-eu-cookie-confirmation', '.evidon-banner', '#_evidon_banner',            // HubSpot, Evidon
    '#gdpr-cookie-message', '.cc-window', '.cc-banner', '.cookieconsent',         // cookieconsent library
  ];

  // Their "reject" / "necessary only" buttons
  const KNOWN_REJECT = [
    '#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler',
    '#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '#didomi-notice-disagree-button', '.didomi-continue-without-agreeing',
    '[data-testid="uc-deny-all-button"]',
    '.osano-cm-denyAll', '.osano-cm-button--type_denyAll',
    '.cky-btn-reject', '.cmplz-deny', '.cmplz-btn.cmplz-deny',
    '.iubenda-cs-reject-btn', '#truste-consent-required', '.fc-cta-do-not-consent',
    '#cookie_action_close_header_reject', '.cn-decline', '#cn-refuse-cookie',
    '#hs-eu-decline-button', '.axeptio_btn_dismiss', '.cmpboxbtnno', '.cc-deny',
    'button.sp_choice_type_13', 'button[title="Reject All" i]', 'button[title="Reject all" i]',
  ];

  // Their "accept all" buttons (only used if ANSWER is 'accept')
  const KNOWN_ACCEPT = [
    '#onetrust-accept-btn-handler', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#CybotCookiebotDialogBodyButtonAccept', '#didomi-notice-agree-button', '[data-testid="uc-accept-all-button"]',
    '.osano-cm-acceptAll', '.cky-btn-accept', '.cmplz-accept', '.iubenda-cs-accept-btn', '.fc-cta-consent',
    '#cookie_action_close_header', '#cn-accept-cookie', '#hs-eu-confirmation-button', '.cmpboxbtnyes', '.cc-allow',
    'button.sp_choice_type_11', 'button[title="Accept All" i]', 'button[title="Accept all" i]',
  ];

  // Button wording, for banners from services not listed above
  const REJECT_WORDS = /^(reject|reject all|reject all cookies|reject cookies|reject non-essential( cookies)?|decline|decline all|decline cookies|deny|deny all|refuse|refuse all|disagree|i disagree|do not accept|don't accept|don’t accept|no,? thanks|no thanks|necessary only|necessary cookies only|only necessary|only necessary cookies|essential only|essential cookies only|only essential|only essential cookies|use necessary cookies only|allow necessary only|accept necessary|accept only necessary|accept only essential( cookies)?|continue without accepting|continue without agreeing|manage choices then reject)$/i;
  const ACCEPT_WORDS = /^(accept|accept all|accept all cookies|accept cookies|allow all|allow all cookies|allow cookies|agree|i agree|agree and close|agree & close|ok|okay|got it|i understand|i accept|yes,? i('m| am) happy|continue)$/i;
  const COOKIE_TEXT = /cookie|cookies|consent|gdpr|ccpa|tracking technologies|your privacy choices|privacy preferences|we value your privacy|personal data|partners process/i;

  // =====================================================================
  // Hide the known banners straight away (no flash)
  // =====================================================================
  const style = document.createElement('style');
  style.textContent = `
    ${KNOWN_BANNERS.join(',\n    ')},
    [data-cbb-hidden] { display: none !important; }

    /* Pages freeze scrolling while a cookie banner is open; undo that */
    html.cbb-unlock, html.cbb-unlock body {
      overflow: auto !important; position: static !important; height: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Class names some services add to freeze the page while their banner shows
  const FREEZE_CLASSES = ['didomi-popup-open', 'sp-message-open', 'qc-cmp-ui-showing', 'cky-modal-open',
    'cmplz-modal-open', 'onetrust-pc-open', 'ot-overflow-hidden', 'cookie-modal-open', 'no-scroll', 'noscroll',
    'overflow-hidden', 'modal-open', 'cmpbox-open', 'tcf-open', 'fc-consent-open'];

  function unfreeze() {
    const html = document.documentElement, body = document.body;
    html.classList.add('cbb-unlock');
    for (const el of [html, body]) {
      if (!el) continue;
      FREEZE_CLASSES.forEach((c) => el.classList.remove(c));
      if (el.style.overflow === 'hidden') el.style.overflow = '';
      if (el.style.position === 'fixed') { el.style.position = ''; el.style.top = ''; }
    }
  }

  // =====================================================================
  // Answering and hiding
  // =====================================================================
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const clicked = new WeakSet();
  let lastHandled = 0; // when a banner was last dealt with

  function clickOnce(btn) {
    if (!btn || clicked.has(btn)) return false;
    clicked.add(btn);
    try { btn.click(); } catch (e) {}
    return true;
  }

  // Look inside sealed-off sections too (some services, like Usercentrics,
  // draw their banner there). Only where cookie services put them, since
  // checking every element on a big page would be slow.
  const SEALED_HOSTS = 'body > *, #usercentrics-root, #usercentrics-cmp-ui, [id*="consent" i], [id*="cookie" i], [class*="consent" i], [class*="cookie" i]';
  function queryAllDeep(root, selector) {
    const out = [...root.querySelectorAll(selector)];
    root.querySelectorAll(SEALED_HOSTS).forEach((el) => {
      if (el.shadowRoot) out.push(...el.shadowRoot.querySelectorAll(selector));
    });
    return out;
  }

  function answerKnown() {
    if (ANSWER === 'hide') return false;
    const list = ANSWER === 'accept' ? KNOWN_ACCEPT : KNOWN_REJECT;
    let did = false;
    for (const btn of queryAllDeep(document, list.join(','))) if (clickOnce(btn)) did = true;
    return did;
  }

  // A button inside a banner whose wording means the chosen answer
  function answerButtonIn(banner) {
    if (ANSWER === 'hide') return null;
    const words = ANSWER === 'accept' ? ACCEPT_WORDS : REJECT_WORDS;
    const buttons = [...banner.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"], a')];
    return buttons.find((b) => words.test((b.value || textOf(b) || b.getAttribute('aria-label') || '').trim())) || null;
  }

  // The site's main content, which must never be hidden
  function isPageContent(el) {
    if (el.matches('html, body, main, article, [role="main"]')) return true;
    if (el.querySelector('main, article, [role="main"]')) return true;
    return textOf(el).length > 2500;
  }

  // Banners from services not listed: pinned to the screen (or a dialog),
  // talking about cookies or consent, with buttons, and not the page itself
  const CANDIDATES = 'body > *, body > * > *, [role="dialog"], [aria-modal="true"], dialog[open], ' +
    '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i]';

  function isOtherBanner(el) {
    if (el.closest('[data-cbb-hidden]') || el.closest('footer, nav')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const pinned = cs.position === 'fixed' || cs.position === 'sticky' || el.matches('[role="dialog"], [aria-modal="true"], dialog[open]');
    if (!pinned) return false;
    const r = el.getBoundingClientRect();
    if (r.width < Math.min(260, window.innerWidth * 0.4) || r.height < 40) return false;
    const text = textOf(el);
    if (text.length < 20 || text.length > 2500 || !COOKIE_TEXT.test(text)) return false;
    if (!el.querySelector('button, [role="button"], input[type="button"], input[type="submit"], a')) return false;
    return !isPageContent(el);
  }

  // Keep only the outermost of nested matches
  const outermost = (list) => list.filter((el) => !list.some((other) => other !== el && other.contains(el)));

  function findOtherBanners() {
    return outermost([...document.querySelectorAll(CANDIDATES)].filter(isOtherBanner));
  }

  function handleBanner(banner) {
    clickOnce(answerButtonIn(banner));
    banner.setAttribute('data-cbb-hidden', '');
    lastHandled = Date.now();
  }

  // Instant check of anything just added to the page, before the screen is
  // redrawn, so a new banner is gone before it's ever seen
  function checkAdded(records) {
    if (!document.body) return;
    const added = [];
    for (const rec of records) {
      for (const node of rec.addedNodes) {
        if (node.nodeType !== 1) continue;
        added.push(node);
        if (node.querySelectorAll) node.querySelectorAll('[role="dialog"], [aria-modal="true"], [id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i]').forEach((d) => added.push(d));
      }
    }
    if (!added.length || added.length > 400) return; // big page changes: leave to the regular check
    const banners = outermost(added.filter((el) => el.isConnected && isOtherBanner(el)));
    if (banners.length) {
      banners.forEach(handleBanner);
      hideEmptyBackdrops();
      unfreeze();
    }
  }

  // A full-screen dimmed layer with nothing in it, left behind by a banner
  function hideEmptyBackdrops() {
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const el of document.querySelectorAll('body > div, body > span')) {
      if (el.hasAttribute('data-cbb-hidden')) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
      if (textOf(el).length > 0 || el.querySelector('img, video, iframe, input, button, a')) continue;
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)' && parseFloat(cs.opacity) > 0.95) continue; // not dimmed
      el.setAttribute('data-cbb-hidden', '');
    }
  }

  const seenKnown = new WeakSet();

  function sweep() {
    if (!document.body) return;
    let acted = answerKnown();

    // A known banner that just appeared (already hidden by style) counts too
    for (const el of document.querySelectorAll(KNOWN_BANNERS.join(','))) {
      if (!seenKnown.has(el)) { seenKnown.add(el); acted = true; }
    }

    for (const banner of findOtherBanners()) {
      handleBanner(banner);
      acted = true;
    }

    if (acted) {
      lastHandled = Date.now();
      hideEmptyBackdrops();
    }
    // Unfreeze scrolling only in the few seconds after dealing with a banner,
    // so the site's own pop-ups (menus, photo viewers) can still lock it later
    if (lastHandled && Date.now() - lastHandled < 4000) unfreeze();
  }

  // Banners usually appear in the first few seconds; check as the page
  // changes, at most a few times a second, and then less often
  let queued = false;
  let last = 0;
  function schedule() {
    if (queued) return;
    queued = true;
    const wait = Math.max(0, 250 - (Date.now() - last));
    setTimeout(() => requestAnimationFrame(() => { queued = false; last = Date.now(); sweep(); }), wait);
  }
  const observer = new MutationObserver((records) => {
    try { checkAdded(records); } catch (e) {}
    schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedule();
  window.addEventListener('load', schedule);
  // After half a minute, only check occasionally (banners rarely appear later)
  setTimeout(() => { observer.disconnect(); setInterval(schedule, 3000); }, 30000);
})();
