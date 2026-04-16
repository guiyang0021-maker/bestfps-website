/**
 * 配置分享路由
 */
const express = require('express');
const crypto = require('crypto');
const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { cache, invalidate } = require('../middleware/cache');

const router = express.Router();
const SHARE_CACHE_TTL = 1800;
const getShareCacheKey = (token) => `/api/share/${token}`;

function listShares(req, res) {
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
}

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

router.get('/my-links', requireAuth, listShares);

router.get('/', requireAuth, listShares);

router.get('/:token', (req, res) => {
  const cacheKey = getShareCacheKey(req.params.token);
  const cachedShare = cache.get(cacheKey);

  const respondWithShare = (sharePayload) => {
    db.run('UPDATE config_shares SET view_count = view_count + 1 WHERE token = ?', [req.params.token], (err) => {
      if (err) {
        console.error('[Share] View count update error:', err);
      }
    });

    const nextPayload = {
      ...sharePayload,
      view_count: (sharePayload.view_count || 0) + 1,
    };

    cache.set(cacheKey, nextPayload, SHARE_CACHE_TTL);
    res.json(nextPayload);
  };

  if (cachedShare) {
    if (cachedShare.expires_at && new Date(cachedShare.expires_at) < new Date()) {
      cache.del(cacheKey);
      return res.status(410).json({ error: '分享链接已过期' });
    }

    return respondWithShare(cachedShare);
  }

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

      return respondWithShare({
        name: share.name,
        description: share.description,
        shader_settings: JSON.parse(share.shader_settings || '{}'),
        resource_packs: JSON.parse(share.resource_packs || '[]'),
        view_count: share.view_count,
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

module.exports = router;
