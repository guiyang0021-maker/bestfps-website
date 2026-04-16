// public/js/admin/admin-api.js
(function () {
  'use strict';

  const { getCsrfToken } = window.AdminUtils;

  // 正在进行的请求（用于去重）
  const inflight = new Map();

  // 30s 请求超时
  const TIMEOUT_MS = 30000;

  async function apiFetch(url, options = {}) {
    const token = getCsrfToken();
    const defaultOpts = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || '',
      },
    };
    const merged = {
      ...defaultOpts,
      ...options,
      headers: {
        ...defaultOpts.headers,
        ...(options.headers || {}),
      },
    };
    // 避免重复请求（同一 URL + method 在 3s 内）
    const cacheKey = url + (merged.method || 'GET');
    const existing = inflight.get(cacheKey);
    if (existing && Date.now() - existing.start < 3000) {
      existing.controller.abort();
    }
    const controller = new AbortController();
    inflight.set(cacheKey, { controller, start: Date.now() });

    // 超时控制
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // 如果调用方传入了 signal，关联到我们的 controller
    if (merged.signal) {
      merged.signal.addEventListener('abort', () => controller.abort());
    }
    merged.signal = controller.signal;

    let res;
    try {
      res = await fetch(url, merged);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') return { __aborted: true };
      throw err;
    } finally {
      clearTimeout(timeout);
      inflight.delete(cacheKey);
    }

    if (res.status === 204) {
      return {};
    }

    const rawText = await res.text();
    let data = {};
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch (_) {
        data = { error: `接口返回了非 JSON 响应（${res.status}）` };
      }
    }
    if (!res.ok) {
      if (res.status === 401) {
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return { __unauthorized: true };
      }
      throw Object.assign(new Error(data.error || '请求失败'), { status: res.status, data });
    }
    return data;
  }

  async function request(method, url, body) {
    return apiFetch(url, body ? { method, body: JSON.stringify(body) } : { method });
  }

  const get    = (url)              => request('GET', url);
  const post   = (url, body)        => request('POST', url, body);
  const put    = (url, body)        => request('PUT', url, body);
  const del    = (url)              => request('DELETE', url);

  window.AdminApi = { apiFetch, request, get, post, put, del };
})();
