/**
 * 统一验证中间件
 * 使用 express-validator 进行输入验证
 */
const { body, param, query, validationResult } = require('express-validator');

/**
 * 运行验证规则
 * @param {Array} validations - 验证规则数组
 * @returns {Function} Express 中间件
 */
function validate(validations) {
  return async (req, res, next) => {
    await Promise.all(validations.map(v => v.run(req)));
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    const details = errors.array();
    return res.status(400).json({
      error: details[0]?.msg || '验证失败',
      details: details.map(e => ({
        field: e.path,
        message: e.msg,
        value: e.value,
      })),
    });
  };
}

/**
 * 常用验证规则
 */
const rules = {
  // 认证相关
  username: body('username')
    .trim()
    .isLength({ min: 3, max: 32 })
    .withMessage('用户名需 3-32 个字符')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字和下划线'),

  email: body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('无效的邮箱格式'),

  password: body('password')
    .isLength({ min: 8 })
    .withMessage('密码至少 8 个字符'),

  // 用户资料
  displayName: body('display_name')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('显示名称最多 50 个字符'),

  // 预设
  presetName: body('name')
    .trim()
    .custom((value) => {
      if (!value) return Promise.reject('预设名称不能为空');
      if (value.length > 50) return Promise.reject('预设名称不能超过 50 个字符');
      return true;
    }),

  presetData: body('data')
    .optional()
    .isObject()
    .withMessage('预设数据必须是对象'),

  // 分享
  shareToken: param('token')
    .trim()
    .isLength({ min: 32, max: 64 })
    .withMessage('无效的分享令牌'),

  // 分页
  page: query('page')
    .optional()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('页码必须为正整数'),

  limit: query('limit')
    .optional()
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('每页数量需在 1-100 之间'),

  // ID 参数
  id: param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('无效的 ID'),

  // 公告
  announcementTitle: body('title')
    .trim()
    .custom((value) => {
      if (!value) return Promise.reject('标题不能为空');
      if (value.length > 255) return Promise.reject('标题不能超过 255 个字符');
      return true;
    }),

  announcementContent: body('content')
    .trim()
    .custom((value) => {
      if (!value) return Promise.reject('内容不能为空');
      if (value.length > 10000) return Promise.reject('内容不能超过 10000 个字符');
      return true;
    }),

  announcementPriority: body('priority')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('优先级需在 0-10 之间'),
};

module.exports = { validate, rules };
