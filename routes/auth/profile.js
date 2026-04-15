/**
 * 认证路由 - 个人资料模块
 */
const { db } = require('../../db');
const { requireAuth } = require('../../middleware/auth');

function setup(router) {
  router.get('/profile', requireAuth, (req, res) => {
    db.get(
      'SELECT id, username, email, avatar, verified, bio, website, social_discord, social_twitter, social_github, created_at FROM users WHERE id = ?',
      [req.user.id],
      (err, user) => {
        if (err) {
          console.error('[Auth/Profile] Get profile error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        if (!user) return res.status(404).json({ error: '用户不存在' });

        db.get('SELECT COUNT(*) as count FROM downloads WHERE user_id = ?', [user.id], (err, dl) => {
          db.get('SELECT COUNT(*) as count FROM config_presets WHERE user_id = ?', [user.id], (err, presets) => {
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
      }
    );
  });

  router.put('/profile', requireAuth, (req, res) => {
    const { bio, website, social_discord, social_twitter, social_github } = req.body;

    const updates = [];
    const params = [];

    if (bio !== undefined) { updates.push('bio = ?'); params.push(bio.substring(0, 500)); }
    if (website !== undefined) { updates.push('website = ?'); params.push(website.substring(0, 200)); }
    if (social_discord !== undefined) { updates.push('social_discord = ?'); params.push(social_discord.substring(0, 100)); }
    if (social_twitter !== undefined) { updates.push('social_twitter = ?'); params.push(social_twitter.substring(0, 100)); }
    if (social_github !== undefined) { updates.push('social_github = ?'); params.push(social_github.substring(0, 100)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    params.push(req.user.id);
    db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params,
      (err) => {
        if (err) {
          console.error('[Auth/Profile] Update profile error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        db.get(
          'SELECT id, username, email, avatar, verified, bio, website, social_discord, social_twitter, social_github, created_at FROM users WHERE id = ?',
          [req.user.id],
          (err, user) => {
            if (err) return res.status(500).json({ error: '服务器内部错误' });
            res.json({ message: '个人资料已更新', user: { ...user, verified: user.verified === 1 } });
          }
        );
      }
    );
  });
}

module.exports = setup;
