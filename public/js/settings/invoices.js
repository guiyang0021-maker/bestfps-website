(function () {
  'use strict';

  const core = window.SettingsPage;
  if (!core) return;

  function invoiceApi(path, options) {
    const requestOptions = Object.assign({}, options || {});
    requestOptions.credentials = 'include';
    requestOptions.headers = Object.assign({
      'Content-Type': 'application/json',
      'X-CSRF-Token': core.getCsrfToken(),
    }, requestOptions.headers || {});
    return core.requestJson('/api/invoices' + path, requestOptions, '开票接口');
  }

  function getInvoiceTypeLabel(type) {
    return (core.INVOICE_TYPE_META[type] && core.INVOICE_TYPE_META[type].label) || type || '—';
  }

  function getInvoiceStatusMeta(status) {
    if (status === 'issued') return { label: '已开票', cls: 'badge-success' };
    if (status === 'rejected') return { label: '已驳回', cls: 'badge-error' };
    if (status === 'cancelled') return { label: '已取消', cls: 'badge-warning' };
    return { label: '待处理', cls: 'badge-info' };
  }

  function getSafeDownloadUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function toggleInvoiceType() {
    const type = document.getElementById('invoice-type').value;
    const meta = core.INVOICE_TYPE_META[type] || core.INVOICE_TYPE_META.personal_normal;
    const label = document.getElementById('invoice-tax-no-label');
    const input = document.getElementById('invoice-tax-no');
    const required = !!meta.requiresTaxNo;
    label.classList.toggle('required', required);
    input.placeholder = required ? '当前票种必须填写税号' : '该票种可不填';
  }

  function clearInvoiceForm() {
    const currentUser = core.getCurrentUser() || {};
    document.getElementById('invoice-order-no').value = '';
    document.getElementById('invoice-amount').value = '';
    document.getElementById('invoice-type').value = 'personal_normal';
    document.getElementById('invoice-title').value = currentUser.username || '';
    document.getElementById('invoice-tax-no').value = '';
    document.getElementById('invoice-email').value = currentUser.email || '';
    document.getElementById('invoice-notes').value = '';
    toggleInvoiceType();
  }

  async function loadInvoicesSection() {
    const container = document.getElementById('invoice-list-container');
    core.setContainerMessage(container, '加载中...', 'loading');

    try {
      const data = await invoiceApi('');
      renderInvoices(data.invoices || []);
    } catch (err) {
      core.setContainerMessage(container, '加载失败：' + err.message, 'error');
    }
  }

  function renderInvoices(invoices) {
    const container = document.getElementById('invoice-list-container');
    if (!container) return;
    if (!invoices.length) {
      core.setContainerMessage(container, '暂无开票申请', 'info');
      return;
    }

    container.innerHTML = invoices.map(function (invoice) {
      const meta = getInvoiceStatusMeta(invoice.status);
      const canCancel = invoice.status === 'pending';
      const downloadUrl = getSafeDownloadUrl(invoice.download_url);
      return [
        '<div style="padding:16px 0;border-bottom:1px solid var(--border-light);">',
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;">',
        '<div>',
        '<div style="font-size:0.95rem;font-weight:600;">', core.escapeHtml(invoice.title), '</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:4px;">订单号：',
        core.escapeHtml(invoice.order_no), ' · ',
        core.escapeHtml(invoice.invoice_type_label || getInvoiceTypeLabel(invoice.invoice_type)), ' · ￥',
        Number(invoice.amount || 0).toFixed(2),
        '</div>',
        '</div>',
        '<span class="badge ', core.escapeHtml(meta.cls), '">', core.escapeHtml(meta.label), '</span>',
        '</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:6px;">申请时间：', core.escapeHtml(new Date(invoice.created_at).toLocaleString('zh-CN')), '</div>',
        invoice.invoice_no
          ? '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:6px;">发票号：' + core.escapeHtml(invoice.invoice_no) + '</div>'
          : '',
        invoice.admin_note
          ? '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:6px;">处理备注：' + core.escapeHtml(invoice.admin_note) + '</div>'
          : '',
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">',
        downloadUrl
          ? '<a class="btn btn-secondary" href="' + core.escapeHtml(downloadUrl) + '" target="_blank" rel="noopener" style="padding:6px 14px;font-size:0.8125rem;">下载发票</a>'
          : '',
        canCancel
          ? '<button class="btn btn-secondary" type="button" data-invoice-cancel-id="' + core.escapeHtml(invoice.id) + '" style="padding:6px 14px;font-size:0.8125rem;">取消申请</button>'
          : '',
        '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  async function submitInvoiceRequest() {
    core.hide('alert-success');
    core.hide('alert-error');

    const payload = {
      order_no: document.getElementById('invoice-order-no').value.trim(),
      invoice_type: document.getElementById('invoice-type').value,
      title: document.getElementById('invoice-title').value.trim(),
      tax_no: document.getElementById('invoice-tax-no').value.trim(),
      email: document.getElementById('invoice-email').value.trim(),
      amount: document.getElementById('invoice-amount').value,
      notes: document.getElementById('invoice-notes').value.trim(),
    };
    const invoiceTypeMeta = core.INVOICE_TYPE_META[payload.invoice_type];

    if (!payload.order_no || !payload.title || !payload.email || !payload.amount) {
      core.show('alert-error', '❌ 请填写所有必填项');
      return;
    }
    if (!invoiceTypeMeta) {
      core.show('alert-error', '❌ 发票类型无效');
      return;
    }
    if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(String(payload.amount).trim())) {
      core.show('alert-error', '❌ 金额格式不正确，最多保留两位小数');
      return;
    }
    if (Number(payload.amount) <= 0 || Number(payload.amount) > 999999.99) {
      core.show('alert-error', '❌ 金额必须大于 0 且不能超过 999999.99');
      return;
    }
    if (invoiceTypeMeta.requiresTaxNo && !payload.tax_no) {
      core.show('alert-error', '❌ 当前票种必须填写税号');
      return;
    }

    const btn = document.getElementById('invoice-submit-btn');
    btn.disabled = true;
    btn.textContent = '提交中...';

    try {
      const data = await invoiceApi('', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      core.show('alert-success', '✅ ' + (data.message || '开票申请已提交'));
      clearInvoiceForm();
      loadInvoicesSection();
    } catch (err) {
      core.show('alert-error', '❌ ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '提交开票申请';
  }

  async function cancelInvoiceRequest(id) {
    core.hide('alert-success');
    core.hide('alert-error');

    try {
      const data = await invoiceApi('/' + id + '/cancel', { method: 'PUT' });
      core.show('alert-success', '✅ ' + (data.message || '开票申请已取消'));
      loadInvoicesSection();
    } catch (err) {
      core.show('alert-error', '❌ ' + err.message);
    }
  }

  function init() {
    document.getElementById('invoice-submit-btn')?.addEventListener('click', submitInvoiceRequest);
    document.getElementById('invoice-type')?.addEventListener('change', toggleInvoiceType);

    const invoiceList = document.getElementById('invoice-list-container');
    if (invoiceList) {
      invoiceList.addEventListener('click', function (event) {
        const button = event.target.closest('[data-invoice-cancel-id]');
        if (!button) return;
        cancelInvoiceRequest(button.dataset.invoiceCancelId);
      });
    }

    core.registerSectionLoader('invoices', loadInvoicesSection);
  }

  window.SettingsInvoices = {
    clearInvoiceForm: clearInvoiceForm,
    init: init,
    loadInvoicesSection: loadInvoicesSection,
    toggleInvoiceType: toggleInvoiceType,
  };
})();
