/**
 * Dashboard JS — 邮箱管理模块
 */
(function () {
  'use strict';

  async function changeEmail() {
    var newEmail = document.getElementById('new-email').value.trim();
    var password = document.getElementById('email-password').value;

    if (!newEmail || !password) return window.toast('请填写所有字段', 'error');

    try {
      await window.api('POST', '/auth/change-email', { newEmail: newEmail, password: password });
      window.toast('验证邮件已发送到新邮箱，请查收并点击链接确认', 'success');
      document.getElementById('new-email').value = '';
      document.getElementById('email-password').value = '';
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  window.changeEmail = changeEmail;
})();
