(function () {
  'use strict';

  // ── 依赖检查 ────────────────────────────────────────────
  if (typeof SafeDom === 'undefined') {
    console.error('[AdminInvoices] SafeDom not loaded');
  }

  let container = null;
  let tableEl = null;
  let paginationEl = null;
  let currentPage = 1;
  let currentSearch = '';
  let currentStatus = '';
  let currentType = '';
  let controller = null;

  const { apiFetch } = window.AdminApi;
  const { createDebounce, formatDate } = window.AdminUtils;
  const { showSkeleton, toast, renderPagination } = window.AdminUI;
  const INVOICE_TYPES = Object.freeze({
    personal: '个人普通发票',
    company: '企业普通发票',
    personal_normal: '个人普通发票',
    company_normal: '企业普通发票',
    company_special_vat: '企业增值税专用发票',
    company_electronic: '企业电子发票',
  });

  function getStatusMeta(status) {
    if (status === 'issued') return { label: '已开票', cls: 'badge-success' };
    if (status === 'rejected') return { label: '已驳回', cls: 'badge-error' };
    if (status === 'cancelled') return { label: '已取消', cls: 'badge-warning' };
    return { label: '待处理', cls: 'badge-info' };
  }

  function getTypeLabel(type, fallbackLabel) {
    return fallbackLabel || INVOICE_TYPES[type] || type || '—';
  }

  function init(el) {
    container = el;
    tableEl = container.querySelector('[data-table="invoices"]');
    paginationEl = container.querySelector('[data-pagination="invoices"]');
    if (!tableEl || !paginationEl) return;

    const searchInput = container.querySelector('#invoice-search');
    const statusFilter = container.querySelector('#invoice-status-filter');
    const typeFilter = container.querySelector('#invoice-type-filter');
    const debouncedSearch = createDebounce((value) => {
      currentSearch = value.trim();
      loadInvoices(1);
    }, 300);

    if (searchInput) {
      searchInput.addEventListener('input', (event) => debouncedSearch(event.target.value));
    }
    if (statusFilter) {
      statusFilter.addEventListener('change', (event) => {
        currentStatus = event.target.value;
        loadInvoices(1);
      });
    }
    if (typeFilter) {
      typeFilter.addEventListener('change', (event) => {
        currentType = event.target.value;
        loadInvoices(1);
      });
    }

    tableEl.addEventListener('click', (event) => {
      const button = event.target.closest('[data-invoice-id]');
      if (!button) return;
      const invoiceId = parseInt(button.dataset.invoiceId, 10);
      if (!invoiceId) return;
      openInvoiceModal(invoiceId, button);
    });

    loadInvoices(1);
  }

  async function loadInvoices(page) {
    if (controller) controller.abort();
    controller = new AbortController();
    currentPage = page;

    showSkeleton(tableEl, { rows: 6, cols: 9 });
    paginationEl.innerHTML = '';

    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (currentSearch) params.set('search', currentSearch);
    if (currentStatus) params.set('status', currentStatus);
    if (currentType) params.set('type', currentType);

    try {
      const data = await apiFetch('/api/invoices/admin/list?' + params.toString(), { signal: controller.signal });
      if (data.__aborted || data.__unauthorized) return;
      renderTable(data);
    } catch (err) {
      tableEl.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.className = 'table-empty';
      SafeDom.setText(td, '加载失败: ' + err.message);
      tr.appendChild(td);
      tableEl.appendChild(tr);
    }
  }

  function renderTable(data) {
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const total = Number(data.total || 0);
    const page = Number(data.page || 1);
    const limit = Math.max(1, Number(data.limit || 20));
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const badge = container.querySelector('#invoices-total-badge');
    if (badge) SafeDom.setText(badge, total ? `共 ${total} 条申请` : '0');

    if (!invoices.length) {
      tableEl.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.className = 'table-empty';
      SafeDom.setText(td, '暂无开票申请');
      tr.appendChild(td);
      tableEl.appendChild(tr);
    } else {
      tableEl.innerHTML = '';
      invoices.forEach((invoice) => {
        const meta = getStatusMeta(invoice.status);
        const typeLabel = getTypeLabel(invoice.invoice_type, invoice.invoice_type_label);

        const tr = document.createElement('tr');

        // ID
        const tdId = document.createElement('td');
        SafeDom.setText(tdId, String(invoice.id));
        tr.appendChild(tdId);

        // Order no
        const tdOrder = document.createElement('td');
        SafeDom.setText(tdOrder, invoice.order_no);
        tr.appendChild(tdOrder);

        // Username
        const tdUsername = document.createElement('td');
        SafeDom.setText(tdUsername, invoice.username || '—');
        tr.appendChild(tdUsername);

        // Title
        const tdTitle = document.createElement('td');
        SafeDom.setText(tdTitle, invoice.title);
        tr.appendChild(tdTitle);

        // Type
        const tdType = document.createElement('td');
        SafeDom.setText(tdType, typeLabel);
        tr.appendChild(tdType);

        // Amount
        const tdAmount = document.createElement('td');
        SafeDom.setText(tdAmount, '¥' + Number(invoice.amount || 0).toFixed(2));
        tr.appendChild(tdAmount);

        // Status badge
        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = 'badge ' + meta.cls;
        SafeDom.setText(statusBadge, meta.label);
        tdStatus.appendChild(statusBadge);
        tr.appendChild(tdStatus);

        // Created at
        const tdCreated = document.createElement('td');
        SafeDom.setText(tdCreated, formatDate(invoice.created_at));
        tr.appendChild(tdCreated);

        // Action button
        const tdAction = document.createElement('td');
        const actionBtn = document.createElement('button');
        actionBtn.className = 'btn btn--small';
        actionBtn.type = 'button';
        actionBtn.dataset.invoiceId = invoice.id;
        SafeDom.setText(actionBtn, '处理');
        tdAction.appendChild(actionBtn);
        tr.appendChild(tdAction);

        tableEl.appendChild(tr);
      });
    }

    renderPagination(paginationEl, {
      page,
      totalPages,
      onChange: (nextPage) => loadInvoices(nextPage),
    });
  }

  async function openInvoiceModal(invoiceId, triggerEl) {
    try {
      const data = await apiFetch('/api/invoices/admin/' + invoiceId);
      const invoice = data.invoice;
      if (!invoice) throw new Error('开票申请不存在');

      document.getElementById('invoice-id').value = invoice.id;
      document.getElementById('invoice-admin-status').value = invoice.status || 'pending';
      document.getElementById('invoice-admin-no').value = invoice.invoice_no || '';
      document.getElementById('invoice-admin-download-url').value = invoice.download_url || '';
      document.getElementById('invoice-admin-note').value = invoice.admin_note || '';

      const metaContainer = document.getElementById('invoice-meta');
      metaContainer.innerHTML = '';
      const addRow = (label, value) => {
        const div = document.createElement('div');
        const strong = document.createElement('strong');
        SafeDom.setText(strong, label);
        div.appendChild(strong);
        SafeDom.setText(div, value ? ' ' + value : ' —');
        metaContainer.appendChild(div);
      };
      addRow('用户：', invoice.username ? `${invoice.username} (${invoice.email})` : null);
      addRow('订单号：', invoice.order_no);
      addRow('抬头：', invoice.title + (invoice.invoice_type_label ? ' · ' + invoice.invoice_type_label : ''));
      addRow('税号：', invoice.tax_no || null);
      addRow('金额：', '¥' + Number(invoice.amount || 0).toFixed(2));
      addRow('备注：', invoice.notes || null);

      if (window.AdminCore) {
        window.AdminCore.openModal('invoice-modal', triggerEl);
      }
    } catch (err) {
      toast('加载开票申请失败: ' + err.message, 'error');
    }
  }

  async function saveInvoice() {
    const invoiceId = parseInt(document.getElementById('invoice-id').value, 10);
    const status = document.getElementById('invoice-admin-status').value;
    const invoiceNo = document.getElementById('invoice-admin-no').value.trim();
    const downloadUrl = document.getElementById('invoice-admin-download-url').value.trim();
    const adminNote = document.getElementById('invoice-admin-note').value.trim();

    if (!invoiceId) return;
    if (status === 'issued' && !invoiceNo) {
      toast('开票完成时必须填写发票号', 'error');
      return;
    }

    try {
      await apiFetch('/api/invoices/admin/' + invoiceId, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          invoice_no: invoiceNo,
          download_url: downloadUrl,
          admin_note: adminNote,
        }),
      });
      toast('开票申请已更新', 'success');
      if (window.AdminCore) window.AdminCore.closeModal('invoice-modal');
      loadInvoices(currentPage);
    } catch (err) {
      toast('保存失败: ' + err.message, 'error');
    }
  }

  window.AdminInvoices = {
    init,
    loadInvoices,
    openInvoiceModal,
    saveInvoice,
  };
})();
