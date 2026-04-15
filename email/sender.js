/**
 * 邮件发送服务
 * 开发环境：邮件内容打印到控制台
 * 生产环境：配置 SMTP 后使用真实邮件发送
 */
const nodemailer = require('nodemailer');

const EMAIL_HOST = process.env.EMAIL_HOST || '';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'bestfps <noreply@bestfps.com>';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const hasSMTP = !!(EMAIL_HOST && EMAIL_USER && EMAIL_PASS);

let transporter = null;

if (hasSMTP) {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

async function sendEmail(to, subject, text) {
  if (transporter) {
    await transporter.sendMail({ from: EMAIL_FROM, to, subject, text });
    console.log(`[Email] 邮件已发送至 ${to}: ${subject}`);
  } else {
    console.log('\n========================================');
    console.log(`[Email Dev] 收件人: ${to}`);
    console.log(`[Email Dev] 主题:   ${subject}`);
    console.log(`[Email Dev] 正文:\n${text}`);
    console.log('========================================\n');
  }
}

async function sendVerificationEmail(email, token) {
  const url = `${BASE_URL}/api/auth/verify?token=${token}`;
  await sendEmail(email, 'bestfps 邮箱验证', `
您好！

请访问以下链接验证你的邮箱：

${url}

该链接有效期为 24 小时。

— bestfps 团队
  `.trim());
}

async function sendPasswordResetEmail(email, token) {
  const url = `${BASE_URL}/reset-password?token=${token}`;
  await sendEmail(email, 'bestfps 密码重置', `
您好！

你请求了密码重置。请访问以下链接设置新密码：

${url}

该链接有效期为 1 小时。
如果你没有请求重置，请忽略此邮件。

— bestfps 团队
  `.trim());
}

async function sendEmailChangeVerification(newEmail, confirmUrl, username) {
  await sendEmail(newEmail, 'bestfps 邮箱修改验证', `
您好 ${username}！

你申请将账号邮箱修改为 ${newEmail}。
请访问以下链接确认修改：

${confirmUrl}

该链接有效期为 1 小时。
如果你没有申请修改，请忽略此邮件。

— bestfps 团队
  `.trim());
}

async function sendEmailChangeNotification(oldEmail, newEmail) {
  await sendEmail(oldEmail, 'bestfps 邮箱已变更', `
您好！

你的 bestfps 账号邮箱已从 ${oldEmail} 修改为 ${newEmail}。

如果不是本人操作，请立即联系 support@bestfps.com。

— bestfps 团队
  `.trim());
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeVerification,
  sendEmailChangeNotification,
};
