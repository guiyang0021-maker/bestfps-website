/**
 * Minecraft 客户端数据同步路由
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/push', (req, res) => {
  const { shader_settings, resource_packs } = req.body;
  const userId = req.user.id;

  db.get(
    'SELECT id FROM user_settings WHERE user_id = ?',
    [userId],
    (err, existing) => {
      if (err) {
        console.error('[Sync] Push error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      const updates = [];
      const params = [];

      if (shader_settings !== undefined) {
        updates.push('shader_settings = ?');
        params.push(JSON.stringify(shader_settings));
      }
      if (resource_packs !== undefined) {
        updates.push('resource_packs = ?');
        params.push(JSON.stringify(resource_packs));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: '没有配置数据' });
      }

      updates.push("updated_at = datetime('now')");

      if (existing) {
        params.push(userId);
        db.run(
          `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`,
          params,
          (err) => {
            if (err) {
              console.error('[Sync] Push error:', err);
              return res.status(500).json({ error: '服务器内部错误' });
            }
            res.json({ message: '配置已同步到服务器', pushed_at: new Date().toISOString() });
          }
        );
      } else {
        db.run(
          'INSERT INTO user_settings (user_id, shader_settings, resource_packs) VALUES (?, ?, ?)',
          [
            userId,
            JSON.stringify(shader_settings || {}),
            JSON.stringify(resource_packs || []),
          ],
          (err) => {
            if (err) {
              console.error('[Sync] Push error:', err);
              return res.status(500).json({ error: '服务器内部错误' });
            }
            res.json({ message: '配置已同步到服务器', pushed_at: new Date().toISOString() });
          }
        );
      }
    }
  );
});

router.get('/pull', (req, res) => {
  db.get(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [req.user.id],
    (err, settings) => {
      if (err) {
        console.error('[Sync] Pull error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      if (!settings) {
        return res.json({
          shader_settings: {},
          resource_packs: [],
          synced: false,
        });
      }

      res.json({
        shader_settings: JSON.parse(settings.shader_settings || '{}'),
        resource_packs: JSON.parse(settings.resource_packs || '[]'),
        updated_at: settings.updated_at,
        synced: true,
      });
    }
  );
});

module.exports = router;
