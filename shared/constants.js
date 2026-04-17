/**
 * 共享常量
 * 后端和前端共享的常量和枚举
 */

const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
});

const PERMISSIONS = Object.freeze({
  MANAGE_USERS: ['admin', 'superadmin'],
  MANAGE_ANNOUNCEMENTS: ['admin', 'superadmin'],
  MANAGE_INVOICES: ['admin', 'superadmin'],
  VIEW_STATS: ['admin', 'superadmin'],
  MANAGE_HWID: ['admin', 'superadmin'],
  EDIT_PRESETS: ['user', 'admin', 'superadmin'],
  SHARE_CONFIG: ['user', 'admin', 'superadmin'],
});

const INVOICE_TYPES = Object.freeze({
  PERSONAL_NORMAL: 'personal_normal',
  COMPANY_NORMAL: 'company_normal',
  COMPANY_SPECIAL_VAT: 'company_special_vat',
  COMPANY_ELECTRONIC: 'company_electronic',
});

const INVOICE_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

/**
 * 检查角色是否有权限
 * @param {string} role - 用户角色
 * @param {string} permission - 权限名称
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

/**
 * 检查是否是管理员角色
 * @param {string} role - 用户角色
 * @returns {boolean}
 */
function isAdmin(role) {
  return role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
}

/**
 * 检查是否是超级管理员
 * @param {string} role - 用户角色
 * @returns {boolean}
 */
function isSuperAdmin(role) {
  return role === ROLES.SUPERADMIN;
}

module.exports = {
  ROLES,
  USER_STATUS,
  PERMISSIONS,
  INVOICE_TYPES,
  INVOICE_STATUS,
  hasPermission,
  isAdmin,
  isSuperAdmin,
};
