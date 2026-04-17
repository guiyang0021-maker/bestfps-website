(function () {
  'use strict';

  const state = {
    currentUser: null,
    sectionLoaders: new Map(),
  };

  const INVOICE_TYPE_META = Object.freeze({
    personal: { label: '个人普通发票', requiresTaxNo: false },
    company: { label: '企业普通发票', requiresTaxNo: true },
    personal_normal: { label: '个人普通发票', requiresTaxNo: false },
    company_normal: { label: '企业普通发票', requiresTaxNo: true },
    company_special_vat: { label: '企业增值税专用发票', requiresTaxNo: true },
    company_electronic: { label: '企业电子发票', requiresTaxNo: true },
  });

  function resolveTheme(theme) {
    return theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
  }

  function syncThemeControls(theme) {
    const resolvedTheme = resolveTheme(theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    const lightBtn = document.getElementById('tl');
    const darkBtn = document.getElementById('td');
    const radioLight = document.getElementById('radio-light');
    const radioDark = document.getElementById('radio-dark');
    const radioSystem = document.getElementById('radio-system');

    if (lightBtn) lightBtn.classList.toggle('active', theme === 'light');
    if (darkBtn) darkBtn.classList.toggle('active', theme === 'dark');
    if (radioLight) radioLight.checked = theme === 'light';
    if (radioDark) radioDark.checked = theme === 'dark';
    if (radioSystem) radioSystem.checked = theme === 'system' || !localStorage.getItem('theme');
  }

  function getTheme() {
    return localStorage.getItem('theme') || 'light';
  }

  function setTheme(theme) {
    localStorage.setItem('theme', theme);
    syncThemeControls(theme);
  }

  function initTheme() {
    syncThemeControls(getTheme());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = function () {
      if (getTheme() === 'system') {
        syncThemeControls('system');
      }
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleThemeChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleThemeChange);
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  async function requestJson(url, options, label) {
    const response = await fetch(url, options);
    const rawText = await response.text();
    let data = {};

    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (_) {
        throw new Error((label || '接口') + `返回了非 JSON 响应（${response.status}）`);
      }
    }

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  }

  function api(method, path, body) {
    return requestJson('/api/auth' + path, {
      method: method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: body ? JSON.stringify(body) : undefined,
    }, '认证接口');
  }

  function show(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('visible', !!message);
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.classList.remove('visible');
  }

  function setContainerMessage(container, message, tone) {
    if (!container) return;
    const colorMap = {
      error: 'var(--error)',
      loading: 'var(--text-secondary)',
      info: 'var(--text-secondary)',
    };
    const p = document.createElement('p');
    p.style.color = colorMap[tone] || 'var(--text-secondary)';
    p.style.textAlign = 'center';
    p.style.padding = '24px';
    p.textContent = message;
    container.replaceChildren(p);
  }

  function registerSectionLoader(name, loader) {
    state.sectionLoaders.set(name, loader);
  }

  function showSection(name, options) {
    const opts = options || {};
    if (opts.event) opts.event.preventDefault();

    document.querySelectorAll('[id^="section-"]').forEach(function (section) {
      section.style.display = 'none';
    });
    document.querySelectorAll('.settings-sidebar-link').forEach(function (link) {
      link.classList.remove('active');
    });

    const target = document.getElementById('section-' + name);
    if (!target) return;

    target.style.display = 'block';
    if (!opts.skipScroll) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const link = document.querySelector('.settings-sidebar-link[href="#' + name + '"]');
    if (link) link.classList.add('active');

    const mobileSelect = document.getElementById('settings-mobile-select');
    if (mobileSelect) mobileSelect.value = name;

    if (!opts.skipHash) {
      history.replaceState(null, '', '#' + name);
    }

    const loader = state.sectionLoaders.get(name);
    if (typeof loader === 'function') {
      loader();
    }
  }

  function downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type: type || 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(link.href);
    }, 1000);
  }

  function setCurrentUser(user) {
    state.currentUser = user || null;
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  function initBaseInteractions() {
    const mobileSelect = document.getElementById('settings-mobile-select');
    if (mobileSelect) {
      mobileSelect.addEventListener('change', function (event) {
        showSection(event.target.value, { skipScroll: true });
      });
    }

    const lightBtn = document.getElementById('tl');
    const darkBtn = document.getElementById('td');
    if (lightBtn) lightBtn.addEventListener('click', function () { setTheme('light'); });
    if (darkBtn) darkBtn.addEventListener('click', function () { setTheme('dark'); });

    document.querySelectorAll('.settings-sidebar-link').forEach(function (link) {
      link.addEventListener('click', function (event) {
        const hash = link.getAttribute('href') || '';
        if (!hash.startsWith('#')) return;
        showSection(hash.slice(1), { event: event });
      });
    });

    document.querySelectorAll('input[name="theme-radio"]').forEach(function (input) {
      input.addEventListener('change', function (event) {
        if (event.target.checked) {
          setTheme(event.target.value);
        }
      });
    });

    window.addEventListener('hashchange', function () {
      const sectionName = (window.location.hash || '').slice(1);
      if (sectionName && document.getElementById('section-' + sectionName)) {
        showSection(sectionName, { skipScroll: true, skipHash: true });
      }
    });
  }

  window.SettingsPage = {
    INVOICE_TYPE_META: INVOICE_TYPE_META,
    api: api,
    downloadTextFile: downloadTextFile,
    escapeHtml: escapeHtml,
    getCsrfToken: getCsrfToken,
    getCurrentUser: getCurrentUser,
    getTheme: getTheme,
    hide: hide,
    initBaseInteractions: initBaseInteractions,
    initTheme: initTheme,
    registerSectionLoader: registerSectionLoader,
    requestJson: requestJson,
    setContainerMessage: setContainerMessage,
    setCurrentUser: setCurrentUser,
    setTheme: setTheme,
    show: show,
    showSection: showSection,
  };
})();
