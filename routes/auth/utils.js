/**
 * 认证路由 - 共享工具
 */
const multer = require('multer');
const path = require('path');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../public/uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}${ext}`);
  },
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG/PNG/GIF/WebP 格式'));
    }
  },
});

function parseUserAgent(ua) {
  let browser = 'Unknown';
  let os = 'Unknown';
  let device_type = 'Desktop';

  if (!ua) return { browser, os, device_type };

  if (/electron/i.test(ua)) {
    browser = 'Electron';
  } else if (/micromessenger/i.test(ua)) {
    browser = 'WeChat';
  } else if (/edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/chrome\/(\d+)/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/opera|opr/i.test(ua)) {
    browser = 'Opera';
  }

  if (/iphone|ipad|ipod|android/i.test(ua)) {
    device_type = 'Mobile';
    if (/iphone/i.test(ua)) os = 'iOS';
    else if (/ipad/i.test(ua)) os = 'iPadOS';
    else if (/android/i.test(ua)) os = 'Android';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  return { browser, os, device_type };
}

function getClientIp(req) {
  const fallbackIp = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  if (!fallbackIp) return '';
  return String(fallbackIp)
    .replace(/^::ffff:/i, '')
    .replace(/^::1$/i, '127.0.0.1');
}

module.exports = {
  PASSWORD_REGEX,
  avatarUpload,
  parseUserAgent,
  getClientIp,
};
