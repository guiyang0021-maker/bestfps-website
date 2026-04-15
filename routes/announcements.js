/**
 * 公告路由
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { cached, invalidate } = require('../middleware/cache');

const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'error', 'feature', 'maintenance'];
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const now = new Date().toISOString();

  db.all(
    `SELECT a.*, ua.dismissed, ua.dismissed_at
     FROM announcements a
     LEFT JOIN user_announcements ua ON a.id = ua.announcement_id AND ua.user_id = ?
     WHERE (a.expires_at IS NULL OR a.expires_at > ?)
     AND (a.start_at IS NULL OR a.start_at <= ?)
     ORDER BY a.priority DESC, a.created_at DESC`,
    [req.user.id, now, now],
    (err, rows) => {
      if (err) {
        console.error('[Announcements] List error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ announcements: rows });
    }
  );
});

router.get('/public', cached(300), optionalAuth, (req, res) => {
  const now = new Date().toISOString();

  db.all(
    `SELECT * FROM announcements
     WHERE (expires_at IS NULL OR expires_at > ?)
     AND (start_at IS NULL OR start_at <= ?)
     AND priority >= 0
     ORDER BY priority DESC, created_at DESC`,
    [now, now],
    (err, rows) => {
      if (err) {
        console.error('[Announcements] Public list error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ announcements: rows });
    }
  );
});

router.get('/all', requireAuth, requireAdmin, (req, res) => {
  // Admin: list ALL announcements regardless of active status
  db.all(
    `SELECT * FROM announcements ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('[Announcements] Admin list error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ announcements: rows });
    }
  );
});

router.get('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: '无效的公告ID' });
  }
  db.get('SELECT * FROM announcements WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('[Announcements] Get error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    if (!row) {
      return res.status(404).json({ error: '公告不存在' });
    }
    res.json(row);
  });
});

router.post('/:id/dismiss', requireAuth, (req, res) => {
  const announcementId = parseInt(req.params.id);

  if (!announcementId || isNaN(announcementId)) {
    return res.status(400).json({ error: '无效的公告ID' });
  }

  db.get('SELECT id FROM announcements WHERE id = ?', [announcementId], (err, row) => {
    if (err) {
      console.error('[Announcements] Dismiss error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    if (!row) {
      return res.status(404).json({ error: '公告不存在' });
    }
    db.run(
      'INSERT OR REPLACE INTO user_announcements (user_id, announcement_id, dismissed, dismissed_at) VALUES (?, ?, 1, datetime(\'now\'))',
      [req.user.id, announcementId],
      (err) => {
        if (err) {
          console.error('[Announcements] Dismiss error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        res.json({ message: '公告已关闭' });
      }
    );
  });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, content, type, priority, start_at, expires_at } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: '标题和内容不能为空' });
  }

  const announceType = ANNOUNCEMENT_TYPES.includes(type) ? type : 'info';

  db.run(
    'INSERT INTO announcements (title, content, type, priority, start_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [title, content, announceType, priority || 0, start_at || null, expires_at || null],
    function (err) {
      if (err) {
        console.error('[Announcements] Create error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.status(201).json({ message: '公告已发布', id: this.lastID });
      invalidate('/public');
    }
  );
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { title, content, type, priority, start_at, expires_at } = req.body;
  const id = parseInt(req.params.id);

  const updates = [];
  const params = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (type !== undefined) { updates.push('type = ?'); params.push(type); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (start_at !== undefined) { updates.push('start_at = ?'); params.push(start_at); }
  if (expires_at !== undefined) { updates.push('expires_at = ?'); params.push(expires_at); }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }

  params.push(id);
  db.run(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) {
      console.error('[Announcements] Update error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    res.json({ message: '公告已更新' });
    invalidate('/public');
  });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);

  db.run('DELETE FROM announcements WHERE id = ?', [id], (err) => {
    if (err) {
      console.error('[Announcements] Delete error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    db.run('DELETE FROM user_announcements WHERE announcement_id = ?', [id]);
    res.json({ message: '公告已删除' });
    invalidate('/public');
  });
});

module.exports = router;
