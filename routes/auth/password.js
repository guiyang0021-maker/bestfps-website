/**
 * 认证路由 - 密码模块（忘记密码、重置密码、修改密码）
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { sendPasswordResetEmail } = require('../../email/sender');
const { forgotPasswordLimiter } = require('../../middleware/rateLimiter');
const { PASSWORD_REGEX } = require('./utils');

function setup(router) {
  router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: '邮箱不能为空' });

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('[Auth/Password] Forgot password error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!user) {
        return res.json({ message: '如果邮箱存在，重置链接已发送' });
      }

      db.run('DELETE FROM password_resets WHERE user_id = ?', [user.id], (err) => {
        if (err) console.error('[Auth/Password] Delete old reset error:', err);
      });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.run(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expiresAt],
        async (err) => {
          if (err) {
            console.error('[Auth/Password] Forgot password error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          try {
            await sendPasswordResetEmail(email, token);
            res.json({ message: '如果邮箱存在，重置链接已发送' });
          } catch (emailErr) {
            console.error('[Auth/Password] Send reset email error:', emailErr);
            res.json({ message: '如果邮箱存在，重置链接已发送' });
          }
        }
      );
    });
  });

  router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'token 和新密码不能为空' });
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ error: '密码至少 8 位，必须包含大写字母、小写字母、数字和特殊字符' });
    }

    db.get('SELECT * FROM password_resets WHERE token = ?', [token], async (err, record) => {
      if (err) {
        console.error('[Auth/Password] Reset password error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!record) {
        return res.status(400).json({ error: '重置链接无效' });
      }
      if (new Date(record.expires_at) < new Date()) {
        return res.status(400).json({ error: '重置链接已过期，请重新申请' });
      }

      try {
        const password_hash = await bcrypt.hash(password, 12);
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, record.user_id], (err) => {
          if (err) console.error('[Auth/Password] Update password error:', err);
        });
        db.run('DELETE FROM password_resets WHERE id = ?', [record.id], (err) => {
          if (err) console.error('[Auth/Password] Delete reset token error:', err);
        });
        db.run('DELETE FROM user_sessions WHERE user_id = ?', [record.user_id], (err) => {
          if (err) console.error('[Auth/Password] Revoke sessions error:', err);
        });
        res.json({ message: '密码重置成功，请使用新密码登录' });
      } catch (hashErr) {
        console.error('[Auth/Password] Hash error:', hashErr);
        res.status(500).json({ error: '服务器内部错误' });
      }
    });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { old_password, new_password } = req.body;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }
    if (!PASSWORD_REGEX.test(new_password)) {
      return res.status(400).json({ error: '新密码至少 8 位，必须包含大写字母、小写字母、数字和特殊字符' });
    }

    db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], async (err, user) => {
      if (err) {
        console.error('[Auth/Password] Change password error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      try {
        const valid = await bcrypt.compare(old_password, user.password_hash);
        if (!valid) {
          return res.status(401).json({ error: '旧密码不正确' });
        }

        const password_hash = await bcrypt.hash(new_password, 12);
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, req.user.id], (err) => {
          if (err) {
            console.error('[Auth/Password] Change password error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          // 吊销所有其他会话（保留当前会话）
          const rawToken = req.headers.authorization?.slice(7) || '';
          const currentTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
          db.run(
            'DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?',
            [req.user.id, currentTokenHash],
            (err) => {
              if (err) console.error('[Auth/Password] Revoke sessions error:', err);
            }
          );
          res.json({ message: '密码修改成功，其他设备已登出' });
        });
      } catch (hashErr) {
        console.error('[Auth/Password] Hash error:', hashErr);
        res.status(500).json({ error: '服务器内部错误' });
      }
    });
  });
}

module.exports = setup;
