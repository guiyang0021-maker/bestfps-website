// public/js/admin/admin-announcements.js
(function () {
  'use strict';

  // ── 模块状态 ─────────────────────────────────────────
  let editingId = null;
  let isDirty = false;
  let container = null;

  const { apiFetch } = window.AdminApi;
  const { esc, sanitizeRich, formatDate } = window.AdminUtils;
  const { showSkeleton, toast, confirmAction } = window.AdminUI;

  function toDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function toUtcIso(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  function getNowLocal() {
    return toDateTimeLocal(new Date().toISOString());
  }

  function getDefaultExpiryLocal() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return toDateTimeLocal(date.toISOString());
  }

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
    if (addBtn) addBtn.addEventListener('click', (event) => openCreateModal(event.currentTarget));

    const saveBtn = document.getElementById('save-announcement-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveAnnouncement);

    const listEl = container.querySelector('[data-list="announcements"]');
    if (listEl) {
      listEl.addEventListener('click', handleListClick);
    }
  }

  function handleListClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const id = parseInt(button.dataset.id, 10);
    if (!id) return;

    if (button.dataset.action === 'edit') {
      openEditModal(id, button);
      return;
    }

    if (button.dataset.action === 'delete') {
      confirmDelete(id, button.dataset.title || '');
    }
  }

  // ── 加载公告列表 ──────────────────────────────────────
  async function loadAnnouncements() {
    const listEl = container.querySelector('[data-list="announcements"]');
    if (!listEl) return;
    showSkeleton(listEl, { rows: 5, cols: 4 });
    try {
      const data = await apiFetch('/api/announcements/all');
      if (data.__aborted || data.__unauthorized) return;
      if (!data || !Array.isArray(data.announcements)) {
        throw new Error('公告数据格式无效');
      }
      renderList(data.announcements || []);
    } catch (e) {
      listEl.innerHTML = `<tr><td colspan="6" class="table-empty">加载失败: ${esc(e.message)}</td></tr>`;
      toast('加载公告失败', 'error');
    }
  }

  // ── 渲染列表 ──────────────────────────────────────────
  function renderList(announcements) {
    const listEl = container.querySelector('[data-list="announcements"]');
    if (!listEl) return;
    if (!announcements.length) {
      listEl.innerHTML = '<tr><td colspan="6" class="table-empty">暂无公告</td></tr>';
      return;
    }
    listEl.innerHTML = announcements.map(a => `
      <tr data-id="${a.id}">
        <td>${esc(String(a.priority ?? 0))}</td>
        <td>${esc(a.title)}</td>
        <td><span class="badge badge--${esc(a.type)}">${esc(a.type)}</span></td>
        <td>${a.expires_at ? esc(formatDate(a.expires_at)) : '长期有效'}</td>
        <td>${esc(formatDate(a.created_at))}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn--small" type="button" data-action="edit" data-id="${a.id}">编辑</button>
            <button class="btn btn--small btn--danger" type="button" data-action="delete" data-id="${a.id}" data-title="${esc(a.title)}">删除</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── 创建模态框 ────────────────────────────────────────
  function openCreateModal(triggerEl) {
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
    const startAtEl = document.getElementById('ann-start-at');
    const expiresAtEl = document.getElementById('ann-expires-at');
    const contentEl = document.getElementById('ann-content');
    if (titleEl) titleEl.value = '';
    if (typeEl) typeEl.value = 'info';
    if (startAtEl) startAtEl.value = getNowLocal();
    if (expiresAtEl) expiresAtEl.value = getDefaultExpiryLocal();
    if (contentEl) contentEl.value = '';
    const modal = document.getElementById('announcement-modal');
    if (modal && window.AdminCore) window.AdminCore.openModal(modal, triggerEl);
  }

  // ── 编辑模态框 ────────────────────────────────────────
  async function openEditModal(id, triggerEl) {
    try {
      const data = await apiFetch(`/api/announcements/${id}`);
      const a = data.announcement || data;
      const titleEl = document.getElementById('ann-title');
      const typeEl = document.getElementById('ann-type');
      const startAtEl = document.getElementById('ann-start-at');
      const expiresAtEl = document.getElementById('ann-expires-at');
      const contentEl = document.getElementById('ann-content');
      if (!a) throw new Error('公告不存在');
      if (titleEl) titleEl.value = a.title || '';
      if (typeEl) typeEl.value = a.type || 'info';
      if (startAtEl) startAtEl.value = toDateTimeLocal(a.start_at);
      if (expiresAtEl) expiresAtEl.value = toDateTimeLocal(a.expires_at);
      if (contentEl) contentEl.value = a.content || '';
      editingId = id;
      isDirty = false;
      const form = document.getElementById('announcement-form');
      if (form) {
        form.dataset.editingId = String(id);
        form.dataset.dirty = 'false';
      }
      const modal = document.getElementById('announcement-modal');
      if (modal && window.AdminCore) window.AdminCore.openModal(modal, triggerEl);
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
    if (window.AdminCore) window.AdminCore.closeModal('announcement-modal');
  }

  // ── 表单重置 ──────────────────────────────────────────
  function resetForm() {
    const form = document.getElementById('announcement-form');
    if (form) form.reset();
    const titleEl = document.getElementById('ann-title');
    const typeEl = document.getElementById('ann-type');
    const startAtEl = document.getElementById('ann-start-at');
    const expiresAtEl = document.getElementById('ann-expires-at');
    const contentEl = document.getElementById('ann-content');
    if (titleEl) titleEl.value = '';
    if (typeEl) typeEl.value = 'info';
    if (startAtEl) startAtEl.value = '';
    if (expiresAtEl) expiresAtEl.value = '';
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
    const startAtEl = document.getElementById('ann-start-at');
    const expiresAtEl = document.getElementById('ann-expires-at');
    const contentEl = document.getElementById('ann-content');
    if (!titleEl || !typeEl || !contentEl || !startAtEl || !expiresAtEl) { toast('表单元素缺失', 'error'); return; }
    const title = titleEl.value.trim();
    const type = typeEl.value;
    const start_at = toUtcIso(startAtEl.value);
    const expires_at = toUtcIso(expiresAtEl.value);
    const content = contentEl.value;

    if (!title || !content) { toast('标题和内容不能为空', 'error'); return; }
    if (content.length > 10000) { toast('内容过长', 'error'); return; }
    if (startAtEl.value && !start_at) {
      toast('开始时间格式无效', 'error');
      return;
    }
    if (expiresAtEl.value && !expires_at) {
      toast('有效期截止格式无效', 'error');
      return;
    }
    if (start_at && expires_at && new Date(start_at) >= new Date(expires_at)) {
      toast('有效期截止必须晚于开始时间', 'error');
      return;
    }

    // 前端统一把本地 datetime-local 转为 UTC ISO 字符串提交给后端。
    const payload = { title, type, start_at, expires_at, content: sanitizeRich(content) };
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/announcements/${editingId}` : '/api/announcements';

    try {
      await apiFetch(url, { method, body: JSON.stringify(payload) });
      toast(editingId ? '公告已更新' : '公告已创建', 'success');
      if (window.AdminCore) window.AdminCore.closeModal('announcement-modal');
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
