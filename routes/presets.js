/**
 * 配置预设路由
 */
const express = require('express');
const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validate, rules } = require('../middleware/validator');
const { cached, invalidate } = require('../middleware/cache');

const router = express.Router();

router.use(requireAuth);

router.get('/', cached(600), (req, res) => {
  db.all(
    'SELECT * FROM config_presets WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC',
    [req.user.id],
    (err, presets) => {
      if (err) {
        console.error('[Presets] List error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({
        presets: presets.map(p => ({
          ...p,
          shader_settings: JSON.parse(p.shader_settings || '{}'),
          resource_packs: JSON.parse(p.resource_packs || '[]'),
          is_default: p.is_default === 1,
        })),
      });
    }
  );
});

router.post('/', validate([rules.presetName]), (req, res) => {
  const { name, description, shader_settings, resource_packs } = req.body;

  if (description && description.length > 500) {
    return res.status(400).json({ error: '预设描述不能超过 500 个字符' });
  }

  db.run(
    'INSERT INTO config_presets (user_id, name, description, shader_settings, resource_packs) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, name.trim(), description || '', JSON.stringify(shader_settings || {}), JSON.stringify(resource_packs || [])],
    function (err) {
      if (err) {
        console.error('[Presets] Create error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      const presetId = this.lastID;
      // 清除该用户的预设列表缓存
      invalidate(`/api/presets:uid-${req.user.id}`);
      logActivity(req.user.id, 'preset_create', '创建了预设「' + name.trim() + '」', { preset_id: presetId, name: name.trim() }, req.ip);
      res.status(201).json({
        message: '预设创建成功',
        preset: {
          id: presetId,
          name: name.trim(),
          description: description || '',
          shader_settings: shader_settings || {},
          resource_packs: resource_packs || [],
          is_default: false,
        },
      });
    }
  );
});

router.get('/:id', cached(1800), (req, res) => {
  db.get(
    'SELECT * FROM config_presets WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, preset) => {
      if (err) {
        console.error('[Presets] Get error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!preset) {
        return res.status(404).json({ error: '预设不存在' });
      }
      res.json({
        preset: {
          ...preset,
          shader_settings: JSON.parse(preset.shader_settings || '{}'),
          resource_packs: JSON.parse(preset.resource_packs || '[]'),
          is_default: preset.is_default === 1,
        },
      });
    }
  );
});

router.put('/:id', (req, res) => {
  const { name, description, shader_settings, resource_packs } = req.body;

  db.get('SELECT * FROM config_presets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, preset) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    if (!preset) return res.status(404).json({ error: '预设不存在' });

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (shader_settings !== undefined) { updates.push('shader_settings = ?'); params.push(JSON.stringify(shader_settings)); }
    if (resource_packs !== undefined) { updates.push('resource_packs = ?'); params.push(JSON.stringify(resource_packs)); }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id, req.user.id);

    db.run(
      `UPDATE config_presets SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params,
      (err) => {
        if (err) {
          console.error('[Presets] Update error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        // 清除缓存
        invalidate(`/api/presets:uid-${req.user.id}`);
        invalidate(`/api/presets/${req.params.id}:uid-${req.user.id}`);
        logActivity(req.user.id, 'preset_update', '更新了预设「' + (preset ? preset.name : req.params.id) + '」', { preset_id: parseInt(req.params.id), name: preset ? preset.name : req.params.id }, req.ip);
        res.json({ message: '预设已更新' });
      }
    );
  });
});

router.delete('/:id', (req, res) => {
  db.get('SELECT * FROM config_presets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, preset) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    if (!preset) return res.status(404).json({ error: '预设不存在' });

    db.run('DELETE FROM config_presets WHERE id = ?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      invalidate(`/api/presets:uid-${req.user.id}`);
      invalidate(`/api/presets/${req.params.id}:uid-${req.user.id}`);
      logActivity(req.user.id, 'preset_delete', '删除了预设「' + (preset ? preset.name : req.params.id) + '」', { preset_id: parseInt(req.params.id), name: preset ? preset.name : req.params.id }, req.ip);
      res.json({ message: '预设已删除' });
    });
  });
});

router.post('/:id/apply', (req, res) => {
  db.get('SELECT * FROM config_presets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, preset) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    if (!preset) return res.status(404).json({ error: '预设不存在' });

    db.run(
      `INSERT INTO user_settings (user_id, shader_settings, resource_packs, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         shader_settings = excluded.shader_settings,
         resource_packs = excluded.resource_packs,
         updated_at = datetime('now')`,
      [req.user.id, preset.shader_settings, preset.resource_packs],
      (err) => {
        if (err) {
          console.error('[Presets] Apply error:', err);
          return res.status(500).json({ error: '服务器内部错误' });
        }
        logActivity(req.user.id, 'preset_apply', '应用了预设「' + (preset ? preset.name : req.params.id) + '」到当前配置', { preset_id: parseInt(req.params.id), name: preset ? preset.name : req.params.id }, req.ip);
        res.json({ message: '预设已应用到当前配置' });
      }
    );
  });
});

router.put('/:id/default', (req, res) => {
  db.get('SELECT * FROM config_presets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, preset) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });
    if (!preset) return res.status(404).json({ error: '预设不存在' });

    db.run('UPDATE config_presets SET is_default = 0 WHERE user_id = ?', [req.user.id], (err) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      db.run('UPDATE config_presets SET is_default = 1 WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        invalidate(`/api/presets:uid-${req.user.id}`);
        invalidate(`/api/presets/${req.params.id}:uid-${req.user.id}`);
        logActivity(req.user.id, 'preset_default', '将「' + (preset ? preset.name : req.params.id) + '」设为默认预设', { preset_id: parseInt(req.params.id) }, req.ip);
        res.json({ message: '已设为默认预设' });
      });
    });
  });
});

module.exports = router;
