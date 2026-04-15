/**
 * Dashboard JS — 密码管理模块
 */
(function () {
  'use strict';

  async function changePassword() {
    var oldPw = document.getElementById('old-password').value;
    var newPw = document.getElementById('new-password').value;
    var confirmPw = document.getElementById('confirm-password').value;

    if (!oldPw || !newPw) return window.toast('请填写所有字段', 'error');
    if (newPw.length < 8) return window.toast('新密码至少 8 位', 'error');
    if (newPw !== confirmPw) return window.toast('两次密码输入不一致', 'error');

    try {
      await window.api('POST', '/auth/change-password', { oldPassword: oldPw, newPassword: newPw });
      window.toast('密码已修改，其他会话已被吊销', 'success');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  window.changePassword = changePassword;
})();
