/**
 * 配置分享路由
 */
const express = require('express');
const crypto = require('crypto');
const { db, logActivity } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { cached, invalidate } = require('../middleware/cache');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
  const { name, description, shader_settings, resource_packs } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ error: '分享名称不能为空' });
  }

  const token = crypto.randomBytes(16).toString('base64url');
  const expiresAt = req.body.expires_at || null;

  db.run(
    'INSERT INTO config_shares (user_id, token, name, description, shader_settings, resource_packs, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, token, name.trim(), description || '', JSON.stringify(shader_settings || {}), JSON.stringify(resource_packs || []), expiresAt],
    function (err) {
      if (err) {
        console.error('[Share] Create error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      const shareUrl = `/share/${token}`;
      const newToken = token;
      logActivity(req.user.id, 'share_create', '创建了分享「' + name.trim() + '」', { token: newToken, name: name.trim() }, req.ip);
      res.status(201).json({
        message: '分享链接已生成',
        token: newToken,
        url: shareUrl,
        full_url: `${req.protocol}://${req.get('host')}${shareUrl}`,
      });
    }
  );
});

router.get('/:token', cached(1800), (req, res) => {
  db.get(
    'SELECT * FROM config_shares WHERE token = ?',
    [req.params.token],
    (err, share) => {
      if (err) {
        console.error('[Share] Get error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!share) {
        return res.status(404).json({ error: '分享不存在或已失效' });
      }
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).json({ error: '分享链接已过期' });
      }

      // 增加访问计数
      db.run('UPDATE config_shares SET view_count = view_count + 1 WHERE id = ?', [share.id]);

      res.json({
        name: share.name,
        description: share.description,
        shader_settings: JSON.parse(share.shader_settings || '{}'),
        resource_packs: JSON.parse(share.resource_packs || '[]'),
        view_count: share.view_count + 1,
        created_at: share.created_at,
        expires_at: share.expires_at,
      });
    }
  );
});

router.delete('/:token', requireAuth, (req, res) => {
  db.get(
    'SELECT * FROM config_shares WHERE token = ? AND user_id = ?',
    [req.params.token, req.user.id],
    (err, share) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!share) return res.status(404).json({ error: '分享不存在' });

      const deletedShareId = share.id;
      db.run('DELETE FROM config_shares WHERE id = ?', [share.id], (err) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        logActivity(req.user.id, 'share_delete', '删除了分享 #' + deletedShareId, { share_id: parseInt(deletedShareId) }, req.ip);
        res.json({ message: '分享链接已删除' });
        invalidate('/api/share/' + req.params.token);
      });
    }
  );
});

router.get('/', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM config_shares WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, shares) => {
      if (err) {
        console.error('[Share] List error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({
        shares: shares.map(s => ({
          ...s,
          is_expired: s.expires_at && new Date(s.expires_at) < new Date(),
        })),
      });
    }
  );
});

module.exports = router;
