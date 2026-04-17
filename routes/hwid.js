const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

const { db, logActivity } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getClientIp } = require('./auth/utils');

const router = express.Router();

const AGENT_EXE_PATH = path.join(__dirname, '../tools/hwid-agent/dist/windows/bestfps-hwid.exe');
const AGENT_SCRIPT_PATH = path.join(__dirname, '../tools/hwid-agent/bestfps-hwid.ps1');
const TOKEN_TTL_MINUTES = 30;
const HWID_HASH_REGEX = /^[a-f0-9]{64}$/i;

function getAgentInfo() {
  if (fs.existsSync(AGENT_EXE_PATH)) {
    return {
      format: 'exe',
      filename: 'bestfps-hwid.exe',
      absolutePath: AGENT_EXE_PATH,
      downloadUrl: '/api/hwid/agent/windows',
      ready: true,
    };
  }

  return {
    format: 'powershell',
    filename: 'bestfps-hwid.ps1',
    absolutePath: AGENT_SCRIPT_PATH,
    downloadUrl: '/api/hwid/agent/windows',
    ready: fs.existsSync(AGENT_SCRIPT_PATH),
  };
}

function normalizeIp(value) {
  if (!value) return '';
  return String(value)
    .replace(/^::ffff:/i, '')
    .replace(/^::1$/i, '127.0.0.1');
}

function createBindToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getTokenExpiryDate() {
  return new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
}

function getHwidPreview(hash) {
  if (!hash) return '';
  return String(hash).slice(0, 12).toUpperCase();
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapBinding(row) {
  return {
    id: row.id,
    hwid_preview: row.hwid_preview,
    device_name: row.device_name,
    os_name: row.os_name,
    agent_version: row.agent_version,
    status: row.status,
    bind_source: row.bind_source,
    last_ip: normalizeIp(row.last_ip),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
  };
}

router.get('/agent/windows', (req, res) => {
  const agent = getAgentInfo();
  if (!agent.ready) {
    return res.status(503).json({ error: '服务器暂未提供 HWID 工具下载' });
  }
  return res.download(agent.absolutePath, agent.filename);
});

router.get('/status', requireAuth, (req, res) => {
  const agent = getAgentInfo();
  db.all(
    `SELECT id, hwid_preview, device_name, os_name, agent_version, status, bind_source, last_ip, created_at, updated_at, last_seen_at, revoked_at
     FROM hwid_bindings
     WHERE user_id = ?
     ORDER BY
       CASE WHEN status = 'active' THEN 0 ELSE 1 END,
       created_at DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error('[HWID] Status error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      res.json({
        agent_format: agent.format,
        agent_filename: agent.filename,
        agent_download_url: agent.downloadUrl,
        agent_ready: agent.ready,
        bindings: (rows || []).map(mapBinding),
      });
    }
  );
});

router.post('/prepare', requireAuth, (req, res) => {
  const agent = getAgentInfo();
  if (!agent.ready) {
    return res.status(503).json({ error: '服务器暂未提供 HWID 工具下载，请稍后再试' });
  }
  const token = createBindToken();
  const clientIp = normalizeIp(getClientIp(req));
  const expiresAt = getTokenExpiryDate().toISOString();
  const bindUrl = `${req.protocol}://${req.get('host')}/api/hwid/bind`;

  db.run(
    `DELETE FROM hwid_bind_tokens
     WHERE user_id = ?
       AND (used_at IS NOT NULL OR datetime(expires_at) <= datetime('now'))`,
    [req.user.id],
    () => {}
  );

  db.run(
    `INSERT INTO hwid_bind_tokens (user_id, token, requested_ip, requested_user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, token, clientIp, String(req.headers['user-agent'] || ''), expiresAt],
    (err) => {
      if (err) {
        console.error('[HWID] Prepare error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      logActivity(
        req.user.id,
        'hwid_prepare',
        '生成了 HWID 绑定令牌',
        { agent_format: agent.format, expires_at: expiresAt },
        req.ip
      );

      res.json({
        message: 'HWID 绑定包已准备完成',
        agent_format: agent.format,
        agent_filename: agent.filename,
        agent_download_url: agent.downloadUrl,
        agent_ready: agent.ready,
        token_filename: 'bestfps-hwid-token.json',
        token_file: {
          token,
          bind_url: bindUrl,
          account_id: req.user.id,
          username: req.user.username,
          expires_at: expiresAt,
          generated_at: new Date().toISOString(),
        },
      });
    }
  );
});

router.post('/bind', (req, res) => {
  const token = String(req.body.token || '').trim();
  const hwidHash = String(req.body.hwid_hash || '').trim().toLowerCase();
  const deviceName = String(req.body.device_name || '').trim().slice(0, 120);
  const osName = String(req.body.os_name || '').trim().slice(0, 120);
  const agentVersion = String(req.body.agent_version || '').trim().slice(0, 40);
  const clientIp = normalizeIp(getClientIp(req));

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ error: '绑定令牌无效' });
  }
  if (!HWID_HASH_REGEX.test(hwidHash)) {
    return res.status(400).json({ error: 'HWID 哈希无效' });
  }
  if (!deviceName) {
    return res.status(400).json({ error: '设备名不能为空' });
  }

  try {
    const result = db._rawDb.transaction(() => {
      const tokenRow = db._prepare(
        `SELECT id, user_id, expires_at, used_at, requested_ip
         FROM hwid_bind_tokens
         WHERE token = ?`
      ).get(token);

      if (!tokenRow) throw createHttpError(404, '绑定令牌不存在');
      if (tokenRow.used_at) throw createHttpError(409, '绑定令牌已被使用');
      if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
        throw createHttpError(410, '绑定令牌已过期');
      }

      const requestedIp = normalizeIp(tokenRow.requested_ip);
      if (requestedIp && clientIp && requestedIp !== clientIp) {
        throw createHttpError(403, '绑定请求来源与令牌签发环境不一致，请返回网页重新生成令牌');
      }

      const existingBinding = db._prepare(
        `SELECT id, hwid_hash
         FROM hwid_bindings
         WHERE user_id = ?
           AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1`
      ).get(tokenRow.user_id);

      if (existingBinding && existingBinding.hwid_hash !== hwidHash) {
        throw createHttpError(409, '当前账号已有其他设备的 HWID 绑定，请先解绑');
      }

      const binding = {
        hwid_preview: getHwidPreview(hwidHash),
        device_name: deviceName,
      };

      if (existingBinding) {
        db._prepare(
          `UPDATE hwid_bindings
           SET device_name = ?, os_name = ?, agent_version = ?, last_ip = ?, updated_at = datetime('now'), last_seen_at = datetime('now')
           WHERE id = ?`
        ).run(deviceName, osName, agentVersion, clientIp, existingBinding.id);
      } else {
        db._prepare(
          `INSERT INTO hwid_bindings (user_id, hwid_hash, hwid_preview, device_name, os_name, agent_version, status, bind_source, last_ip)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'agent', ?)`
        ).run(tokenRow.user_id, hwidHash, binding.hwid_preview, deviceName, osName, agentVersion, clientIp);
      }

      const consumeResult = db._prepare(
        `UPDATE hwid_bind_tokens
         SET used_at = datetime('now')
         WHERE id = ?
           AND used_at IS NULL`
      ).run(tokenRow.id);

      if (!consumeResult.changes) {
        throw createHttpError(409, '绑定令牌已被使用');
      }

      return {
        userId: tokenRow.user_id,
        statusCode: existingBinding ? 200 : 201,
        eventType: existingBinding ? 'hwid_refresh' : 'hwid_bind',
        description: existingBinding ? `Refreshed HWID binding for ${deviceName}` : `Bound HWID to ${deviceName}`,
        message: existingBinding ? 'HWID 绑定已刷新' : 'HWID 绑定成功',
        binding,
      };
    })();

    logActivity(
      result.userId,
      result.eventType,
      result.description,
      { hwid_preview: result.binding.hwid_preview, device_name: result.binding.device_name },
      clientIp
    );

    return res.status(result.statusCode).json({
      message: result.message,
      binding: result.binding,
    });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[HWID] Bind error:', err);
    return res.status(500).json({ error: '服务器内部错误' });
  }
});

router.delete('/bindings/:id', requireAuth, (req, res) => {
  const bindingId = parseInt(req.params.id, 10);
  if (!bindingId) {
    return res.status(400).json({ error: '绑定 ID 无效' });
  }

  db.get(
    `SELECT id, device_name, hwid_preview
     FROM hwid_bindings
     WHERE id = ? AND user_id = ? AND status = 'active'`,
    [bindingId, req.user.id],
    (err, binding) => {
      if (err) {
        console.error('[HWID] Binding lookup error:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      if (!binding) return res.status(404).json({ error: 'HWID 绑定不存在' });

      db.run(
        `UPDATE hwid_bindings
         SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [bindingId],
        (updateErr) => {
          if (updateErr) {
            console.error('[HWID] Revoke binding error:', updateErr);
            return res.status(500).json({ error: '服务器内部错误' });
          }

          logActivity(
            req.user.id,
            'hwid_unbind',
            `Revoked HWID binding for ${binding.device_name || 'device'}`,
            { hwid_preview: binding.hwid_preview, binding_id: bindingId },
            req.ip
          );
          res.json({ message: 'HWID 绑定已解绑' });
        }
      );
    }
  );
});

module.exports = router;
