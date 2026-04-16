/**
 * Dashboard JS — API 核心模块
 * 提供认证请求辅助函数和全局状态
 */
(function () {
  'use strict';

  // ---- Auth helpers ----
  function authHeaders() {
    return {};
  }

  async function api(method, path, body, skipAuth) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'include', // 发送 httpOnly Cookie（JWT）
      headers: {
        'Content-Type': 'application/json',
        ...(skipAuth ? {} : authHeaders()),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('会话已失效，请重新登录');
    }
    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || '账号已被封禁，请联系管理员');
      window.location.href = '/login';
      throw new Error(errData.error || '账号已被封禁');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }

  // Expose globally for use by other modules and inline onclick handlers
  window.authHeaders = authHeaders;
  window.api = api;
})();
