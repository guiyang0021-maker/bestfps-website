/**
 * SafeDom - XSS 防护工具库
 * 统一处理 DOM 操作中的 XSS 风险
 */
(function(global) {
  'use strict';

  /**
   * 纯文本设置 — 最安全的做法
   * @param {Element} element - DOM 元素
   * @param {string} text - 文本内容
   * @returns {void}
   */
  function safeSetText(element, text) {
    if (!element) return;
    element.textContent = text ?? '';
  }

  /**
   * 富文本 HTML 设置 — 需要 DOMPurify
   * @param {Element} element - DOM 元素
   * @param {string} html - HTML 内容
   * @param {Object} options - DOMPurify 配置选项
   * @returns {void}
   */
  function safeSetHtml(element, html, options = {}) {
    if (!element) return;
    if (typeof DOMPurify === 'undefined') {
      console.error('DOMPurify not loaded');
      return;
    }
    const config = {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'class'],
      ADD_ATTR: ['target'],
      ...options,
    };
    element.innerHTML = DOMPurify.sanitize(html ?? '', config);
  }

  /**
   * 安全 URL 设置 — 协议白名单校验
   * @param {HTMLAnchorElement} element - 链接元素
   * @param {string} url - URL 地址
   * @param {string} defaultText - 默认显示文本
   */
  function safeSetUrl(element, url, defaultText = '') {
    if (!element) return;
    const safeUrl = validateUrl(url);
    const safeText = defaultText || safeUrl || '';

    if (safeUrl) {
      element.href = safeUrl;
      element.textContent = safeText;
      if (element.target === '_blank' || element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noopener noreferrer');
      }
    } else {
      element.removeAttribute('href');
      element.textContent = safeText;
    }
  }

  /**
   * URL 协议白名单校验
   * @param {string} url - 待验证的 URL
   * @returns {string|null} 安全的 URL 或 null
   */
  function validateUrl(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();
    if (url.startsWith('//')) {
      return null;
    }
    const colonIndex = url.indexOf(':');
    if (colonIndex === -1) {
      return url.startsWith('/') ? url : null;
    }
    const protocol = url.substring(0, colonIndex).toLowerCase();
    const allowedProtocols = ['http', 'https', 'mailto'];
    if (allowedProtocols.includes(protocol)) {
      return url;
    }
    return null;
  }

  /**
   * 安全设置多个文本节点
   * @param {NodeList|Array} elements - DOM 元素集合
   * @param {Array} values - 文本值数组
   * @returns {void}
   */
  function safeSetTexts(elements, values) {
    if (!elements || !values) return;
    elements.forEach((el, i) => {
      if (i < values.length) {
        safeSetText(el, values[i]);
      }
    });
  }

  /**
   * 渲染公告内容（支持富文本）
   * @param {Element} element - 容器元素
   * @param {string} content - 公告内容
   * @returns {void}
   */
  function renderAnnouncement(element, content) {
    if (!element) return;
    if (typeof DOMPurify === 'undefined') {
      console.error('DOMPurify not loaded');
      return;
    }
    safeSetHtml(element, content, {
      // Note: renderAnnouncement intentionally does NOT allow h1-h3 headings or 'class' attribute
      // for a more restricted announcement display, compared to setHtml which allows them.
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      FORCE_BODY: true,
    });
    element.querySelectorAll('a[href]').forEach(link => {
      const href = validateUrl(link.getAttribute('href'));
      if (href) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  global.SafeDom = {
    setText: safeSetText,
    setHtml: safeSetHtml,
    setUrl: safeSetUrl,
    validateUrl: validateUrl,
    setTexts: safeSetTexts,
    renderAnnouncement: renderAnnouncement,
  };
})(window);
