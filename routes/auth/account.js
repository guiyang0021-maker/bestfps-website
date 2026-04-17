/**
 * 认证路由 - 账号模块（注册、登录、当前用户、头像）
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, insertSettingForUser } = require('../../db');
const { generateToken, JWT_COOKIE_NAME, tokenCookieOptions } = require('../../middleware/auth');
const { sendVerificationEmail } = require('../../email/sender');
const { loginLimiter, registerLimiter } = require('../../middleware/rateLimiter');
const { avatarUpload, parseUserAgent, PASSWORD_REGEX, getClientIp } = require('./utils');

function setup(router) {
  router.post('/register', registerLimiter, async (req, res) => {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
      }
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: '用户名长度为 3-20 个字符' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: '邮箱格式不正确' });
      }
      if (!PASSWORD_REGEX.test(password)) {
        return res.status(400).json({ error: '密码至少 8 位，必须包含大写字母、小写字母、数字和特殊字符' });
      }

      db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, existing) => {
        if (err) {
          console.error('[Auth/Account] Register error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        if (existing) {
          return res.status(409).json({ error: '用户名或邮箱已被注册' });
        }

        try {
          const password_hash = await bcrypt.hash(password, 12);

          db.run(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, password_hash],
            function (err) {
              if (err) {
                console.error('[Auth/Account] Register error:', err);
                return res.status(500).json({ error: '服务器内部错误' });
              }
              const userId = this.lastID;

              insertSettingForUser.run(userId);

              const token = crypto.randomBytes(32).toString('hex');
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              db.run(
                'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
                [userId, token, expiresAt],
                async (err) => {
                  if (err) console.error('[Auth/Account] Insert token error:', err);
                  else {
                    try {
                      await sendVerificationEmail(email, token);
                    } catch (e) {
                      console.error('[Auth/Account] Send email error:', e);
                    }
                  }
                }
              );

              res.status(201).json({
                message: '注册成功！请查收验证邮件',
                userId,
              });
            }
          );
        } catch (hashErr) {
          console.error('[Auth/Account] Hash error:', hashErr);
          res.status(500).json({ error: '服务器内部错误' });
        }
      });
    } catch (err) {
      console.error('[Auth/Account] Register error:', err);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: '邮箱和密码不能为空' });
      }

      db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
          console.error('[Auth/Account] Login error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }

        const { browser, os, device_type } = parseUserAgent(req.headers['user-agent']);
        const clientIp = getClientIp(req);
        const ua = req.headers['user-agent'];

        if (!user) {
          db.run(
            'INSERT INTO login_history (ip, user_agent, device_type, browser, os, success) VALUES (?, ?, ?, ?, ?, 0)',
            [clientIp, ua, device_type, browser, os]
          );
          return res.status(401).json({ error: '邮箱或密码错误' });
        }

        if (user.status === 'suspended') {
          return res.status(403).json({ error: '账号已被封禁，如有疑问请联系管理员' });
        }
        if (user.status === 'banned') {
          return res.status(403).json({ error: '账号已被永久封禁' });
        }

        try {
          const valid = await bcrypt.compare(password, user.password_hash);

          if (!valid) {
            db.run(
              'INSERT INTO login_history (user_id, ip, user_agent, device_type, browser, os, success) VALUES (?, ?, ?, ?, ?, ?, 0)',
              [user.id, clientIp, ua, device_type, browser, os]
            );
            return res.status(401).json({ error: '邮箱或密码错误' });
          }

          db.run(
            'INSERT INTO login_history (user_id, ip, user_agent, device_type, browser, os, success) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [user.id, clientIp, ua, device_type, browser, os]
          );

          const jti = crypto.randomUUID();
          const sessionToken = generateToken(user, jti);
          const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          db.run(
            'INSERT INTO user_sessions (user_id, jti, token_hash, expires_at, ip, user_agent, device_type, browser, os) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [user.id, jti, tokenHash, expiresAt, clientIp, ua, device_type, browser, os]
          );

          // CSRF double-submit token (set cookie for client to read)
          const csrfToken = crypto.randomBytes(32).toString('hex');
          res.cookie('csrf_token', csrfToken, {
            httpOnly: false,  // frontend JS needs to read
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            secure: process.env.NODE_ENV === 'production',
          });

          // 设置 httpOnly Cookie（同时保留 JSON 返回 token 供旧客户端兼容）
          res.cookie(JWT_COOKIE_NAME, sessionToken, tokenCookieOptions());

          res.json({
            message: '登录成功',
            token: sessionToken,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              avatar: user.avatar,
              verified: user.verified === 1,
              role: user.role || 'user',
            },
          });
        } catch (compareErr) {
          console.error('[Auth/Account] Compare error:', compareErr);
          res.status(500).json({ error: '服务器内部错误' });
        }
      });
    } catch (err) {
      console.error('[Auth/Account] Login error:', err);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  router.get('/me', require('../../middleware/auth').requireAuth, (req, res) => {
    db.get(
      'SELECT id, username, display_name, email, avatar, verified, role, status, bio, website, social_discord, social_twitter, social_github, created_at FROM users WHERE id = ?',
      [req.user.id],
      (err, user) => {
        if (err) {
          console.error('[Auth/Account] Me error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        if (!user) {
          return res.status(404).json({ error: '用户不存在' });
        }
        res.json({ user: { ...user, verified: user.verified === 1 } });
      }
    );
  });

  router.post('/logout', require('../../middleware/auth').requireAuth, (req, res) => {
    // 删除当前会话
    if (req.user && req.user.jti) {
      db.run('DELETE FROM user_sessions WHERE jti = ?', [req.user.jti], (err) => {
        if (err) console.error('[Auth/Account] Logout session delete error:', err);
      });
    }
    // 清除 httpOnly Cookie
    res.clearCookie(JWT_COOKIE_NAME, { path: '/' });
    res.json({ message: '已退出登录' });
  });
  router.post('/avatar', require('../../middleware/auth').requireAuth, (req, res) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: '请选择一张图片' });
      }

      const avatarPath = `/uploads/${req.file.filename}`;

      db.get('SELECT avatar FROM users WHERE id = ?', [req.user.id], (err, old) => {
        if (err) console.error('[Auth/Account] Get old avatar error:', err);

        if (old && old.avatar) {
          try {
            const oldPath = path.join(__dirname, '../../public', old.avatar);
            fs.unlinkSync(oldPath);
          } catch (_) {}
        }

        db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.user.id], (err) => {
          if (err) {
            console.error('[Auth/Account] Update avatar error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          res.json({ message: '头像上传成功', avatar_url: avatarPath, avatar: avatarPath });
        });
      });
    });
  });
}

module.exports = setup;
