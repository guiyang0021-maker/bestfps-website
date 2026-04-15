/**
 * 用户设置路由
 */
const express = require('express');
const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  db.get(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [req.user.id],
    (err, settings) => {
      if (err) {
        console.error('[Settings] Get error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      if (!settings) {
        db.run('INSERT INTO user_settings (user_id) VALUES (?)', [req.user.id], (err) => {
          if (err) console.error('[Settings] Create settings error:', err);
        });
        return res.json({
          shader_settings: {},
          resource_packs: [],
          dark_mode: 0,
        });
      }

      res.json({
        shader_settings: JSON.parse(settings.shader_settings || '{}'),
        resource_packs: JSON.parse(settings.resource_packs || '[]'),
        dark_mode: settings.dark_mode || 0,
        updated_at: settings.updated_at,
      });
    }
  );
});

router.put('/', (req, res) => {
  const { shader_settings, resource_packs, dark_mode } = req.body;

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
  if (dark_mode !== undefined) {
    updates.push('dark_mode = ?');
    params.push(dark_mode ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.user.id);

  db.run(
    `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`,
    params,
    (err) => {
      if (err) {
        console.error('[Settings] Update error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      db.get(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [req.user.id],
        (err, settings) => {
          if (err) {
            console.error('[Settings] Get after update error:', err);
            return res.status(500).json({ error: '服务器内部错误' });
          }
          res.json({
            message: '配置已更新',
            shader_settings: JSON.parse(settings.shader_settings || '{}'),
            resource_packs: JSON.parse(settings.resource_packs || '[]'),
            dark_mode: settings.dark_mode || 0,
            updated_at: settings.updated_at,
          });
        }
      );
    }
  );
});

router.get('/export', (req, res) => {
  db.get(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [req.user.id],
    (err, settings) => {
      if (err) {
        console.error('[Settings] Export error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      const exportData = {
        version: 1,
        exported_at: new Date().toISOString(),
        user_id: req.user.id,
        shader_settings: settings ? JSON.parse(settings.shader_settings || '{}') : {},
        resource_packs: settings ? JSON.parse(settings.resource_packs || '[]') : [],
        dark_mode: settings ? (settings.dark_mode || 0) : 0,
      };

      logActivity(req.user.id, 'settings_export', '导出了配置', {}, req.ip);

      // Use res.json() first to set Content-Type, then set Content-Disposition via res.set()
      res.set('Content-Disposition', 'attachment; filename="bestfps-config.json"');
      res.json(exportData);
    }
  );
});

router.post('/import', (req, res) => {
  const { data, name } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: '无效的配置数据' });
  }

  if (data.version !== 1) {
    return res.status(400).json({ error: '不支持的配置文件版本' });
  }

  const shader_settings = JSON.stringify(data.shader_settings || {});
  const resource_packs = JSON.stringify(data.resource_packs || []);
  const dark_mode = data.dark_mode ? 1 : 0;

  db.get('SELECT id FROM user_settings WHERE user_id = ?', [req.user.id], (err, existing) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });

    if (existing) {
      db.run(
        "UPDATE user_settings SET shader_settings = ?, resource_packs = ?, dark_mode = ?, updated_at = datetime('now') WHERE user_id = ?",
        [shader_settings, resource_packs, dark_mode, req.user.id],
        (err) => {
          if (err) return res.status(500).json({ error: '服务器内部错误' });
          logActivity(req.user.id, 'settings_import', '导入了配置文件「' + (name || '未知') + '」', {}, req.ip);
          res.json({ message: '配置导入成功' });
        }
      );
    } else {
      db.run(
        'INSERT INTO user_settings (user_id, shader_settings, resource_packs, dark_mode) VALUES (?, ?, ?, ?)',
        [req.user.id, shader_settings, resource_packs, dark_mode],
        (err) => {
          if (err) return res.status(500).json({ error: '服务器内部错误' });
          logActivity(req.user.id, 'settings_import', '导入了配置文件「' + (name || '未知') + '」', {}, req.ip);
          res.json({ message: '配置导入成功' });
        }
      );
    }
  });
});

router.get('/versions', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  db.all(
    'SELECT id, name, created_at FROM config_versions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [req.user.id, limit],
    (err, rows) => {
      if (err) {
        console.error('[Settings] Versions list error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ versions: rows });
    }
  );
});

router.get('/versions/:id', (req, res) => {
  db.get(
    'SELECT * FROM config_versions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, version) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!version) return res.status(404).json({ error: '版本不存在' });

      res.json({
        version: {
          ...version,
          shader_settings: JSON.parse(version.shader_settings || '{}'),
          resource_packs: JSON.parse(version.resource_packs || '[]'),
        },
      });
    }
  );
});

router.post('/versions', (req, res) => {
  const { name } = req.body;
  const snapshotName = name || '手动保存';

  if (snapshotName.length > 50) {
    return res.status(400).json({ error: '快照名称不能超过 50 个字符' });
  }

  db.get('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id], (err, settings) => {
    if (err) return res.status(500).json({ error: '服务器内部错误' });

    db.run(
      'INSERT INTO config_versions (user_id, name, shader_settings, resource_packs) VALUES (?, ?, ?, ?)',
      [
        req.user.id,
        snapshotName,
        settings ? settings.shader_settings : '{}',
        settings ? settings.resource_packs : '[]',
      ],
      function (err) {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        logActivity(req.user.id, 'settings_snapshot', '保存了配置快照「' + snapshotName + '」', { version_id: this.lastID }, req.ip);
        res.status(201).json({
          message: '快照已保存',
          version_id: this.lastID,
          name: snapshotName,
        });
      }
    );
  });
});

router.post('/versions/:id/restore', (req, res) => {
  db.get(
    'SELECT * FROM config_versions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, version) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!version) return res.status(404).json({ error: '版本不存在' });

      db.run(
        "UPDATE user_settings SET shader_settings = ?, resource_packs = ?, updated_at = datetime('now') WHERE user_id = ?",
        [version.shader_settings, version.resource_packs, req.user.id],
        (err) => {
          if (err) return res.status(500).json({ error: '服务器内部错误' });
          logActivity(
            req.user.id,
            'settings_restore',
            '恢复了配置快照「' + version.name + '」',
            { version_id: parseInt(req.params.id), name: version.name },
            req.ip
          );
          res.json({
            message: '已恢复到「' + version.name + '」',
            shader_settings: JSON.parse(version.shader_settings || '{}'),
            resource_packs: JSON.parse(version.resource_packs || '[]'),
          });
        }
      );
    }
  );
});

router.delete('/versions/:id', (req, res) => {
  db.get(
    'SELECT * FROM config_versions WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    (err, version) => {
      if (err) return res.status(500).json({ error: '服务器内部错误' });
      if (!version) return res.status(404).json({ error: '版本不存在' });

      db.run('DELETE FROM config_versions WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: '服务器内部错误' });
        logActivity(req.user.id, 'settings_snapshot_delete', '删除了配置快照「' + version.name + '」', { version_id: parseInt(req.params.id) }, req.ip);
        res.json({ message: '快照已删除' });
      });
    }
  );
});

module.exports = router;
