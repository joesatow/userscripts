// ==UserScript==
// @name         Fabric Dark
// @namespace    fabric-dark
// @version      2.5
// @description  Dark mode for Microsoft Fabric / Power BI using Dark Reader's own theme engine, with a sun/moon button in the top bar and a light cursor in notebook cells that only appears in dark mode.
// @match        https://app.fabric.microsoft.com/*
// @match        https://*.fabric.microsoft.com/*
// @match        https://app.powerbi.com/*
// @match        https://*.powerbi.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @sandbox      raw
// @connect      powerbi.com
// @connect      fabric.microsoft.com
// @connect      microsoft.com
// @connect      powerapps.com
// @connect      office.net
// @connect      office.com
// @connect      sharepointonline.com
// @connect      azureedge.net
// @connect      windows.net
// @connect      msecnd.net
// @connect      akamaized.net
// @connect      azure.net
// @require      https://cdn.jsdelivr.net/npm/darkreader@4.9.133/darkreader.js
// @updateURL    https://raw.githubusercontent.com/joesatow/userscripts/main/fabric-dark.user.js
// @downloadURL  https://raw.githubusercontent.com/joesatow/userscripts/main/fabric-dark.user.js
// ==/UserScript==

/* global DarkReader */
(function () {
  'use strict';

  // ---- Settings: same as your Dark Reader setup ----
  const THEME = {
    mode: 1,                               // 1 = dark
    brightness: 135,                       // your +35
    contrast: 100,
    sepia: 0,
    grayscale: 0,
    darkSchemeBackgroundColor: '#181a1b',
    darkSchemeTextColor: '#e8e6e3',
  };

  // Notebook (code editor) cursor color in dark mode
  const CURSOR_COLOR = '#e8e6e3';

  // Extra styles that only exist while dark mode is on, so they vanish
  // when it's off (this is what fixes the light-cursor-in-light-mode problem)
  const FIXES = {
    css: `
      .monaco-editor .cursors-layer .cursor,
      .monaco-editor .cursor,
      .monaco-editor .cursor-line,
      .monaco-editor .cursor-block {
        background-color: ${CURSOR_COLOR} !important;
        border-color: ${CURSOR_COLOR} !important;
      }
      .monaco-editor {
        --vscode-editorCursor-foreground: ${CURSOR_COLOR} !important;
      }
    `,
    invert: [],
    ignoreInlineStyle: [],
    ignoreImageAnalysis: [],
    disableStyleSheetsProxy: false,
    ignoreCSSUrl: [],
  };

  const isTop = window.top === window;
  const STORE_KEY = 'fabric-dark-enabled';

  // ---- The engine's style watcher ----
  // Fabric adds most of its colors from its own code, and the engine only sees
  // those if a small watcher is installed in the page. The engine normally
  // installs it by inserting a script tag, which Fabric's security settings
  // block. So when the engine tries, this script runs the watcher directly.
  // (This is Dark Reader's own watcher code, copied from version 4.9.133.)
  function injectProxy(
          enableStyleSheetsProxy,
          enableCustomElementRegistryProxy
      ) {
          document.dispatchEvent(
              new CustomEvent("__darkreader__inlineScriptsAllowed")
          );
          const cleaners = [];
          function cleanUp() {
              cleaners.forEach((clean) => clean());
              cleaners.splice(0);
          }
          function documentEventListener(type, listener, options) {
              document.addEventListener(type, listener, options);
              cleaners.push(() => document.removeEventListener(type, listener));
          }
          function disableConflictingPlugins() {
              const disableWPDarkMode = () => {
                  if (window?.WPDarkMode?.deactivate) {
                      window.WPDarkMode.deactivate();
                  }
              };
              disableWPDarkMode();
          }
          documentEventListener("__darkreader__cleanUp", cleanUp);
          documentEventListener(
              "__darkreader__disableConflictingPlugins",
              disableConflictingPlugins
          );
          function overrideProperty(cls, prop, overrides) {
              const proto = cls.prototype;
              const oldDescriptor = Object.getOwnPropertyDescriptor(proto, prop);
              if (!oldDescriptor) {
                  return;
              }
              const newDescriptor = {...oldDescriptor};
              Object.keys(overrides).forEach((key) => {
                  const factory = overrides[key];
                  newDescriptor[key] = factory(oldDescriptor[key]);
              });
              Object.defineProperty(proto, prop, newDescriptor);
              cleaners.push(() =>
                  Object.defineProperty(proto, prop, oldDescriptor)
              );
          }
          function override(cls, prop, factory) {
              overrideProperty(cls, prop, {value: factory});
          }
          function isDRElement(element) {
              return element?.classList?.contains("darkreader");
          }
          function isDRSheet(sheet) {
              return isDRElement(sheet.ownerNode);
          }
          const updateSheetEvent = new CustomEvent("__darkreader__updateSheet");
          const adoptedSheetChangeEvent = new CustomEvent(
              "__darkreader__adoptedStyleSheetChange"
          );
          const shadowDomAttachingEvent = new CustomEvent(
              "__darkreader__shadowDomAttaching",
              {bubbles: true}
          );
          const adoptedSheetOwners = new WeakMap();
          const adoptedDeclarationSheets = new WeakMap();
          function onAdoptedSheetChange(sheet) {
              const owners = adoptedSheetOwners.get(sheet);
              owners?.forEach((node) => {
                  if (node.isConnected) {
                      node.dispatchEvent(adoptedSheetChangeEvent);
                  } else {
                      owners.delete(node);
                  }
              });
          }
          function reportSheetChange(sheet) {
              if (sheet.ownerNode && !isDRSheet(sheet)) {
                  sheet.ownerNode.dispatchEvent(updateSheetEvent);
              }
              if (adoptedSheetOwners.has(sheet)) {
                  onAdoptedSheetChange(sheet);
              }
          }
          function reportSheetChangeAsync(sheet, promise) {
              const {ownerNode} = sheet;
              if (
                  ownerNode &&
                  !isDRSheet(sheet) &&
                  promise &&
                  promise instanceof Promise
              ) {
                  promise.then(() => ownerNode.dispatchEvent(updateSheetEvent));
              }
              if (adoptedSheetOwners.has(sheet)) {
                  if (promise && promise instanceof Promise) {
                      promise.then(() => onAdoptedSheetChange(sheet));
                  }
              }
          }
          override(
              CSSStyleSheet,
              "addRule",
              (native) =>
                  function (selector, style, index) {
                      native.call(this, selector, style, index);
                      reportSheetChange(this);
                      return -1;
                  }
          );
          override(
              CSSStyleSheet,
              "insertRule",
              (native) =>
                  function (rule, index) {
                      const returnValue = native.call(this, rule, index);
                      reportSheetChange(this);
                      return returnValue;
                  }
          );
          override(
              CSSStyleSheet,
              "deleteRule",
              (native) =>
                  function (index) {
                      native.call(this, index);
                      reportSheetChange(this);
                  }
          );
          override(
              CSSStyleSheet,
              "removeRule",
              (native) =>
                  function (index) {
                      native.call(this, index);
                      reportSheetChange(this);
                  }
          );
          override(
              CSSStyleSheet,
              "replace",
              (native) =>
                  function (cssText) {
                      const returnValue = native.call(this, cssText);
                      reportSheetChangeAsync(this, returnValue);
                      return returnValue;
                  }
          );
          override(
              CSSStyleSheet,
              "replaceSync",
              (native) =>
                  function (cssText) {
                      native.call(this, cssText);
                      reportSheetChange(this);
                  }
          );
          override(
              Element,
              "attachShadow",
              (native) =>
                  function (options) {
                      this.dispatchEvent(shadowDomAttachingEvent);
                      return native.call(this, options);
                  }
          );
          const shouldWrapHTMLElement =
              location.hostname === "baidu.com" ||
              location.hostname.endsWith(".baidu.com");
          if (shouldWrapHTMLElement) {
              override(
                  Element,
                  "getElementsByTagName",
                  (native) =>
                      function (tagName) {
                          if (tagName !== "style") {
                              return native.call(this, tagName);
                          }
                          const getCurrentElementValue = () => {
                              const elements = native.call(this, tagName);
                              return Object.setPrototypeOf(
                                  [...elements].filter(
                                      (element) =>
                                          element && !isDRElement(element)
                                  ),
                                  NodeList.prototype
                              );
                          };
                          let elements = getCurrentElementValue();
                          const nodeListBehavior = {
                              get: function (_, property) {
                                  return getCurrentElementValue()[property];
                              }
                          };
                          elements = new Proxy(elements, nodeListBehavior);
                          return elements;
                      }
              );
          }
          const shouldProxyChildNodes = ["brilliant.org", "www.vy.no"].includes(
              location.hostname
          );
          if (shouldProxyChildNodes) {
              overrideProperty(Node, "childNodes", {
                  get: (native) =>
                      function () {
                          const childNodes = native.call(this);
                          return Object.setPrototypeOf(
                              [...childNodes].filter((element) => {
                                  return !isDRElement(element);
                              }),
                              NodeList.prototype
                          );
                      }
              });
          }
          function resolveCustomElement(tag) {
              customElements.whenDefined(tag).then(() => {
                  document.dispatchEvent(
                      new CustomEvent("__darkreader__isDefined", {detail: {tag}})
                  );
              });
          }
          documentEventListener("__darkreader__addUndefinedResolver", (e) =>
              resolveCustomElement(e.detail.tag)
          );
          if (enableCustomElementRegistryProxy) {
              override(
                  CustomElementRegistry,
                  "define",
                  (native) =>
                      function (name, constructor, options) {
                          resolveCustomElement(name);
                          native.call(this, name, constructor, options);
                      }
              );
          }
          let blobURLAllowed = null;
          function checkBlobURLSupport() {
              if (blobURLAllowed != null) {
                  document.dispatchEvent(
                      new CustomEvent("__darkreader__blobURLCheckResponse", {
                          detail: {blobURLAllowed}
                      })
                  );
                  return;
              }
              const svg =
                  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="transparent"/></svg>';
              const bytes = new Uint8Array(svg.length);
              for (let i = 0; i < svg.length; i++) {
                  bytes[i] = svg.charCodeAt(i);
              }
              const blob = new Blob([bytes], {type: "image/svg+xml"});
              const objectURL = URL.createObjectURL(blob);
              const image = new Image();
              image.onload = () => {
                  blobURLAllowed = true;
                  sendBlobURLCheckResponse();
              };
              image.onerror = () => {
                  blobURLAllowed = false;
                  sendBlobURLCheckResponse();
              };
              image.src = objectURL;
          }
          function sendBlobURLCheckResponse() {
              document.dispatchEvent(
                  new CustomEvent("__darkreader__blobURLCheckResponse", {
                      detail: {blobURLAllowed}
                  })
              );
          }
          documentEventListener(
              "__darkreader__blobURLCheckRequest",
              checkBlobURLSupport
          );
          if (enableStyleSheetsProxy) {
              overrideProperty(Document, "styleSheets", {
                  get: (native) =>
                      function () {
                          let filteredSheetsCache = null;
                          let docSheets = null;
                          const didChange = (newSheets) => {
                              if (
                                  !filteredSheetsCache ||
                                  !docSheets ||
                                  docSheets.length !== newSheets.length
                              ) {
                                  return true;
                              }
                              for (let i = 0; i < docSheets.length; i++) {
                                  if (docSheets[i] !== newSheets[i]) {
                                      return true;
                                  }
                              }
                              return false;
                          };
                          const getCurrentValue = () => {
                              const nativeDocSheets = native.call(this);
                              if (!didChange(nativeDocSheets)) {
                                  return filteredSheetsCache;
                              }
                              docSheets = Array.from(nativeDocSheets);
                              const filteredSheets = docSheets.filter(
                                  (styleSheet) =>
                                      styleSheet.ownerNode &&
                                      !isDRSheet(styleSheet)
                              );
                              filteredSheets.item = (item) =>
                                  filteredSheets[item];
                              filteredSheetsCache = Object.setPrototypeOf(
                                  filteredSheets,
                                  StyleSheetList.prototype
                              );
                              return filteredSheetsCache;
                          };
                          const styleSheetListBehavior = {
                              get: function (_, property) {
                                  return getCurrentValue()[property];
                              }
                          };
                          return new Proxy(
                              getCurrentValue(),
                              styleSheetListBehavior
                          );
                      }
              });
          }
          const adoptedSheetsSourceProxies = new WeakMap();
          const adoptedSheetsProxySources = new WeakMap();
          const adoptedSheetsChangeEvent = new CustomEvent(
              "__darkreader__adoptedStyleSheetsChange"
          );
          const adoptedSheetOverrideCache = new WeakSet();
          const adoptedSheetsSnapshots = new WeakMap();
          const isDRAdoptedSheetOverride = (sheet) => {
              if (!sheet || !sheet.cssRules) {
                  return false;
              }
              if (adoptedSheetOverrideCache.has(sheet)) {
                  return true;
              }
              if (
                  sheet.cssRules.length > 0 &&
                  sheet.cssRules[0].cssText.startsWith(
                      "#__darkreader__adoptedOverride"
                  )
              ) {
                  adoptedSheetOverrideCache.add(sheet);
                  return true;
              }
              return false;
          };
          const areArraysEqual = (a, b) => {
              return a.length === b.length && a.every((x, i) => x === b[i]);
          };
          const onAdoptedSheetsChange = (node) => {
              const prev = adoptedSheetsSnapshots.get(node);
              const curr = (node.adoptedStyleSheets || []).filter(
                  (s) => !isDRAdoptedSheetOverride(s)
              );
              adoptedSheetsSnapshots.set(node, curr);
              if (!prev || !areArraysEqual(prev, curr)) {
                  curr.forEach((sheet) => {
                      if (!adoptedSheetOwners.has(sheet)) {
                          adoptedSheetOwners.set(sheet, new Set());
                      }
                      adoptedSheetOwners.get(sheet).add(node);
                      for (const rule of sheet.cssRules) {
                          const declaration = rule.style;
                          if (declaration) {
                              adoptedDeclarationSheets.set(declaration, sheet);
                          }
                      }
                  });
                  node.dispatchEvent(adoptedSheetsChangeEvent);
              }
          };
          const proxyAdoptedSheetsArray = (node, source) => {
              if (adoptedSheetsProxySources.has(source)) {
                  return source;
              }
              if (adoptedSheetsSourceProxies.has(source)) {
                  return adoptedSheetsSourceProxies.get(source);
              }
              const proxy = new Proxy(source, {
                  deleteProperty(target, property) {
                      delete target[property];
                      return true;
                  },
                  set(target, property, value) {
                      target[property] = value;
                      if (property === "length") {
                          onAdoptedSheetsChange(node);
                      }
                      return true;
                  }
              });
              adoptedSheetsSourceProxies.set(source, proxy);
              adoptedSheetsProxySources.set(proxy, source);
              return proxy;
          };
          [Document, ShadowRoot].forEach((ctor) => {
              overrideProperty(ctor, "adoptedStyleSheets", {
                  get: (native) =>
                      function () {
                          const source = native.call(this);
                          return proxyAdoptedSheetsArray(this, source);
                      },
                  set: (native) =>
                      function (source) {
                          if (adoptedSheetsProxySources.has(source)) {
                              source = adoptedSheetsProxySources.get(source);
                          }
                          native.call(this, source);
                          onAdoptedSheetsChange(this);
                      }
              });
          });
          const adoptedDeclarationChangeEvent = new CustomEvent(
              "__darkreader__adoptedStyleDeclarationChange"
          );
          ["setProperty", "removeProperty"].forEach((key) => {
              override(CSSStyleDeclaration, key, (native) => {
                  return function (...args) {
                      const returnValue = native.apply(this, args);
                      const sheet = adoptedDeclarationSheets.get(this);
                      if (sheet) {
                          const owners = adoptedSheetOwners.get(sheet);
                          if (owners) {
                              owners.forEach((node) => {
                                  node.dispatchEvent(
                                      adoptedDeclarationChangeEvent
                                  );
                              });
                          }
                      }
                      return returnValue;
                  };
              });
          });
      }
  function interceptWatcher(method) {
    const original = Node.prototype[method];
    Node.prototype[method] = function (node, ...rest) {
      if (
        node instanceof HTMLScriptElement &&
        node.classList.contains('darkreader--proxy')
      ) {
        const args = (node.textContent.match(/\)\((true|false),\s*(true|false)\)\s*$/) || []);
        try {
          injectProxy(args[1] !== 'false', args[2] !== 'false');
        } catch (e) {
          console.error('[Fabric Dark] style watcher failed', e);
        }
        return node; // handled; don't insert the blocked script tag
      }
      return original.call(this, node, ...rest);
    };
  }
  interceptWatcher('insertBefore');
  interceptWatcher('appendChild');

  // ---- Let the engine read Fabric's style files ----
  // First try loading them the normal way. If the server refuses and it's one
  // of Microsoft's servers listed at the top (@connect, pre-approved, so no
  // pop-ups), load it through Tampermonkey instead. Anything else is skipped.
  const ALLOWED_HOSTS = [
    'powerbi.com', 'fabric.microsoft.com', 'microsoft.com', 'powerapps.com',
    'office.net', 'office.com', 'sharepointonline.com', 'azureedge.net',
    'windows.net', 'msecnd.net', 'akamaized.net',
    'azure.net', // notebook styles: aznbcdn.notebooks.azure.net
  ];

  function isAllowedHost(url) {
    try {
      const host = new URL(url, location.href).hostname;
      return ALLOWED_HOSTS.some((d) => host === d || host.endsWith('.' + d));
    } catch (e) {
      return false;
    }
  }

  const fetchViaTampermonkey = (url) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'blob',
      onload: (r) => {
        const headers = new Headers();
        (r.responseHeaders || '').trim().split(/\r?\n/).forEach((line) => {
          const i = line.indexOf(':');
          if (i > 0) {
            try { headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim()); } catch (e) {}
          }
        });
        const status = r.status >= 200 && r.status <= 599 ? r.status : 200;
        resolve(new Response(r.response, { status, statusText: r.statusText || '', headers }));
      },
      onerror: () => reject(new Error(`Could not load ${url}`)),
      ontimeout: () => reject(new Error(`Timed out loading ${url}`)),
    });
  });

  const fileStats = { loadedDirectly: 0, loadedViaTampermonkey: 0, skipped: [], failed: [] };

  DarkReader.setFetchMethod(async (url) => {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (r.ok) { fileStats.loadedDirectly++; return r; }
    } catch (e) {
      // refused by the server's rules; try the other way below
    }
    if (!isAllowedHost(url) || typeof GM_xmlhttpRequest !== 'function') {
      fileStats.skipped.push(url);
      throw new Error(`Skipped ${url}`);
    }
    try {
      const r = await fetchViaTampermonkey(url);
      fileStats.loadedViaTampermonkey++;
      return r;
    } catch (e) {
      fileStats.failed.push(url);
      throw e;
    }
  });

  // ---- Icons (drawn piece by piece; Fabric blocks pasted-in HTML) ----
  const SVG = 'http://www.w3.org/2000/svg';
  const SUN = '#FFC83D';  // shown in dark mode: click for light
  const MOON = '#8AB4F8'; // shown in light mode: click for dark

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function sunIcon() {
    const svg = svgEl('svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 5, fill: SUN }));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      svg.appendChild(svgEl('line', {
        x1: (12 + Math.cos(a) * 7.5).toFixed(2), y1: (12 + Math.sin(a) * 7.5).toFixed(2),
        x2: (12 + Math.cos(a) * 10.5).toFixed(2), y2: (12 + Math.sin(a) * 10.5).toFixed(2),
        stroke: SUN, 'stroke-width': 2, 'stroke-linecap': 'round',
      }));
    }
    return svg;
  }

  function moonIcon() {
    const svg = svgEl('svg', { width: 20, height: 20, viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', {
      d: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z',
      fill: MOON,
    }));
    return svg;
  }

  // ---- On / off (remembered per site, synced across open tabs) ----
  function readSetting() {
    try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch (e) { return true; }
  }
  let on = readSetting();

  function render() {
    if (on && !DarkReader.isEnabled()) DarkReader.enable(THEME, FIXES);
    if (!on && DarkReader.isEnabled()) DarkReader.disable();

    const btn = document.getElementById('fd-toggle');
    if (btn) {
      btn.replaceChildren(on ? sunIcon() : moonIcon());
      btn.title = on ? 'Switch to light mode' : 'Switch to dark mode';
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function setOn(next) {
    on = next;
    try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch (e) {}
    render();
  }

  function toggle() {
    setOn(!on);
    tellFrames();
  }

  // ---- Keep embedded pages (like the notebook editor) in step ----
  // The notebook runs as a separate page from another Power BI address, so it
  // can't read the main page's saved setting. The main page tells it instead.
  function trustedOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === 'powerbi.com' || host.endsWith('.powerbi.com') ||
             host === 'fabric.microsoft.com' || host.endsWith('.fabric.microsoft.com');
    } catch (e) {
      return false;
    }
  }

  function tellFrames(win = window) {
    for (let i = 0; i < win.frames.length; i++) {
      const f = win.frames[i];
      try { f.postMessage({ fabricDark: 'state', on }, '*'); } catch (e) {}
      try { tellFrames(f); } catch (e) {}
    }
  }

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object' || !('fabricDark' in msg)) return;
    if (!trustedOrigin(e.origin)) return;

    if (msg.fabricDark === 'ask' && isTop) {
      // An embedded page just loaded and wants to know the setting
      try { e.source.postMessage({ fabricDark: 'state', on }, e.origin); } catch (err) {}
    } else if (msg.fabricDark === 'state' && !isTop && typeof msg.on === 'boolean' && msg.on !== on) {
      setOn(msg.on);
    }
  });

  if (!isTop) {
    try { window.top.postMessage({ fabricDark: 'ask' }, '*'); } catch (e) {}
  }

  // Another tab (or an embedded frame) flipped it: follow along
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    const next = readSetting();
    if (next === on) return;
    on = next;
    render();
  });

  render();

  // Status report in the browser console (F12 → Console), to help troubleshoot.
  // One line per page, including embedded ones like the notebook.
  setTimeout(() => {
    if (!document.body) return;
    const root = document.documentElement;
    console.info('[Fabric Dark] status ' + JSON.stringify({
      page: location.hostname + (isTop ? ' (main)' : ' (embedded)'),
      darkModeSetting: on,
      engineRunning: DarkReader.isEnabled(),
      engineApplied: root.getAttribute('data-darkreader-mode'),
      engineStyles: document.querySelectorAll('style.darkreader').length,
      blockedByLock: !!document.querySelector('meta[name="darkreader-lock"]'),
      pageBackground: getComputedStyle(document.body).backgroundColor,
      styleFilesLoadedDirectly: fileStats.loadedDirectly,
      styleFilesLoadedViaTampermonkey: fileStats.loadedViaTampermonkey,
      styleFilesSkipped: fileStats.skipped,
      styleFilesFailed: fileStats.failed,
    }, null, 1));
  }, 6000);

  // Everything below is the button, which only lives in the main page
  if (!isTop) return;

  const style = document.createElement('style');
  style.textContent = `
    #fd-toggle {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; margin: 0 4px; padding: 0;
      border: 0; border-radius: 4px; cursor: pointer;
      background: transparent; color: inherit;
    }
    #fd-toggle:hover { background: rgba(127, 127, 127, .25); }
    #fd-toggle.fd-floating {
      position: fixed; left: 12px; bottom: 12px; z-index: 2147483647;
      width: 40px; height: 40px; border-radius: 20px;
      background: #333; box-shadow: 0 2px 8px rgba(0,0,0,.4);
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Fabric's top bar: the full-width strip at the very top of the screen
  function findTopBar() {
    const candidates = document.querySelectorAll(
      'header, [role="banner"], tri-header, .tri-header, [class*="header" i]'
    );
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.top <= 2 && r.height >= 30 && r.height <= 80 && r.width >= window.innerWidth * 0.6) {
        return el;
      }
    }
    return null;
  }

  function makeButton() {
    const btn = document.createElement('button');
    btn.id = 'fd-toggle';
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    return btn;
  }

  // Put the button just left of the notifications bell (or settings gear)
  function placeButton() {
    const bar = findTopBar();
    let btn = document.getElementById('fd-toggle');
    if (btn && bar && bar.contains(btn)) return;

    const anchor = bar && bar.querySelector(
      'button[aria-label*="otification" i], [aria-label*="otification" i], button[aria-label*="ettings" i]'
    );

    if (!btn) btn = makeButton();

    if (anchor) {
      let slot = anchor;
      while (slot.parentElement && slot.parentElement !== bar && slot.parentElement.childElementCount < 3) {
        slot = slot.parentElement;
      }
      btn.classList.remove('fd-floating');
      slot.parentElement.insertBefore(btn, slot);
    } else if (!btn.isConnected && document.body) {
      // Couldn't find the top bar's icons: float it in the bottom-left corner
      btn.classList.add('fd-floating');
      document.body.appendChild(btn);
    }
    render();
  }

  // Fabric builds its top bar after loading and re-renders it; keep checking
  let queued = false;
  new MutationObserver(() => {
    if (queued || !document.body) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      placeButton();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => document.body && placeButton(), 1000);
})();
