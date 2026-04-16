/**
 * 认证路由 - 个人资料模块
 */
const { db } = require('../../db');
const { requireAuth } = require('../../middleware/auth');

function loadProfile(userId, callback) {
  db.get(
    `SELECT id, username, display_name, email, avatar, verified, bio, website,
            social_discord, social_twitter, social_github, created_at
     FROM users
     WHERE id = ?`,
    [userId],
    callback
  );
}

function setup(router) {
  router.get('/profile', requireAuth, (req, res) => {
    loadProfile(req.user.id, (err, user) => {
      if (err) {
        console.error('[Auth/Profile] Get profile error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!user) return res.status(404).json({ error: '用户不存在' });

      db.get('SELECT COUNT(*) as count FROM downloads WHERE user_id = ?', [user.id], (dlErr, dl) => {
        if (dlErr) {
          console.error('[Auth/Profile] Get download stats error:', dlErr);
          return res.status(500).json({ error: '服务器内部错误' });
        }

        db.get('SELECT COUNT(*) as count FROM config_presets WHERE user_id = ?', [user.id], (presetErr, presets) => {
          if (presetErr) {
            console.error('[Auth/Profile] Get preset stats error:', presetErr);
            return res.status(500).json({ error: '服务器内部错误' });
          }

          res.json({
            user: { ...user, verified: user.verified === 1 },
            stats: {
              downloads: dl ? dl.count : 0,
              presets: presets ? presets.count : 0,
              member_since: user.created_at,
            },
          });
        });
      });
    });
  });

  router.put('/profile', requireAuth, (req, res) => {
    const {
      username,
      display_name,
      bio,
      website,
      social_discord,
      social_twitter,
      social_github,
    } = req.body || {};

    const updates = [];
    const params = [];
    const nextUsername = username === undefined ? undefined : String(username).trim();
    const nextDisplayName = display_name === undefined ? undefined : String(display_name).trim();

    if (nextUsername !== undefined && (nextUsername.length < 3 || nextUsername.length > 20)) {
      return res.status(400).json({ error: '用户名长度为 3-20 个字符' });
    }
    if (nextDisplayName !== undefined && nextDisplayName.length > 50) {
      return res.status(400).json({ error: '显示名称不能超过 50 个字符' });
    }

    if (nextUsername !== undefined) {
      updates.push('username = ?');
      params.push(nextUsername);
    }
    if (nextDisplayName !== undefined) {
      updates.push('display_name = ?');
      params.push(nextDisplayName);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      params.push(String(bio).substring(0, 500));
    }
    if (website !== undefined) {
      updates.push('website = ?');
      params.push(String(website).substring(0, 200));
    }
    if (social_discord !== undefined) {
      updates.push('social_discord = ?');
      params.push(String(social_discord).substring(0, 100));
    }
    if (social_twitter !== undefined) {
      updates.push('social_twitter = ?');
      params.push(String(social_twitter).substring(0, 100));
    }
    if (social_github !== undefined) {
      updates.push('social_github = ?');
      params.push(String(social_github).substring(0, 100));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    const commitUpdate = () => {
      db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        [...params, req.user.id],
        (err) => {
          if (err) {
            console.error('[Auth/Profile] Update profile error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }

          loadProfile(req.user.id, (profileErr, user) => {
            if (profileErr) {
              console.error('[Auth/Profile] Reload profile error:', profileErr);
              return res.status(500).json({ error: '服务器内部错误' });
            }
            res.json({ message: '个人资料已更新', user: { ...user, verified: user.verified === 1 } });
          });
        }
      );
    };

    if (nextUsername !== undefined) {
      db.get('SELECT id FROM users WHERE username = ? AND id != ?', [nextUsername, req.user.id], (err, existing) => {
        if (err) {
          console.error('[Auth/Profile] Username check error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        if (existing) {
          return res.status(409).json({ error: '用户名已被占用' });
        }
        commitUpdate();
      });
      return;
    }

    commitUpdate();
  });
}

module.exports = setup;
