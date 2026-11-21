/**
 * Directory Landing Page Application Logic
 */

(function () {
  'use strict';

  const USER_SETTINGS_KEY = 'user_settings';

  // --- Devicon Mapping for Programming Languages & Tech Stacks ---
  const DEVICONS = {
    typescript: { class: 'devicon-typescript-plain colored', name: 'TypeScript' },
    ts: { class: 'devicon-typescript-plain colored', name: 'TypeScript' },
    javascript: { class: 'devicon-javascript-plain colored', name: 'JavaScript' },
    js: { class: 'devicon-javascript-plain colored', name: 'JavaScript' },
    python: { class: 'devicon-python-plain colored', name: 'Python' },
    py: { class: 'devicon-python-plain colored', name: 'Python' },
    rust: { class: 'devicon-rust-plain colored', name: 'Rust' },
    html: { class: 'devicon-html5-plain colored', name: 'HTML5' },
    html5: { class: 'devicon-html5-plain colored', name: 'HTML5' },
    css: { class: 'devicon-css3-plain colored', name: 'CSS3' },
    css3: { class: 'devicon-css3-plain colored', name: 'CSS3' },
    node: { class: 'devicon-nodejs-plain colored', name: 'Node.js' },
    nodejs: { class: 'devicon-nodejs-plain colored', name: 'Node.js' },
    git: { class: 'devicon-git-plain colored', name: 'Git' },
    github: { class: 'devicon-github-original', name: 'GitHub' },
    sqlite: { class: 'devicon-sqlite-plain colored', name: 'SQLite' },
    sql: { class: 'devicon-postgresql-plain colored', name: 'SQL' },
    wasm: { class: 'devicon-wasm-original colored', name: 'WebAssembly' },
    webassembly: { class: 'devicon-wasm-original colored', name: 'WebAssembly' },
    c: { class: 'devicon-c-plain colored', name: 'C' },
    cpp: { class: 'devicon-cplusplus-plain colored', name: 'C++' },
    'c++': { class: 'devicon-cplusplus-plain colored', name: 'C++' },
    go: { class: 'devicon-go-original-wordmark colored', name: 'Go' },
    golang: { class: 'devicon-go-original-wordmark colored', name: 'Go' },
    ocaml: { class: 'devicon-ocaml-plain colored', name: 'OCaml' },
    bash: { class: 'devicon-bash-plain colored', name: 'Bash' }
  };

  // --- State ---
  let directoryData = null;

  // --- DOM Elements ---
  const siteTitleEl = document.getElementById('site-title');
  const siteSubtitleEl = document.getElementById('site-subtitle');
  const continueContainer = document.getElementById('continue-container');
  const contentContainer = document.getElementById('content-container');

  // --- Helpers ---
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function isExternalUrl(rawUrl) {
    if (!rawUrl || rawUrl.startsWith('#')) return false;
    try {
      const parsed = new URL(rawUrl, window.location.href);
      return parsed.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function formatSlugLabel(slug) {
    if (!slug) return '';
    return String(slug)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function readJsonStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed.state ?? parsed) : null;
    } catch {
      return null;
    }
  }

  function readLastVisited() {
    const settings = readJsonStorage(USER_SETTINGS_KEY);
    const lv = settings && typeof settings.lastVisited === 'object' ? settings.lastVisited : null;
    if (!lv || !lv.siteSlug) return null;
    return {
      siteSlug: String(lv.siteSlug),
      siteTitle: lv.siteTitle ? String(lv.siteTitle) : String(lv.siteSlug),
      lessonSlug: lv.lessonSlug ? String(lv.lessonSlug) : '',
      lessonTitle: lv.lessonTitle ? String(lv.lessonTitle) : '',
      updatedAt: typeof lv.updatedAt === 'number' ? lv.updatedAt : 0
    };
  }

  function readBookProgress(item) {
    if (!item || !item.slug) return null;
    const state = readJsonStorage(`${item.slug}_storage`);
    if (!state) return null;

    const completed = Array.isArray(state.completedSlugs) ? state.completedSlugs.length : 0;
    const totalFromManifest = typeof item.exerciseCount === 'number' && item.exerciseCount > 0 ? item.exerciseCount : null;
    const totalFromStorage = typeof state.exerciseCount === 'number' && state.exerciseCount > 0 ? state.exerciseCount : null;
    const total = totalFromManifest ?? totalFromStorage;

    if (completed <= 0) return null;

    const isComplete = total !== null && completed >= total;
    const pct = total !== null ? Math.min(100, Math.round((completed / total) * 100)) : null;

    return { completed, total, isComplete, pct };
  }

  function getVisibleItemsMap() {
    const map = new Map();
    if (!directoryData || !Array.isArray(directoryData.sections)) return map;
    for (const section of directoryData.sections) {
      if (section.hidden || !Array.isArray(section.items)) continue;
      for (const item of section.items) {
        if (item.hidden || !item.slug) continue;
        map.set(item.slug, item);
      }
    }
    return map;
  }

  // --- Render Language Icons Helper ---
  function renderLanguages(languages) {
    if (!Array.isArray(languages) || languages.length === 0) {
      return '';
    }

    const iconsHtml = languages.map((langKey) => {
      const raw = String(langKey).trim();
      const key = raw.toLowerCase();

      if (raw.startsWith('devicon-')) {
        return `<span class="lang-icon" title="${escapeHtml(raw)}" aria-label="${escapeHtml(raw)}"><i class="${escapeHtml(raw)}"></i></span>`;
      }

      const iconDef = DEVICONS[key];
      if (iconDef) {
        return `<span class="lang-icon" title="${escapeHtml(iconDef.name)}" aria-label="${escapeHtml(iconDef.name)}"><i class="${iconDef.class}"></i></span>`;
      }

      return `<span class="lang-badge-text">${escapeHtml(raw)}</span>`;
    }).join('');

    return `<div class="item-languages" aria-label="Languages">${iconsHtml}</div>`;
  }

  // --- Fetch / Load Data ---
  async function loadDirectory() {
    if (window.DIRECTORY_DATA) {
      applyData(window.DIRECTORY_DATA);
      return;
    }

    try {
      const res = await fetch('./directory.json', { cache: 'no-cache' });
      if (!res.ok) {
        throw new Error(`Failed to load directory.json (HTTP ${res.status})`);
      }
      const data = await res.json();
      applyData(data);
    } catch (err) {
      console.error(err);
      renderError(err.message || 'Error loading directory data.');
    }
  }

  function applyData(data) {
    directoryData = data;
    if (directoryData.title && siteTitleEl) {
      siteTitleEl.textContent = directoryData.title;
      document.title = directoryData.title;
    }
    if (directoryData.subtitle && siteSubtitleEl) {
      siteSubtitleEl.textContent = directoryData.subtitle;
    }
    render();
  }

  // --- Render Functions ---
  function renderError(message) {
    if (continueContainer) {
      continueContainer.hidden = true;
      continueContainer.innerHTML = '';
    }
    contentContainer.innerHTML = `
      <div class="error-state">
        <p><strong>Unable to load directory</strong></p>
        <p style="margin-top: 0.5rem; font-size: 0.9rem;">${escapeHtml(message)}</p>
      </div>
    `;
  }

  const SHOW_CONTINUE_BANNER = false;

  function renderContinueBanner() {
    if (!continueContainer) return;

    if (!SHOW_CONTINUE_BANNER) {
      continueContainer.hidden = true;
      continueContainer.innerHTML = '';
      return;
    }

    const lastVisited = readLastVisited();
    if (!lastVisited) {
      continueContainer.hidden = true;
      continueContainer.innerHTML = '';
      return;
    }

    const visibleItems = getVisibleItemsMap();
    const matchedItem = visibleItems.get(lastVisited.siteSlug);
    if (!matchedItem) {
      continueContainer.hidden = true;
      continueContainer.innerHTML = '';
      return;
    }

    const baseUrl = matchedItem.url || `/${encodeURIComponent(matchedItem.slug)}/`;
    const href = lastVisited.lessonSlug
      ? `${baseUrl}#${encodeURIComponent(lastVisited.lessonSlug)}`
      : baseUrl;
    const emojiHtml = matchedItem.emoji
      ? `<span class="item-emoji" aria-hidden="true">${escapeHtml(matchedItem.emoji)}</span>`
      : '';
    const bookName = escapeHtml(matchedItem.name || lastVisited.siteTitle);
    const lessonLabel = escapeHtml(lastVisited.lessonTitle || formatSlugLabel(lastVisited.lessonSlug));

    continueContainer.innerHTML = `
      <a href="${escapeHtml(href)}" class="continue-card">
        <div class="continue-main">
          <span class="continue-label">Continue</span>
          <span class="continue-target">
            ${emojiHtml}
            <span class="continue-book">${bookName}</span>
            ${lessonLabel ? `<span class="continue-sep" aria-hidden="true">·</span><span class="continue-lesson">${lessonLabel}</span>` : ''}
          </span>
        </div>
        <span class="continue-arrow" aria-hidden="true">→</span>
      </a>
    `;
    continueContainer.hidden = false;
  }

  function render() {
    if (!directoryData || !Array.isArray(directoryData.sections)) {
      renderError('Invalid data format in directory.json.');
      return;
    }

    renderContinueBanner();

    const renderedSections = directoryData.sections
      .filter((section) => !section.hidden)
      .map((section) => {
        const items = Array.isArray(section.items)
          ? section.items.filter((item) => !item.hidden)
          : [];
        if (items.length === 0) return '';
        return renderSection(section, items);
      })
      .filter(Boolean);

    if (renderedSections.length === 0) {
      contentContainer.innerHTML = `
        <div class="empty-state">
          <p>No applications configured yet.</p>
        </div>
      `;
    } else {
      contentContainer.innerHTML = renderedSections.join('');
    }
  }

  function renderSection(section, items) {
    const sectionTitle = escapeHtml(section.title || 'Untitled Section');

    const itemsHtml = items.map((item) => {
      const name = escapeHtml(item.name || 'Unnamed');
      const url = escapeHtml(item.url || '#');
      const desc = escapeHtml(item.description || '');
      const isExternal = isExternalUrl(item.url);
      const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      const arrowIcon = `<span class="link-arrow" aria-hidden="true">${isExternal ? '↗' : '→'}</span>`;
      const languagesHtml = renderLanguages(item.languages);

      const progress = readBookProgress(item);
      const progressCountHtml = progress
        ? `<span class="item-progress-count${progress.isComplete ? ' is-complete' : ''}" title="${progress.total !== null ? `${progress.completed} of ${progress.total} completed` : `${progress.completed} completed`}">${progress.total !== null ? `${progress.completed}/${progress.total}` : `${progress.completed}`}${progress.isComplete ? ' ✓' : ''}</span>`
        : '';
      const progressBarHtml = progress && progress.pct !== null
        ? `<div class="item-progress-track" aria-hidden="true"><div class="item-progress-fill${progress.isComplete ? ' is-complete' : ''}" style="width: ${progress.pct}%"></div></div>`
        : '';

      return `
        <li class="directory-item">
          <div class="item-row">
            <div class="item-content">
              <h3 class="item-title">
                <a href="${url}" class="item-link"${targetAttr}>
                  <span>${name}</span> ${arrowIcon}
                </a>
              </h3>
              <p class="item-desc">${desc}</p>
            </div>
            <div class="item-meta">
              ${progressCountHtml}
              ${languagesHtml}
            </div>
          </div>
          ${progressBarHtml}
        </li>
      `;
    }).join('');

    return `
      <section class="section-block">
        <div class="section-header">
          <h2 class="section-title">${sectionTitle}</h2>
        </div>
        <ul class="directory-list">
          ${itemsHtml}
        </ul>
      </section>
    `;
  }

  // Refresh progress & Continue strip when returning via bfcache or across tabs
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && directoryData) {
      render();
    }
  });

  window.addEventListener('storage', () => {
    if (directoryData) {
      render();
    }
  });

  // --- Init ---
  loadDirectory();
})();
