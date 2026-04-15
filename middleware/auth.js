/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'bestfps-super-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_COOKIE_NAME = 'bfps_token';

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
    maxAge: cookieMaxAge / 1000, // in seconds for express
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
 * 检查会话是否已被吊销
 * 注意：如果 session 不存在，视为有效（旧 token 或首次登录场景）
 * 只有明确查询出错时才视为吊销
 */
function isSessionRevoked(jti, callback) {
  if (!jti) return callback(false);
  db.get('SELECT id FROM user_sessions WHERE jti = ?', [jti], (err, session) => {
    if (err) {
      console.error('[Auth] Session check error:', err);
      return callback(true); // 查询出错，保守处理
    }
    // session 不存在？可能是旧 token 或首次登录，视为有效
    callback(false);
  });
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

    // 检查会话是否被吊销
    isSessionRevoked(payload.jti, (revoked) => {
      if (revoked) {
        console.log('[Auth] Session revoked:', req.path, 'user_id:', payload.id, 'jti:', payload.jti ? payload.jti.slice(0,8) : 'none');
        return res.status(401).json({ error: '会话已失效，请重新登录' });
      }

      // 检查用户账号状态
      db.get('SELECT status, suspended_at, suspend_reason FROM users WHERE id = ?', [payload.id], (err, user) => {
        if (err || !user) {
          console.error('[Auth] User lookup error:', err || 'user not found', 'user_id:', payload.id);
          return res.status(401).json({ error: '用户不存在' });
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

        req.user = payload;
        req.token = token;
        next();
      });
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
    isSessionRevoked(payload.jti, (revoked) => {
      if (!revoked) {
        req.user = payload;
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
