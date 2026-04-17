/**
 * bestfps 网站服务器入口
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const path = require('path');

const cookieParser = require('cookie-parser');
const { db } = require('./db');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const downloadsRouter = require('./routes/downloads');
const syncRouter = require('./routes/sync');
const presetsRouter = require('./routes/presets');
const shareRouter = require('./routes/share');
const announcementsRouter = require('./routes/announcements');
const invoicesRouter = require('./routes/invoices');
const hwidRouter = require('./routes/hwid');
const { csrfMiddleware } = require('./middleware/csrf');
const adminRouter = require('./routes/admin');
const { extractToken, verifyToken, JWT_COOKIE_NAME } = require('./middleware/auth');

// API 路由

const app = express();
const PORT = process.env.PORT || 3000;
const baseCspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:"],
  connectSrc: ["'self'"],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: [],
};
const strictReportOnlyCspDirectives = {
  ...baseCspDirectives,
  scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
  scriptSrcAttr: ["'none'"],
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: baseCspDirectives,
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(helmet.contentSecurityPolicy({
  useDefaults: false,
  reportOnly: true,
  directives: strictReportOnlyCspDirectives,
}));

// Additional security headers
app.use(helmet.noSniff()); // X-Content-Type-Options: nosniff
app.use(helmet.frameguard({ action: 'deny' })); // X-Frame-Options: DENY
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' })); // Referrer-Policy

// Permissions-Policy: restrict sensitive browser features
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  next();
});

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS policy not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(cookieParser());

const PAGE_AUTH_STATE_SQL = `
  SELECT
    u.role,
    u.status,
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

function clearAuthCookies(res) {
  res.clearCookie(JWT_COOKIE_NAME, { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
}

function requirePageAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.redirect('/login');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (_) {
    clearAuthCookies(res);
    return res.redirect('/login');
  }

  db.get(PAGE_AUTH_STATE_SQL, [payload.jti || '', payload.jti || '', payload.jti || '', payload.id], (err, user) => {
    if (err || !user || !user.session_valid || user.status !== 'active') {
      clearAuthCookies(res);
      return res.redirect('/login');
    }
    req.user = { ...payload, role: user.role || payload.role || 'user' };
    req.token = token;
    next();
  });
}

function requirePageAdmin(req, res, next) {
  requirePageAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.redirect('/dashboard');
    }
    next();
  });
}

const CSRF_COOKIE_OPTIONAL_EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/confirm-email-change',
  '/hwid/bind',
]);

function csrfForSessionCookies(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.cookies || !req.cookies[JWT_COOKIE_NAME]) return next();
  if (CSRF_COOKIE_OPTIONAL_EXEMPT_PATHS.has(req.path)) return next();
  return csrfMiddleware(req, res, next);
}

// Trust proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const isLocalhost = (req) => {
  const ip = req.ip || req.connection.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isLocalhost(req),
  message: { error: '请求过于频繁，请稍后再试' },
}));

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

// 限制请求体大小
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

const PROTECTED_STATIC_PAGES = new Map([
  ['/dashboard.html', '/dashboard'],
  ['/settings.html', '/settings'],
  ['/sessions.html', '/sessions'],
  ['/admin.html', '/admin'],
]);

app.use((req, res, next) => {
  const redirectTarget = PROTECTED_STATIC_PAGES.get(String(req.path || '').toLowerCase());
  if (redirectTarget) {
    return res.redirect(redirectTarget);
  }
  next();
});

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', csrfForSessionCookies);

app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/downloads', downloadsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/presets', presetsRouter);
app.use('/api/share', shareRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/invoices', csrfMiddleware, invoicesRouter);
app.use('/api/hwid', hwidRouter);
app.use('/api/admin', csrfMiddleware, adminRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

app.get('/settings', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/sessions', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sessions.html'));
});

app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share-view.html'));
});

app.get('/change-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'change-email.html'));
});

app.get('/admin', requirePageAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.use((err, req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    console.error('[API] Unhandled error:', err);
    return res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
  }
  next(err);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  bestfps server running at http://localhost:${PORT}\n`);
  });
}

module.exports = app;
