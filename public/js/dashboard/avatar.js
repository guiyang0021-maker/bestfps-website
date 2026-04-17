/**
 * Dashboard JS — 头像模块
 */
(function () {
  'use strict';

  async function uploadAvatar(e) {
    var file = e.target.files[0];
    if (!file) return;
    var formData = new FormData();
    formData.append('avatar', file);
    try {
      var res = await fetch('/api/auth/avatar', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': window.getCsrfToken ? window.getCsrfToken() : '',
        },
        body: formData,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error);
      var avatarUrl = data.avatar_url || data.avatar;
      var img = document.getElementById('sidebar-avatar-img');
      img.src = avatarUrl + '?t=' + Date.now();
      img.style.display = 'block';
      document.getElementById('avatar-placeholder').style.display = 'none';
      if (window.currentUser) {
        window.currentUser.avatar = avatarUrl;
      }
    } catch (err) {
      alert('头像上传失败: ' + err.message);
    }
  }

  window.uploadAvatar = uploadAvatar;
})();
