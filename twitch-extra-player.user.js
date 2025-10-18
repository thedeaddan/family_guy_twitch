// ==UserScript==
// @name         Twitch Extra Player – centered compact
// @namespace    dan.twitch.extra.player
// @version      1.3.0
// @description  Вставляет компактный iframe-плеер по центру под блоком "Сведения о трансляции"
// @match        https://www.twitch.tv/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // Можно переопределить через localStorage.setItem('tep-movie-id', 'XXXX')
  const MOVIE_ID = localStorage.getItem('tep-movie-id') || '3462';
  const START_URL = `https://api.embess.ws/embed/movie/${encodeURIComponent(MOVIE_ID)}?season=1`;

  GM_addStyle(`
    #tep-container { margin: 16px 0 24px; }
    /* Центровка и компактная ширина */
    #tep-center {
      width: clamp(480px, 60vw, 900px);   /* <= вот тут размер: min/max и "по середине" */
      margin: 0 auto;                      /* центрируем */
      border-radius: 10px;
      border: 1px solid var(--color-border-base, #3a3a3d);
      background: var(--color-background-base, #18181b);
      overflow: hidden;
      font-family: Inter, Arial, sans-serif;
    }
    #tep-head {
      display:flex; align-items:center; gap:8px; padding:8px 10px;
      border-bottom: 1px solid var(--color-border-base, #2a2a2d);
    }
    #tep-title { font-weight:600; font-size:13px; }
    #tep-head-spacer { flex: 1 1 auto; }
    #tep-actions { display:flex; align-items:center; gap:8px; }
    #tep-actions button {
      height:28px; padding:0 10px; border:1px solid #3a3a3d;
      background:#202024; color:#fff; border-radius:6px; cursor:pointer;
      font-size:12px;
    }
    #tep-actions button:hover { filter: brightness(1.1); }

    #tep-body { position: relative; width: 100%; transition: max-height .25s ease, opacity .2s ease; }
    #tep-body.collapsed { max-height: 0 !important; opacity: 0; }

    .tep-ratio { position: relative; width:100%; }
    .tep-ratio::before { content:""; display:block; padding-top:56.25%; } /* 16:9 */

    #tep-iframe {
      position:absolute; inset:0; width:100%; height:100%;
      border:none; background:#000;
    }
    .tep-note { padding:6px 10px; color:#9a9a9a; font-size:11px; }
  `);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function findLiveInfoSection() {
    return document.querySelector('section#live-channel-stream-information');
  }

  function findPlayerFallback() {
    const sels = [
      '[data-a-target="stream-player"]',
      '[data-a-target="video-player"]',
      '.persistent-player',
      '.video-player__container',
      '.video-player',
      '[data-test-selector="channel-root__player"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    const vids = Array.from(document.querySelectorAll('video'));
    if (vids.length) {
      vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
      return vids[0].closest('div') || vids[0].parentElement;
    }
    return null;
  }

  function createContainer() {
    if (document.getElementById('tep-container')) return document.getElementById('tep-container');

    const container = document.createElement('section');
    container.id = 'tep-container';

    const center = document.createElement('div');
    center.id = 'tep-center';

    const head = document.createElement('div');
    head.id = 'tep-head';

    const title = document.createElement('div');
    title.id = 'tep-title';
    title.textContent = 'Доп. плеер';

    const spacer = document.createElement('div');
    spacer.id = 'tep-head-spacer';

    const actions = document.createElement('div');
    actions.id = 'tep-actions';

    const popoutBtn = document.createElement('button');
    popoutBtn.textContent = 'Открыть в окне';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Свернуть';

    actions.append(popoutBtn, toggleBtn);
    head.append(title, spacer, actions);

    const body = document.createElement('div');
    body.id = 'tep-body';
    body.style.maxHeight = '2000px';

    const ratio = document.createElement('div');
    ratio.className = 'tep-ratio';

    const iframe = document.createElement('iframe');
    iframe.id = 'tep-iframe';
    iframe.allowFullscreen = true;
    iframe.setAttribute('allow', 'autoplay *; fullscreen');
    iframe.setAttribute('loading', 'lazy');
    iframe.referrerPolicy = 'no-referrer';
    iframe.src = START_URL;

    ratio.appendChild(iframe);
    body.appendChild(ratio);

    const note = document.createElement('div');
    note.className = 'tep-note';
    note.textContent = 'Если iframe не грузится — это может быть CSP Twitch или запрет встраивания на стороне источника. Используй «Открыть в окне».';

    center.append(head, body, note);
    container.append(center);

    popoutBtn.addEventListener('click', () => {
      window.open(iframe.src, '_blank', 'noopener,noreferrer');
    });

    let collapsed = false;
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      body.classList.toggle('collapsed', collapsed);
      toggleBtn.textContent = collapsed ? 'Развернуть' : 'Свернуть';
    });

    return container;
  }

  async function injectOnce() {
    const existing = document.getElementById('tep-container');
    if (existing && existing.isConnected) return true;

    // 1) Строго под секцией сведений о трансляции
    for (let i = 0; i < 60; i++) {
      const info = findLiveInfoSection();
      if (info && info.parentElement) {
        const container = createContainer();
        info.insertAdjacentElement('afterend', container);
        return true;
      }
      await sleep(300);
    }

    // 2) Фолбэк: после плеера
    for (let i = 0; i < 30; i++) {
      const player = findPlayerFallback();
      if (player && player.parentElement) {
        const container = createContainer();
        player.insertAdjacentElement('afterend', container);
        return true;
      }
      await sleep(300);
    }
    return false;
  }

  function hookHistory() {
    const _push = history.pushState;
    const _replace = history.replaceState;
    const onChange = () => setTimeout(injectOnce, 250);
    history.pushState = function () { _push.apply(this, arguments); onChange(); };
    history.replaceState = function () { _replace.apply(this, arguments); onChange(); };
    window.addEventListener('popstate', onChange);
  }

  function observeDom() {
    const obs = new MutationObserver(() => {
      const has = document.getElementById('tep-container');
      const anchor = findLiveInfoSection();
      if (!has || !has.isConnected || (anchor && has.previousElementSibling !== anchor)) {
        injectOnce();
      }
    });
    obs.observe(document.body, { subtree: true, childList: true });
  }

  (async function main() {
    hookHistory();
    observeDom();
    await injectOnce();
  })();
})();
