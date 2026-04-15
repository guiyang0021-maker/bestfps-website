// public/js/admin/admin-announcements.js
(function () {
  'use strict';

  // ── 模块状态 ─────────────────────────────────────────
  let editingId = null;
  let isDirty = false;
  let controller = null;
  let container = null;

  const { apiFetch } = window.AdminApi;
  const { esc, sanitizeRich, formatDate } = window.AdminUtils;
  const { showSkeleton, toast, confirmAction } = window.AdminUI;

  // ── 初始化 ───────────────────────────────────────────
  function init(el) {
    container = el;
    loadAnnouncements();

    const form = document.getElementById('announcement-form');
    if (form) {
      form.addEventListener('input', () => {
        isDirty = true;
        form.dataset.dirty = 'true';
      });
    }

    const addBtn = document.getElementById('add-announcement-btn');
    if (addBtn) addBtn.addEventListener('click', openCreateModal);

    const closeBtn = document.getElementById('close-announcement-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    const saveBtn = document.getElementById('save-announcement-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveAnnouncement);
  }

  // ── 加载公告列表 ──────────────────────────────────────
  async function loadAnnouncements() {
    const listEl = container.querySelector('[data-list="announcements"]');
    if (!listEl) return;
    showSkeleton(listEl, { rows: 5, cols: 4 });
    try {
      const data = await apiFetch('/api/announcements/all');
      renderList(data.announcements || []);
    } catch (e) { toast('加载公告失败', 'error'); }
  }

  // ── 渲染列表 ──────────────────────────────────────────
  function renderList(announcements) {
    const listEl = container.querySelector('[data-list="announcements"]');
    if (!listEl) return;
    if (!announcements.length) {
      listEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-muted)">暂无公告</p>';
      return;
    }
    listEl.innerHTML = announcements.map(a => `
      <div class="announcement-card" data-id="${a.id}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <span class="badge badge--${esc(a.type)}">${esc(a.type)}</span>
            <strong style="margin-left:8px">${esc(a.title)}</strong>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn--small" onclick="AdminAnnouncements.openEditModal(${a.id})">编辑</button>
            <button class="btn btn--small btn--danger" onclick="AdminAnnouncements.confirmDelete(${a.id}, '${esc(a.title)}')">删除</button>
          </div>
        </div>
        <div style="font-size:13px;color:var(--color-text-muted)">${esc(formatDate(a.created_at))}</div>
      </div>
    `).join('');
  }

  // ── 创建模态框 ────────────────────────────────────────
  function openCreateModal() {
    editingId = null;
    isDirty = false;
    const form = document.getElementById('announcement-form');
    if (form) {
      form.reset();
      form.dataset.editingId = '';
      form.dataset.dirty = 'false';
    }
    const titleEl = document.getElementById('ann-title');
    const typeEl = document.getElementById('ann-type');
    const contentEl = document.getElementById('ann-content');
    if (titleEl) titleEl.value = '';
    if (typeEl) typeEl.value = 'info';
    if (contentEl) contentEl.value = '';
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.classList.add('modal-overlay--open');
  }

  // ── 编辑模态框 ────────────────────────────────────────
  async function openEditModal(id) {
    try {
      const data = await apiFetch(`/api/announcements/${id}`);
      const a = data.announcement;
      const titleEl = document.getElementById('ann-title');
      const typeEl = document.getElementById('ann-type');
      const contentEl = document.getElementById('ann-content');
      if (titleEl) titleEl.value = esc(a.title) || '';
      if (typeEl) typeEl.value = a.type || 'info';
      if (contentEl) contentEl.value = a.content || '';
      editingId = id;
      isDirty = false;
      const form = document.getElementById('announcement-form');
      if (form) {
        form.dataset.editingId = String(id);
        form.dataset.dirty = 'false';
      }
      const modal = document.getElementById('announcement-modal');
      if (modal) modal.classList.add('modal-overlay--open');
    } catch (e) { toast('加载公告失败', 'error'); }
  }

  // ── 关闭模态框（含脏状态检查）───────────────────────
  async function closeModal() {
    if (isDirty) {
      const leave = await confirmAction({
        title: '离开此页面？',
        message: '你有未保存的更改，确定要离开吗？',
        requiredPhrase: 'LEAVE',
        danger: false,
      });
      if (!leave) return;
    }
    resetForm();
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.classList.remove('modal-overlay--open');
  }

  // ── 表单重置 ──────────────────────────────────────────
  function resetForm() {
    const form = document.getElementById('announcement-form');
    if (form) form.reset();
    const titleEl = document.getElementById('ann-title');
    const typeEl = document.getElementById('ann-type');
    const contentEl = document.getElementById('ann-content');
    if (titleEl) titleEl.value = '';
    if (typeEl) typeEl.value = 'info';
    if (contentEl) contentEl.value = '';
    editingId = null;
    isDirty = false;
    if (form) {
      form.dataset.editingId = '';
      form.dataset.dirty = 'false';
    }
  }

  // ── 保存公告 ─────────────────────────────────────────
  async function saveAnnouncement() {
    const titleEl = document.getElementById('ann-title');
    const typeEl = document.getElementById('ann-type');
    const contentEl = document.getElementById('ann-content');
    if (!titleEl || !typeEl || !contentEl) { toast('表单元素缺失', 'error'); return; }
    const title = titleEl.value.trim();
    const type = typeEl.value;
    const content = contentEl.value;

    if (!title || !content) { toast('标题和内容不能为空', 'error'); return; }
    if (content.length > 10000) { toast('内容过长', 'error'); return; }

    // XSS防护：富文本内容经 DOMPurify 过滤
    const payload = { title, type, content: sanitizeRich(content) };
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/announcements/${editingId}` : '/api/announcements';

    try {
      await apiFetch(url, { method, body: JSON.stringify(payload) });
      toast(editingId ? '公告已更新' : '公告已创建', 'success');
      const modal = document.getElementById('announcement-modal');
      if (modal) modal.classList.remove('modal-overlay--open');
      resetForm();
      loadAnnouncements();
    } catch (e) { toast('保存失败: ' + e.message, 'error'); }
  }

  // ── 删除公告 ─────────────────────────────────────────
  async function confirmDelete(id, title) {
    const confirmed = await confirmAction({
      title: '删除公告',
      message: `确定删除公告 "${title}" 吗？`,
      requiredPhrase: 'DELETE ANNOUNCEMENT',
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
      toast('公告已删除', 'success');
      loadAnnouncements();
    } catch (e) { toast('删除失败: ' + e.message, 'error'); }
  }

  window.AdminAnnouncements = { init, loadAnnouncements, openCreateModal, openEditModal, closeModal, saveAnnouncement, confirmDelete };
})();
