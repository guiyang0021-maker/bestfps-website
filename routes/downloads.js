/**
 * 下载记录路由
 */
const express = require('express');
const { db, logActivity } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  db.all(
    'SELECT * FROM downloads WHERE user_id = ? ORDER BY downloaded_at DESC LIMIT 50',
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error('[Downloads] Get error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      res.json({ downloads: rows });
    }
  );
});

router.post('/', optionalAuth, (req, res) => {
  const { version, os } = req.body;

  if (!version || !os) {
    return res.status(400).json({ error: 'version 和 os 不能为空' });
  }

  const allowedOS = ['windows', 'macos', 'linux'];
  if (!allowedOS.includes(os.toLowerCase())) {
    return res.status(400).json({ error: 'os 必须是 windows / macos / linux' });
  }

  const userId = req.user ? req.user.id : null;

  db.run(
    'INSERT INTO downloads (user_id, version, os) VALUES (?, ?, ?)',
    [userId, version, os.toLowerCase()],
    function (err) {
      if (err) {
        console.error('[Downloads] Post error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      const dlId = this.lastID;
      if (req.user) {
        logActivity(req.user.id, 'download', '下载了 bestfps v' + version + ' (' + os.toLowerCase() + ')', { version, os: os.toLowerCase() }, req.ip);
      }
      res.status(201).json({
        message: '下载记录已保存',
        id: dlId,
      });
    }
  );
});

module.exports = router;
