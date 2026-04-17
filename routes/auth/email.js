/**
 * 认证路由 - 邮箱模块（验证、重发、修改邮箱）
 */
const crypto = require('crypto');
const { db } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { sendVerificationEmail, sendEmailChangeVerification, sendEmailChangeNotification } = require('../../email/sender');
const { changeEmailLimiter } = require('../../middleware/rateLimiter');

// 邮箱验证成功页面（复用）
const EMAIL_VERIFY_SUCCESS_HTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>邮箱验证成功</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f5f5f7; }
    .box { background: #fff; padding: 48px; border-radius: 18px;
           text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h2 { color: #1d1d1f; margin-bottom: 12px; }
    p  { color: #6e6e73; margin-bottom: 24px; }
    a  { display: inline-block; background: #0071e3; color: #fff;
         padding: 12px 28px; border-radius: 980px; text-decoration: none;
         font-weight: 500; }
  </style>
</head>
<body>
  <div class="box">
    <h2>邮箱验证成功！</h2>
    <p>你的账号已激活，可以正常使用 bestfps 了。</p>
    <a href="/login">前往登录</a>
  </div>
</body>
</html>
`;

// 邮箱修改成功页面
const EMAIL_CHANGE_SUCCESS_HTML = (newEmail) => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>邮箱修改成功</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f5f5f7; }
    .box { background: #fff; padding: 48px; border-radius: 18px;
           text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h2 { color: #1d1d1f; margin-bottom: 12px; }
    p  { color: #6e6e73; margin-bottom: 24px; }
    a  { display: inline-block; background: #0071e3; color: #fff;
         padding: 12px 28px; border-radius: 980px; text-decoration: none;
         font-weight: 500; }
  </style>
</head>
<body>
  <div class="box">
    <h2>邮箱修改成功！</h2>
    <p>你的账号邮箱已更新为 ${newEmail}</p>
    <a href="/dashboard">前往仪表盘</a>
  </div>
</body>
</html>
`;

function setup(router) {
  router.get('/verify', (req, res) => {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h2>验证链接无效</h2><p>token 缺失</p>');
    }

    db.get('SELECT * FROM email_verifications WHERE token = ?', [token], (err, record) => {
      if (err) {
        console.error('[Auth/Email] Verify error:', err);
        return res.status(500).send('<h2>服务器错误</h2>');
      }
      if (!record) {
        return res.status(400).send('<h2>验证链接无效</h2><p>token 不存在</p>');
      }
      if (new Date(record.expires_at) < new Date()) {
        return res.status(400).send('<h2>验证链接已过期</h2><p>请重新注册或申请验证邮件</p>');
      }

      db.run('UPDATE users SET verified = 1 WHERE id = ?', [record.user_id], (err) => {
        if (err) console.error('[Auth/Email] Update verified error:', err);
      });
      db.run('DELETE FROM email_verifications WHERE id = ?', [record.id], (err) => {
        if (err) console.error('[Auth/Email] Delete token error:', err);
      });

      res.send(EMAIL_VERIFY_SUCCESS_HTML);
    });
  });

  router.post('/send-verify-email', requireAuth, (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.user.id], async (err, user) => {
      if (err) {
        console.error('[Auth/Email] Send verify email error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!user) return res.status(404).json({ error: '用户不存在' });

      if (user.verified === 1) {
        return res.json({ message: '账号已验证，无需重复验证' });
      }

      db._prepare('DELETE FROM email_verifications WHERE user_id = ?').run(user.id);

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.run(
        'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expiresAt],
        async (err) => {
          if (err) {
            console.error('[Auth/Email] Send verify email error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          try {
            await sendVerificationEmail(user.email, token);
            res.json({ message: '验证邮件已发送，请查收' });
          } catch (emailErr) {
            console.error('[Auth/Email] Send email error:', emailErr);
            res.status(500).json({ error: '服务器内部错误' });
          }
        }
      );
    });
  });

  router.post('/change-email', changeEmailLimiter, requireAuth, async (req, res) => {
    const { new_email, password } = req.body;

    if (!new_email || !password) {
      return res.status(400).json({ error: '新邮箱和密码不能为空' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [req.user.id], async (err, user) => {
      if (err) {
        console.error('[Auth/Email] Change email error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      if (new_email.toLowerCase() === user.email.toLowerCase()) {
        return res.status(400).json({ error: '新邮箱不能与当前邮箱相同' });
      }

      db.get('SELECT id FROM users WHERE email = ?', [new_email], (err, existing) => {
        if (existing) {
          return res.status(409).json({ error: '该邮箱已被其他账号使用' });
        }

        const bcrypt = require('bcryptjs');
        bcrypt.compare(password, user.password_hash, async (err, valid) => {
          if (err || !valid) {
            return res.status(401).json({ error: '密码不正确' });
          }

          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

          db.run(
            'INSERT INTO email_change_requests (user_id, new_email, old_email, token, expires_at) VALUES (?, ?, ?, ?, ?)',
            [user.id, new_email, user.email, token, expiresAt],
            async (err) => {
              if (err) {
                console.error('[Auth/Email] Change email error:', err);
                return res.status(500).json({ error: '服务器内部错误' });
              }

              const confirmUrl = `${req.protocol}://${req.get('host')}/change-email?token=${encodeURIComponent(token)}`;
              try {
                await sendEmailChangeVerification(new_email, confirmUrl, user.username);
              } catch (e) {
                console.error('[Auth/Email] Send email error:', e);
              }

              res.json({ message: '验证链接已发送到新邮箱，请查收' });
            }
          );
        });
      });
    });
  });

  function confirmEmailChange(token, callback) {
    if (!token) {
      return callback({ status: 400, error: '确认链接无效' });
    }

    db.get('SELECT * FROM email_change_requests WHERE token = ?', [token], (err, record) => {
      if (err) {
        console.error('[Auth/Email] Confirm email change error:', err);
        return callback({ status: 500, error: '服务器错误' });
      }
      if (!record) {
        return callback({ status: 400, error: '确认链接无效' });
      }
      if (new Date(record.expires_at) < new Date()) {
        return callback({ status: 400, error: '确认链接已过期' });
      }

      db.get('SELECT id FROM users WHERE email = ? AND id != ?', [record.new_email, record.user_id], (checkErr, existing) => {
        if (checkErr) {
          console.error('[Auth/Email] Confirm email duplicate check error:', checkErr);
          return callback({ status: 500, error: '服务器错误' });
        }
        if (existing) {
          return callback({ status: 409, error: '该邮箱已被其他账号使用' });
        }

        db.run('UPDATE users SET email = ? WHERE id = ?', [record.new_email, record.user_id], (updateErr) => {
          if (updateErr) {
            console.error('[Auth/Email] Update email error:', updateErr);
            return callback({ status: 500, error: '服务器错误' });
          }

          db.run('DELETE FROM email_change_requests WHERE id = ?', [record.id], (deleteErr) => {
            if (deleteErr) {
              console.error('[Auth/Email] Delete change request error:', deleteErr);
              return callback({ status: 500, error: '服务器错误' });
            }

            try {
              sendEmailChangeNotification(record.old_email, record.new_email);
            } catch (e) {
              console.error('[Auth/Email] Send notification error:', e);
            }

            return callback(null, { new_email: record.new_email });
          });
        });
      });
    });
  }

  router.get('/confirm-email-change', (req, res) => {
    const { token } = req.query;
    confirmEmailChange(token, (resultErr, result) => {
      if (resultErr) {
        if (resultErr.error.includes('过期')) {
          return res.status(resultErr.status).send('<h2>确认链接已过期</h2><p>请重新申请邮箱修改</p>');
        }
        if (resultErr.status === 409) {
          return res.status(resultErr.status).send('<h2>邮箱修改失败</h2><p>该邮箱已被其他账号使用</p>');
        }
        return res.status(resultErr.status).send('<h2>确认链接无效</h2><p>' + resultErr.error + '</p>');
      }

      res.send(EMAIL_CHANGE_SUCCESS_HTML(result.new_email));
    });
  });

  router.post('/confirm-email-change', (req, res) => {
    const token = req.query.token || req.body?.token;
    confirmEmailChange(token, (err, result) => {
      if (err) {
        return res.status(err.status || 500).json({ error: err.error || '服务器错误' });
      }
      res.json({ message: '邮箱修改成功', new_email: result.new_email });
    });
  });
}

module.exports = setup;
