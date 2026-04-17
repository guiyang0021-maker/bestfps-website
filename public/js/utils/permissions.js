/**
 * Permissions - 前端权限守卫
 * 注意：仅用于 UX 增强，不是安全边界
 * 真正的安全检查在后端 middleware/auth.js 和 middleware/admin.js
 */
(function(global) {
  'use strict';

  const ROLES = Object.freeze({
    USER: 'user',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
  });

  const PERMISSIONS = Object.freeze({
    MANAGE_USERS: ['admin', 'superadmin'],
    MANAGE_ANNOUNCEMENTS: ['admin', 'superadmin'],
    MANAGE_INVOICES: ['admin', 'superadmin'],
    VIEW_STATS: ['admin', 'superadmin'],
    MANAGE_HWID: ['admin', 'superadmin'],
    EDIT_PRESETS: ['user', 'admin', 'superadmin'],
    SHARE_CONFIG: ['user', 'admin', 'superadmin'],
    VIEW_ADMIN: ['admin', 'superadmin'],
  });

  /**
   * 检查用户是否有指定权限
   * @param {string} userRole - 用户角色
   * @param {string} permission - 权限名称
   * @returns {boolean}
   */
  function hasPermission(userRole, permission) {
    return PERMISSIONS[permission]?.includes(userRole) ?? false;
  }

  /**
   * 检查用户是否有指定角色
   * @param {string} userRole - 用户角色
   * @param {string} role - 角色名称
   * @returns {boolean}
   */
  function hasRole(userRole, role) {
    return userRole === role;
  }

  /**
   * 检查用户是否有任意一个指定角色
   * @param {string} userRole - 用户角色
   * @param {Array<string>} roles - 角色数组
   * @returns {boolean}
   */
  function hasAnyRole(userRole, roles) {
    return roles.includes(userRole);
  }

  /**
   * 前端权限守卫 — 仅用于 UX 增强
   * @param {Array<string>} allowedRoles - 允许的角色列表
   * @returns {boolean} 是否有权限
   */
  function requireRole(allowedRoles) {
    const user = global.currentUser;
    if (!user || !allowedRoles.includes(user.role)) {
      // 可选：重定向到仪表盘
      // window.location.href = '/dashboard';
      return false;
    }
    return true;
  }

  /**
   * 权限检查包装器
   * @param {string} permission - 权限名称
   * @returns {boolean}
   */
  function requirePermission(permission) {
    const user = global.currentUser;
    if (!user) return false;
    return hasPermission(user.role, permission);
  }

  // 导出
  global.Permissions = {
    ROLES,
    PERMISSIONS,
    hasPermission,
    hasRole,
    hasAnyRole,
    requireRole,
    requirePermission,
  };
})(window);
