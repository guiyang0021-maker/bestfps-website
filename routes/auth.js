/**
 * 认证路由 - 主入口
 * 组合所有认证子模块
 */
const express = require('express');
const router = express.Router();

const accountRoutes = require('./auth/account');
const emailRoutes = require('./auth/email');
const passwordRoutes = require('./auth/password');
const profileRoutes = require('./auth/profile');
const sessionsRoutes = require('./auth/sessions');

// 注册所有子路由
accountRoutes(router);
emailRoutes(router);
passwordRoutes(router);
profileRoutes(router);
sessionsRoutes(router);

module.exports = router;
