/**
 * 管理员权限中间件
 */
const { requireAuth } = require('./auth');

/**
 * 要求管理员权限中间件
 * 必须在 requireAuth 之后使用
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { requireAdmin };
