/**
 * Dashboard JS — 个人资料模块
 */
(function () {
  'use strict';

  async function loadProfile() {
    try {
      var data = await window.api('GET', '/auth/profile');
      document.getElementById('profile-bio').value = data.bio || '';
      document.getElementById('profile-website').value = data.website || '';
      document.getElementById('profile-discord').value = data.social_discord || '';
      document.getElementById('profile-twitter').value = data.social_twitter || '';
    } catch (err) {
      console.error('Load profile error:', err);
    }
  }

  async function saveProfile() {
    var bio = document.getElementById('profile-bio').value;
    var website = document.getElementById('profile-website').value;
    var discord = document.getElementById('profile-discord').value;
    var twitter = document.getElementById('profile-twitter').value;

    try {
      await window.api('PUT', '/auth/profile', { bio: bio, website: website, social_discord: discord, social_twitter: twitter });
      window.toast('个人资料已保存', 'success');
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  window.loadProfile = loadProfile;
  window.saveProfile = saveProfile;
})();
