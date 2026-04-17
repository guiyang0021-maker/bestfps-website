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

    const SafeDom = window.SafeDom;
    const setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };
    const sanitize = SafeDom && SafeDom.sanitize ? SafeDom.sanitize : function(val) { return val == null ? '' : String(val); };

    container.innerHTML = '';

    invoices.forEach(function (invoice) {
      const meta = getInvoiceStatusMeta(invoice.status);
      const canCancel = invoice.status === 'pending';
      const downloadUrl = getSafeDownloadUrl(invoice.download_url);

      const item = document.createElement('div');
      item.style.cssText = 'padding:16px 0;border-bottom:1px solid var(--border-light);';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;';

      const info = document.createElement('div');

      const title = document.createElement('div');
      title.style.fontSize = '0.95rem';
      title.style.fontWeight = '600';
      setText(title, sanitize(invoice.title));
      info.appendChild(title);

      const details = document.createElement('div');
      details.style.fontSize = '0.8125rem';
      details.style.color = 'var(--text-secondary)';
      details.style.marginTop = '4px';
      setText(details, '订单号：' + sanitize(invoice.order_no) + ' · ' + sanitize(invoice.invoice_type_label || getInvoiceTypeLabel(invoice.invoice_type)) + ' · ￥' + Number(invoice.amount || 0).toFixed(2));
      info.appendChild(details);

      header.appendChild(info);

      const statusBadge = document.createElement('span');
      statusBadge.className = 'badge ' + sanitize(meta.cls);
      setText(statusBadge, sanitize(meta.label));
      header.appendChild(statusBadge);

      item.appendChild(header);

      const applyTime = document.createElement('div');
      applyTime.style.fontSize = '0.8125rem';
      applyTime.style.color = 'var(--text-secondary)';
      applyTime.style.marginBottom = '6px';
      setText(applyTime, '申请时间：' + sanitize(new Date(invoice.created_at).toLocaleString('zh-CN')));
      item.appendChild(applyTime);

      if (invoice.invoice_no) {
        const invoiceNo = document.createElement('div');
        invoiceNo.style.fontSize = '0.8125rem';
        invoiceNo.style.color = 'var(--text-secondary)';
        invoiceNo.style.marginBottom = '6px';
        setText(invoiceNo, '发票号：' + sanitize(invoice.invoice_no));
        item.appendChild(invoiceNo);
      }

      if (invoice.admin_note) {
        const adminNote = document.createElement('div');
        adminNote.style.fontSize = '0.8125rem';
        adminNote.style.color = 'var(--text-secondary)';
        adminNote.style.marginBottom = '6px';
        setText(adminNote, '处理备注：' + sanitize(invoice.admin_note));
        item.appendChild(adminNote);
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';

      if (downloadUrl) {
        const downloadLink = document.createElement('a');
        downloadLink.className = 'btn btn-secondary';
        downloadLink.href = downloadUrl;
        downloadLink.target = '_blank';
        downloadLink.rel = 'noopener';
        downloadLink.style.cssText = 'padding:6px 14px;font-size:0.8125rem;';
        downloadLink.textContent = '下载发票';
        actions.appendChild(downloadLink);
      }

      if (canCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.type = 'button';
        cancelBtn.dataset.invoiceCancelId = invoice.id;
        cancelBtn.style.cssText = 'padding:6px 14px;font-size:0.8125rem;';
        cancelBtn.textContent = '取消申请';
        actions.appendChild(cancelBtn);
      }

      item.appendChild(actions);
      container.appendChild(item);
    });
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
