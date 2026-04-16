/**
 * JWT 认证中间件
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET 未设置，生产环境禁止启动');
  }
  const fallbackSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[WARN] JWT_SECRET 未设置，当前使用进程级临时密钥。重启后所有会话都会失效。');
  return fallbackSecret;
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_COOKIE_NAME = 'bfps_token';
const AUTH_STATE_SQL = `
  SELECT
    u.role,
    u.status,
    u.suspended_at,
    u.suspend_reason,
    CASE
      WHEN ? = '' THEN 0
      WHEN EXISTS (
        SELECT 1
        FROM user_sessions s
        WHERE s.user_id = u.id
          AND s.jti = ?
          AND datetime(s.expires_at) > datetime('now')
      ) THEN 1
      WHEN EXISTS (
        SELECT 1
        FROM user_sessions s
        WHERE s.user_id = u.id
          AND s.jti = ?
      ) THEN 0
      ELSE 1
    END AS session_valid
  FROM users u
  WHERE u.id = ?
`;

/**
 * 生成 JWT Token（支持 jti 和 role）
 */
function generateToken(user, jti) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role || 'user', jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 获取 token 的标准 cookie 选项
 */
function tokenCookieOptions(maxAge) {
  const cookieMaxAge = maxAge || (7 * 24 * 60 * 60 * 1000); // 7 days in ms
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: cookieMaxAge,
    path: '/',
  };
}

/**
 * 验证 Token
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * 从请求中提取 token（优先 Authorization header，回退到 Cookie）
 */
function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // 2. Cookie
  if (req.cookies && req.cookies[JWT_COOKIE_NAME]) {
    return req.cookies[JWT_COOKIE_NAME];
  }
  return null;
}

/**
 * 认证中间件 — 需要已登录
 */
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    console.log('[Auth] Missing auth token:', req.path, req.ip);
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  try {
    const payload = verifyToken(token);

    // 兼容历史 token：如果 user_sessions 中没有记录，仍按有效处理。
    db.get(AUTH_STATE_SQL, [payload.jti || '', payload.jti || '', payload.jti || '', payload.id], (err, user) => {
      if (err || !user) {
        console.error('[Auth] User lookup error:', err || 'user not found', 'user_id:', payload.id);
        return res.status(401).json({ error: '用户不存在' });
      }
      if (!user.session_valid) {
        console.log('[Auth] Session revoked:', req.path, 'user_id:', payload.id, 'jti:', payload.jti ? payload.jti.slice(0, 8) : 'none');
        return res.status(401).json({ error: '会话已失效，请重新登录' });
      }
      if (user.status === 'banned') {
        console.log('[Auth] Banned user blocked:', req.path, 'user_id:', payload.id);
        return res.status(403).json({ error: '账号已被永久封禁' });
      }
      if (user.status === 'suspended') {
        const reason = user.suspend_reason ? `，原因：${user.suspend_reason}` : '';
        console.log('[Auth] Suspended user blocked:', req.path, 'user_id:', payload.id);
        return res.status(403).json({ error: `账号已被封禁${reason}` });
      }
      if (user.status !== 'active') {
        console.log('[Auth] Inactive user blocked:', req.path, 'user_id:', payload.id, 'status:', user.status);
        return res.status(403).json({ error: '账号状态异常，请联系管理员' });
      }

      req.user = { ...payload, role: user.role || payload.role || 'user' };
      req.token = token;
      next();
    });
  } catch (err) {
    console.log('[Auth] Token error:', req.path, err.name, err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token 已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的 Token' });
  }
}

/**
 * 可选认证中间件 — 已登录则注入用户信息，未登录则继续
 */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);
    db.get(AUTH_STATE_SQL, [payload.jti || '', payload.jti || '', payload.jti || '', payload.id], (err, user) => {
      if (!err && user && user.session_valid && user.status === 'active') {
        req.user = { ...payload, role: user.role || payload.role || 'user' };
        req.token = token;
      }
      next();
    });
  } catch (_) {
    next();
  }
}

/**
 * 验证邮箱后缀中间件
 */
function requireVerified(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

module.exports = { generateToken, verifyToken, requireAuth, optionalAuth, extractToken, JWT_COOKIE_NAME, tokenCookieOptions };
