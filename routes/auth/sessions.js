/**
 * 认证路由 - 会话与账号管理模块（登录历史、活动动态、会话管理、账号注销）
 */
const { db, logActivity } = require('../../db');
const { requireAuth } = require('../../middleware/auth');

function setup(router) {
  router.get('/login-history', requireAuth, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    db.get('SELECT COUNT(*) as total FROM login_history WHERE user_id = ?', [req.user.id], (err, countRow) => {
      if (err) {
        console.error('[Auth/Sessions] Login history count error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      db.all(
        'SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [req.user.id, limit, offset],
        (err, rows) => {
          if (err) {
            console.error('[Auth/Sessions] Login history error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          res.json({
            history: rows,
            page,
            limit,
            total: countRow ? countRow.total : 0,
          });
        }
      );
    });
  });

  router.get('/activities', requireAuth, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    db.all(
      'SELECT id, event_type, description, metadata, ip, created_at FROM user_activities WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [req.user.id, limit],
      (err, rows) => {
        if (err) {
          console.error('[Auth/Sessions] Activities error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        const activities = rows.map(row => ({
          ...row,
          metadata: JSON.parse(row.metadata || '{}'),
        }));
        res.json({ activities });
      }
    );
  });

  router.get('/sessions', requireAuth, (req, res) => {
    db.all(
      'SELECT id, jti, expires_at, ip, device_type, browser, os, created_at FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
      (err, sessions) => {
        if (err) {
          console.error('[Auth/Sessions] Sessions error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }

        const currentJti = req.user.jti;
        const result = sessions.map(s => ({
          ...s,
          is_current: s.jti === currentJti,
          is_expired: new Date(s.expires_at) < new Date(),
        }));

        res.json({ sessions: result });
      }
    );
  });

  router.delete('/sessions/:id', requireAuth, (req, res) => {
    const sessionId = parseInt(req.params.id);

    db.get('SELECT * FROM user_sessions WHERE id = ? AND user_id = ?', [sessionId, req.user.id], (err, session) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!session) return res.status(404).json({ error: '会话不存在' });

      if (session.jti === req.user.jti) {
        return res.status(400).json({ error: '无法吊销当前会话' });
      }

      db.run('DELETE FROM user_sessions WHERE id = ?', [sessionId], (err) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        logActivity(req.user.id, 'session_revoke', `吊销了会话 ${session.browser} on ${session.os}`, { session_id: sessionId }, req.ip);
        res.json({ message: '会话已吊销' });
      });
    });
  });

  router.delete('/sessions', requireAuth, (req, res) => {
    db.run(
      'DELETE FROM user_sessions WHERE user_id = ? AND jti != ?',
      [req.user.id, req.user.jti],
      (err) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        logActivity(req.user.id, 'sessions_revoke_all', '吊销了所有其他会话', {}, req.ip);
        res.json({ message: '已吊销所有其他会话' });
      }
    );
  });

  router.delete('/account', requireAuth, async (req, res) => {
    const { password, confirmation } = req.body;
    const bcrypt = require('bcryptjs');

    if (password !== undefined) {
      db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], async (err, user) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });

        try {
          const valid = await bcrypt.compare(password, user.password_hash);
          if (!valid) {
            return res.status(401).json({ error: '密码不正确' });
          }
          res.json({
            requires_confirmation: true,
            message: '请输入 "DELETE MY ACCOUNT" 确认注销',
            warning: '此操作不可逆，所有数据将被永久删除',
          });
        } catch (e) {
          res.status(500).json({ error: '服务器内部错误' });
        }
      });
    } else if (confirmation === 'DELETE MY ACCOUNT') {
      const userId = req.user.id;
      db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
        if (err) {
          console.error('[Auth/Sessions] Delete account error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        logActivity(userId, 'account_deleted', `注销了账号 #${userId}`, {}, req.ip);
        res.json({ message: '账号已永久注销，再见！' });
      });
    } else {
      res.status(400).json({ error: '请输入 "DELETE MY ACCOUNT" 确认' });
    }
  });
}

module.exports = setup;
