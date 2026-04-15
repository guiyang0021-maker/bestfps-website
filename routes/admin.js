/**
 * 管理员 API 路由
 */
const express = require('express');
const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { cached } = require('../middleware/cache');

const ROLES = ['user', 'admin', 'superadmin'];
const ACTIONS = ['suspend', 'unsuspend', 'ban'];

const router = express.Router();

// 所有路由需要管理员权限
router.use(requireAuth, requireAdmin);

router.get('/stats', cached(120), (req, res) => {
  let pending = 7;
  const results = {};
  let responded = false;

  const done = (err) => {
    if (responded) return;
    responded = true;
    if (err) {
      console.error('[Admin] Stats error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    res.json({
      users: {
        total: results.total || 0,
        active: results.active_cnt || 0,
        suspended: results.suspended_cnt || 0,
        verified: results.verified_cnt || 0,
        today: results.today_cnt || 0,
      },
      downloads: results.downloads || 0,
      presets: results.presets || 0,
    });
  };

  db.get('SELECT COUNT(*) as total_cnt FROM users', [], (err, row) => {
    if (err) return done(err);
    results.total = row ? (row.total_cnt || row.total || 0) : 0;
    if (--pending === 0) done();
  });
  db.get("SELECT COUNT(*) as active_cnt FROM users WHERE status = 'active'", [], (err, row) => {
    if (err) return done(err);
    results.active_cnt = row ? (row.active_cnt || row.active || 0) : 0;
    if (--pending === 0) done();
  });
  db.get("SELECT COUNT(*) as suspended_cnt FROM users WHERE status = 'suspended' OR status = 'banned'", [], (err, row) => {
    if (err) return done(err);
    results.suspended_cnt = row ? (row.suspended_cnt || row.suspended || 0) : 0;
    if (--pending === 0) done();
  });
  db.get('SELECT COUNT(*) as verified_cnt FROM users WHERE verified = 1', [], (err, row) => {
    if (err) return done(err);
    results.verified_cnt = row ? (row.verified_cnt || row.verified || 0) : 0;
    if (--pending === 0) done();
  });
  db.get("SELECT COUNT(*) as today_cnt FROM users WHERE date(created_at) = date('now')", [], (err, row) => {
    if (err) return done(err);
    results.today_cnt = row ? (row.today_cnt || row.today || 0) : 0;
    if (--pending === 0) done();
  });
  db.get('SELECT COUNT(*) as total_dl_cnt FROM downloads', [], (err, row) => {
    if (err) return done(err);
    results.downloads = row ? (row.total_dl_cnt || row.total_dl || 0) : 0;
    if (--pending === 0) done();
  });
  db.get('SELECT COUNT(*) as presets_cnt FROM config_presets', [], (err, row) => {
    if (err) return done(err);
    results.presets = row ? (row.presets_cnt || row.presets_total || 0) : 0;
    if (--pending === 0) done();
  });
});

router.get('/users', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const status = req.query.status || '';
  const role = req.query.role || '';

  let where = [];
  let params = [];

  if (search) {
    where.push('(username LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (role) {
    where.push('role = ?');
    params.push(role);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  db.get(`SELECT COUNT(*) as total FROM users ${whereClause}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });

    db.all(
      `SELECT id, username, email, role, status, verified, created_at, suspended_at, suspend_reason FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });

        const users = rows.map(u => ({
          ...u,
          verified: u.verified === 1,
          is_current: u.id === req.user.id,
        }));

        res.json({
          users,
          page,
          limit,
          total: countRow?.total || 0,
        });
      }
    );
  });
});

router.get('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

  db.get(
    'SELECT id, username, email, role, status, verified, bio, website, social_discord, social_twitter, social_github, created_at, suspended_at, suspend_reason FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!user) return res.status(404).json({ error: '用户不存在' });

      user.verified = user.verified === 1;
      user.is_current = user.id === req.user.id;

      let pending = 4;
      const stats = { downloads: 0, presets: 0, sessions: 0, activities: 0 };

      const sendResponse = (err) => {
        if (res.headersSent) return;
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        res.json({ user, stats });
      };

      db.get('SELECT COUNT(*) as dl FROM downloads WHERE user_id = ?', [userId], (err, row) => {
        if (!err && row) stats.downloads = row.dl;
        if (--pending === 0) sendResponse();
      });
      db.get('SELECT COUNT(*) as presets FROM config_presets WHERE user_id = ?', [userId], (err, row) => {
        if (!err && row) stats.presets = row.presets;
        if (--pending === 0) sendResponse();
      });
      db.get('SELECT COUNT(*) as sessions FROM user_sessions WHERE user_id = ?', [userId], (err, row) => {
        if (!err && row) stats.sessions = row.sessions;
        if (--pending === 0) sendResponse();
      });
      db.get('SELECT COUNT(*) as activities FROM user_activities WHERE user_id = ?', [userId], (err, row) => {
        if (!err && row) stats.activities = row.activities;
        if (--pending === 0) sendResponse();
      });
    }
  );
});

router.put('/users/:id/role', (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body;

  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
  if (userId === req.user.id) return res.status(400).json({ error: '无法修改自己的角色' });
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }

  db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], (err) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    logActivity(req.user.id, 'admin_role_change', `将用户 #${userId} 的角色修改为 ${role}`, { target_user_id: userId, new_role: role }, req.ip);
    res.json({ message: `用户角色已更新为 ${role}` });
  });
});

router.put('/users/:id/suspend', (req, res) => {
  const userId = parseInt(req.params.id);
  const { action, reason } = req.body;

  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
  if (userId === req.user.id) return res.status(400).json({ error: '无法对自己执行此操作' });
  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: '无效的操作' });
  }

  if (action === 'unsuspend') {
    db.run('UPDATE users SET status = ?, suspended_at = NULL, suspend_reason = ? WHERE id = ?', ['active', '', userId], (err) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      logActivity(req.user.id, 'admin_unsuspend', `解封了用户 #${userId}`, { target_user_id: userId }, req.ip);
      res.json({ message: '用户已解封' });
    });
  } else {
    // Map action to proper status value
    const statusMap = { suspend: 'suspended', ban: 'banned' };
    const newStatus = statusMap[action] || action;
    db.run('UPDATE users SET status = ?, suspended_at = datetime(\'now\'), suspend_reason = ? WHERE id = ?', [newStatus, reason || '', userId], (err) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      // 吊销该用户所有会话
      db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId], (err) => {
        if (err) console.error('[Admin] Revoke sessions error:', err);
      });
      const msg = action === 'ban' ? '永久封禁' : '封禁';
      logActivity(req.user.id, `admin_${action}`, `封禁了用户 #${userId}${reason ? '，原因：' + reason : ''}`, { target_user_id: userId, reason }, req.ip);
      res.json({ message: `用户已被${msg}` });
    });
  }
});

router.delete('/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);

  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });
  if (userId === req.user.id) return res.status(400).json({ error: '无法删除自己的账号' });

  db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    logActivity(req.user.id, 'admin_delete_user', `删除了用户 #${userId}`, { deleted_user_id: userId }, req.ip);
    res.json({ message: '用户已删除' });
  });
});

router.get('/login-history/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 50);
  const offset = (page - 1) * limit;

  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

  db.get('SELECT COUNT(*) as total FROM login_history WHERE user_id = ?', [userId], (err, countRow) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    db.all(
      'SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        res.json({ history: rows, page, limit, total: countRow?.total || 0 });
      }
    );
  });
});

router.get('/activities/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 30), 100);

  if (!userId || isNaN(userId)) return res.status(400).json({ error: '无效的用户ID' });

  db.all(
    'SELECT * FROM user_activities WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      const activities = rows.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}'),
      }));
      res.json({ activities });
    }
  );
});

router.get('/stats/registrations', (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 30);
  const result = [];

  db.all(`
    SELECT date(created_at) as date, COUNT(*) as count
    FROM users
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY date(created_at)
    ORDER BY date ASC
  `, [days], (err, rows) => {
    if (err) {
      console.error('[Admin] Registrations error:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    res.json({ registrations: rows });
  });
});

router.get('/activities', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  db.all(
    `SELECT ua.id, ua.user_id, ua.event_type, ua.description, ua.ip, ua.created_at, u.username
     FROM user_activities ua
     LEFT JOIN users u ON ua.user_id = u.id
     ORDER BY ua.created_at DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      const activities = rows.map(row => ({
        ...row,
        metadata: {},
      }));
      res.json({ activities });
    }
  );
});

module.exports = router;
