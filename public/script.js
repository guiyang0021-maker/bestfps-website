/**
 * bestfps 官网 — 交互逻辑
 */

(function () {
  'use strict';

  /* =========================================================
     截图画廊
     ========================================================= */
  const galleryTrack = document.getElementById('gallery-track');
  const galleryPrev = document.getElementById('gallery-prev');
  const galleryNext = document.getElementById('gallery-next');
  const galleryDots = document.getElementById('gallery-dots');

  if (galleryTrack && galleryPrev && galleryNext && galleryDots) {
    const images = galleryTrack.querySelectorAll('.screenshots__img');
    const total = images.length;
    let current = 0;

    // 创建圆点指示器
    function buildDots() {
      galleryDots.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const dot = document.createElement('button');
        dot.className = 'screenshots__dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `查看第 ${i + 1} 张截图`);
        dot.addEventListener('click', () => goTo(i));
        galleryDots.appendChild(dot);
      }
    }

    // 切换到指定图片
    function goTo(index) {
      if (total === 0) return;
      images[current].classList.remove('active');
      galleryDots.children[current].classList.remove('active');

      current = ((index % total) + total) % total; // 支持负数

      images[current].classList.add('active');
      galleryDots.children[current].classList.add('active');
    }

    function prev() { goTo(current - 1); }
    function next() { goTo(current + 1); }

    galleryPrev.addEventListener('click', prev);
    galleryNext.addEventListener('click', next);

    // 初始化
    if (images.length > 0) {
      images[0].classList.add('active');
    }
    buildDots();

    // 键盘左右方向键
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { prev(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
    });
  }

  /* =========================================================
     滚动动画 — Intersection Observer
     ========================================================= */
  var animatedElements = document.querySelectorAll('.fade-in-up');
  if (animatedElements.length > 0 && 'IntersectionObserver' in window) {
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            // 错开延迟，让卡片依次出现
            var delay = entry.target.dataset.delay || 0;
            setTimeout(function () {
              entry.target.classList.add('visible');
            }, delay * 80);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });

      // 为每个 feature-card 添加递增 delay
      animatedElements.forEach(function (el, i) {
        el.dataset.delay = i;
        observer.observe(el);
      });
    } else {
      // 降级：直接显示
      animatedElements.forEach(function (el) {
        el.classList.add('visible');
      });
    }
  }

  /* =========================================================
     导航滚动高亮
     ========================================================= */
  var navLinks = document.querySelectorAll('.nav__link[href^="#"]');
  var sections = [];

  if (navLinks.length > 0) {
    navLinks.forEach(function (link) {
      var id = link.getAttribute('href');
      if (id && id.startsWith('#')) {
        var section = document.querySelector(id);
        if (section) sections.push({ link: link, section: section });
      }
    });

    function highlightNav() {
      var scrollY = window.scrollY;
      var offset = 80; // 提前触发

      sections.forEach(function (item) {
        var top = item.section.offsetTop - offset;
        var bottom = top + item.section.offsetHeight;
        if (scrollY >= top && scrollY < bottom) {
          item.link.style.color = 'var(--color-text)';
          item.link.style.fontWeight = '600';
        } else {
          item.link.style.color = '';
          item.link.style.fontWeight = '';
        }
      });
    }

    window.addEventListener('scroll', highlightNav, { passive: true });
    highlightNav();
  }

  /* =========================================================
     移动端汉堡菜单
     ========================================================= */
  var burger = document.getElementById('nav-burger');
  var navLinksEl = document.getElementById('nav-links');

  if (burger && navLinksEl) {
    burger.addEventListener('click', function () {
      var isOpen = burger.classList.toggle('active');
      navLinksEl.classList.toggle('open', isOpen);
      burger.setAttribute('aria-expanded', isOpen);
    });

    // 点击导航链接后关闭菜单
    navLinksEl.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        burger.classList.remove('active');
        navLinksEl.classList.remove('open');
      });
    });
  }

  /* =========================================================
     登录状态管理
     ========================================================= */
  function initAuthNav() {
    var token = localStorage.getItem('token');
    var loginLink = document.getElementById('nav-login');
    var dashboardLink = document.getElementById('nav-dashboard');
    var logoutLink = document.getElementById('nav-logout');

    if (token) {
      if (loginLink) loginLink.style.display = 'none';
      if (dashboardLink) dashboardLink.style.display = '';
      if (logoutLink) logoutLink.style.display = '';
    } else {
      if (loginLink) loginLink.style.display = '';
      if (dashboardLink) dashboardLink.style.display = 'none';
      if (logoutLink) logoutLink.style.display = 'none';
    }
  }

  // 在所有其他初始化完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthNav);
  } else {
    initAuthNav();
  }

  // 暴露 logout 到全局
  window.logout = function () {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

})();
