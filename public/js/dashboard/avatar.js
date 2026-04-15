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
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: formData,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error);
      var img = document.getElementById('sidebar-avatar-img');
      img.src = data.avatar + '?t=' + Date.now();
      img.style.display = 'block';
      document.getElementById('avatar-placeholder').style.display = 'none';
      var u = JSON.parse(localStorage.getItem('user') || '{}');
      u.avatar = data.avatar;
      localStorage.setItem('user', JSON.stringify(u));
    } catch (err) {
      alert('头像上传失败: ' + err.message);
    }
  }

  window.uploadAvatar = uploadAvatar;
})();
