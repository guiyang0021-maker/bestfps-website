const express = require('express');
const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();

const USER_STATUSES = ['pending', 'issued', 'rejected', 'cancelled'];
const MAX_INVOICE_AMOUNT = 999999.99;
const INVOICE_TYPES = Object.freeze({
  personal_normal: { label: '个人普通发票', requiresTaxNo: false },
  company_normal: { label: '企业普通发票', requiresTaxNo: true },
  company_special_vat: { label: '企业增值税专用发票', requiresTaxNo: true },
  company_electronic: { label: '企业电子发票', requiresTaxNo: true },
});
const LEGACY_INVOICE_TYPE_MAP = Object.freeze({
  personal: 'personal_normal',
  company: 'company_normal',
});

function isValidAmount(rawAmount) {
  const value = String(rawAmount == null ? '' : rawAmount).trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_INVOICE_AMOUNT;
}

function normalizeAmount(rawAmount) {
  return Math.round(Number(rawAmount) * 100) / 100;
}

function isSafeDownloadUrl(value) {
  if (!value) return true;
  if (/^\/(?!\/)/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function normalizeInvoice(row) {
  if (!row) return row;
  const normalizedType = LEGACY_INVOICE_TYPE_MAP[row.invoice_type] || row.invoice_type;
  const typeMeta = INVOICE_TYPES[normalizedType] || null;
  return {
    ...row,
    amount: Number(row.amount || 0),
    download_url: isSafeDownloadUrl(row.download_url) ? row.download_url : '',
    invoice_type: normalizedType,
    invoice_type_label: typeMeta ? typeMeta.label : row.invoice_type,
  };
}

function validateInvoicePayload(body) {
  const orderNo = String(body.order_no || '').trim();
  const invoiceType = LEGACY_INVOICE_TYPE_MAP[String(body.invoice_type || '').trim()] || String(body.invoice_type || '').trim();
  const invoiceTypeMeta = INVOICE_TYPES[invoiceType];
  const title = String(body.title || '').trim();
  const taxNo = String(body.tax_no || '').trim();
  const email = String(body.email || '').trim();
  const notes = String(body.notes || '').trim();

  if (!orderNo) return { error: '订单号不能为空' };
  if (orderNo.length > 60) return { error: '订单号不能超过 60 个字符' };
  if (!invoiceTypeMeta) return { error: '发票类型无效' };
  if (!title) return { error: '发票抬头不能为空' };
  if (title.length > 120) return { error: '发票抬头不能超过 120 个字符' };
  if (invoiceTypeMeta.requiresTaxNo && !taxNo) return { error: '当前发票类型必须填写税号' };
  if (taxNo.length > 60) return { error: '税号不能超过 60 个字符' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: '邮箱格式不正确' };
  if (!isValidAmount(body.amount)) return { error: `开票金额格式不正确，且不能超过 ${MAX_INVOICE_AMOUNT}` };
  if (notes.length > 500) return { error: '备注不能超过 500 个字符' };

  return {
    payload: {
      order_no: orderNo,
      invoice_type: invoiceType,
      title,
      tax_no: invoiceTypeMeta.requiresTaxNo ? taxNo : '',
      email,
      amount: normalizeAmount(body.amount),
      notes,
    },
  };
}

router.use(requireAuth);

router.get('/', (req, res) => {
  db.all(
    `SELECT id, order_no, invoice_type, title, tax_no, email, amount, status, notes, invoice_no, download_url, admin_note, issued_at, created_at, updated_at
     FROM invoice_requests
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error('[Invoices] List error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ invoices: rows.map(normalizeInvoice) });
    }
  );
});

router.post('/', (req, res) => {
  const { error, payload } = validateInvoicePayload(req.body || {});
  if (error) return res.status(400).json({ error });

  db.get(
    'SELECT id FROM invoice_requests WHERE user_id = ? AND order_no = ? AND status IN (?, ?)',
    [req.user.id, payload.order_no, 'pending', 'issued'],
    (err, existing) => {
      if (err) {
        console.error('[Invoices] Duplicate check error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (existing) {
        return res.status(409).json({ error: '该订单已存在开票申请' });
      }

      db.run(
        `INSERT INTO invoice_requests (
          user_id, order_no, invoice_type, title, tax_no, email, amount, notes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          req.user.id,
          payload.order_no,
          payload.invoice_type,
          payload.title,
          payload.tax_no,
          payload.email,
          payload.amount,
          payload.notes,
        ],
        function (insertErr) {
          if (insertErr) {
            console.error('[Invoices] Create error:', insertErr);
            return res.status(500).json({ error: '服务器内部错误' });
          }

          logActivity(
            req.user.id,
            'invoice_request_created',
            `提交了开票申请 ${payload.order_no}`,
            { invoice_request_id: this.lastID, order_no: payload.order_no, amount: payload.amount },
            req.ip
          );

          res.status(201).json({ message: '开票申请已提交', id: this.lastID });
        }
      );
    }
  );
});

router.put('/:id/cancel', (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (!invoiceId) return res.status(400).json({ error: '无效的申请ID' });

  db.get(
    'SELECT * FROM invoice_requests WHERE id = ? AND user_id = ?',
    [invoiceId, req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!row) return res.status(404).json({ error: '开票申请不存在' });
      if (row.status !== 'pending') {
        return res.status(400).json({ error: '仅待处理的申请可取消' });
      }

      db.run(
        "UPDATE invoice_requests SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
        [invoiceId],
        (updateErr) => {
          if (updateErr) {
            console.error('[Invoices] Cancel error:', updateErr);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          logActivity(req.user.id, 'invoice_request_cancelled', `取消了开票申请 ${row.order_no}`, { invoice_request_id: invoiceId }, req.ip);
          res.json({ message: '开票申请已取消' });
        }
      );
    }
  );
});

router.get('/admin/list', requireAdmin, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim();
  const type = String(req.query.type || '').trim();

  const where = [];
  const params = [];

  if (status && USER_STATUSES.includes(status)) {
    where.push('ir.status = ?');
    params.push(status);
  }
  if (type && INVOICE_TYPES[type]) {
    where.push('ir.invoice_type = ?');
    params.push(type);
  }
  if (search) {
    where.push('(ir.order_no LIKE ? OR ir.title LIKE ? OR ir.email LIKE ? OR u.username LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  db.get(
    `SELECT COUNT(*) as total
     FROM invoice_requests ir
     LEFT JOIN users u ON u.id = ir.user_id
     ${whereClause}`,
    params,
    (countErr, countRow) => {
      if (countErr) {
        console.error('[Invoices] Admin count error:', countErr);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      db.all(
        `SELECT ir.*, u.username
         FROM invoice_requests ir
         LEFT JOIN users u ON u.id = ir.user_id
         ${whereClause}
         ORDER BY ir.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        (err, rows) => {
          if (err) {
            console.error('[Invoices] Admin list error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          res.json({
            invoices: rows.map(normalizeInvoice),
            total: countRow ? countRow.total : 0,
            page,
            limit,
          });
        }
      );
    }
  );
});

router.get('/admin/:id', requireAdmin, (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (!invoiceId) return res.status(400).json({ error: '无效的申请ID' });

  db.get(
    `SELECT ir.*, u.username
     FROM invoice_requests ir
     LEFT JOIN users u ON u.id = ir.user_id
     WHERE ir.id = ?`,
    [invoiceId],
    (err, row) => {
      if (err) {
        console.error('[Invoices] Admin detail error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!row) return res.status(404).json({ error: '开票申请不存在' });
      res.json({ invoice: normalizeInvoice(row) });
    }
  );
});

router.put('/admin/:id', requireAdmin, (req, res) => {
  const invoiceId = parseInt(req.params.id, 10);
  if (!invoiceId) return res.status(400).json({ error: '无效的申请ID' });

  const status = String(req.body.status || '').trim();
  const invoiceNo = String(req.body.invoice_no || '').trim();
  const downloadUrl = String(req.body.download_url || '').trim();
  const adminNote = String(req.body.admin_note || '').trim();

  if (!USER_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态' });
  }
  if (invoiceNo.length > 80) return res.status(400).json({ error: '发票号不能超过 80 个字符' });
  if (downloadUrl.length > 500) return res.status(400).json({ error: '下载链接不能超过 500 个字符' });
  if (!isSafeDownloadUrl(downloadUrl)) return res.status(400).json({ error: '下载链接格式无效，仅支持 http(s) 或站内相对路径' });
  if (adminNote.length > 500) return res.status(400).json({ error: '管理员备注不能超过 500 个字符' });
  if (status === 'issued' && !invoiceNo) {
    return res.status(400).json({ error: '开票完成时必须填写发票号' });
  }

  db.get('SELECT * FROM invoice_requests WHERE id = ?', [invoiceId], (err, current) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    if (!current) return res.status(404).json({ error: '开票申请不存在' });

    const issuedAt = status === 'issued' ? new Date().toISOString() : null;
    db.run(
      `UPDATE invoice_requests
       SET status = ?, invoice_no = ?, download_url = ?, admin_note = ?, issued_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [status, invoiceNo, downloadUrl, adminNote, issuedAt, invoiceId],
      (updateErr) => {
        if (updateErr) {
          console.error('[Invoices] Admin update error:', updateErr);
          return res.status(500).json({ error: '服务器内部错误' });
        }

        logActivity(
          req.user.id,
          'admin_invoice_update',
          `更新了开票申请 #${invoiceId} 状态为 ${status}`,
          { invoice_request_id: invoiceId, previous_status: current.status, status, invoice_no: invoiceNo },
          req.ip
        );

        res.json({ message: '开票申请已更新' });
      }
    );
  });
});

module.exports = router;
