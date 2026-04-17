/**
 * ApiClient - 统一 API 客户端
 * - 自动携带 CSRF Token
 * - 深合并 headers（解决覆盖问题）
 * - 标准错误处理
 */
(function() {
  'use strict';

  const CSRF_COOKIE = 'csrf_token';

  /**
   * 获取 CSRF Token
   * @returns {string|null}
   */
  function getCsrfToken() {
    const match = document.cookie.match(new RegExp('(^| )' + CSRF_COOKIE + '=([^;]+)'));
    return match ? match[2] : null;
  }

  /**
   * 深合并 headers
   * 解决 {...defaults, ...options} 会覆盖整个 headers 的问题
   * @param {Object} defaults - 默认 headers
   * @param {Object} overrides - 覆盖 headers
   * @returns {Object} 合并后的 headers
   */
  function mergeHeaders(defaults, overrides) {
    const result = { ...defaults };

    if (overrides && typeof overrides === 'object') {
      Object.keys(overrides).forEach(key => {
        if (key === 'headers' && defaults.headers && overrides.headers) {
          result.headers = { ...defaults.headers, ...overrides.headers };
        } else {
          result[key] = overrides[key];
        }
      });
    }

    return result;
  }

  const DEFAULT_OPTIONS = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  /**
   * 统一的 API 请求方法
   * @param {string} url - 请求 URL
   * @param {Object} options - fetch 选项
   * @returns {Promise<Object>} JSON 响应
   */
  async function apiFetch(url, options = {}) {
    const finalOptions = mergeHeaders(DEFAULT_OPTIONS, options);

    // Fetch CSRF token fresh on each request
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      finalOptions.headers = { ...finalOptions.headers, 'X-CSRF-Token': csrfToken };
    }

    const res = await fetch(url, finalOptions);

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    if (res.status === 204) return null;

    return res.json();
  }

  const api = {
    get: function(url, options) {
      return apiFetch(url, { ...options, method: 'GET' });
    },
    post: function(url, data, options) {
      return apiFetch(url, { ...options, method: 'POST', body: JSON.stringify(data) });
    },
    put: function(url, data, options) {
      return apiFetch(url, { ...options, method: 'PUT', body: JSON.stringify(data) });
    },
    patch: function(url, data, options) {
      return apiFetch(url, { ...options, method: 'PATCH', body: JSON.stringify(data) });
    },
    del: function(url, options) {
      return apiFetch(url, { ...options, method: 'DELETE' });
    },
  };

  global.ApiClient = api;
  global.getCsrfToken = getCsrfToken;
  global.apiFetch = apiFetch;
})();
