/**
 * API 响应缓存中间件 — node-cache
 *
 * 使用 node-cache 内存缓存 API 响应，支持 TTL 和按 pattern 失效。
 */
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 300,   // 默认 5 分钟
  checkperiod: 60,
  useClones: false,
});

/**
 * 创建缓存中间件。
 * @param {number} ttlSeconds - 缓存 TTL，单位秒
 */
function cached(ttlSeconds) {
  return (req, res, next) => {
    // 只缓存 GET 请求
    if (req.method !== 'GET') return next();

    // 认证路由的缓存键需包含用户 ID，防止跨用户数据泄漏
    const key = req.user
      ? `${req.originalUrl}:uid-${req.user.id}`
      : req.originalUrl;
    const cachedData = cache.get(key);
    if (cachedData !== undefined) {
      return res.json(cachedData);
    }

    // 拦截 res.json，在响应时缓存数据
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, data, ttlSeconds || 300);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * 按 pattern 清除缓存。
 * @param {string} pattern - URL 模式片段
 */
function invalidate(pattern) {
  const keys = cache.keys();
  keys.forEach((key) => {
    if (key.includes(pattern)) cache.del(key);
  });
}

/**
 * 获取缓存统计信息（用于调试/监控）
 */
function stats() {
  return cache.getStats();
}

module.exports = { cache, cached, invalidate, stats };
