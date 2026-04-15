/**
 * Dashboard JS — 配置导入导出模块
 */
(function () {
  'use strict';

  async function exportConfig() {
    try {
      var res = await fetch('/api/settings/export', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
      });
      if (!res.ok) throw new Error('导出失败');
      var data = await res.json();
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'bestfps-config-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      window.toast('配置已导出', 'success');
    } catch (err) {
      window.toast('导出失败: ' + err.message, 'error');
    }
  }

  async function importConfigFromFile(input) {
    var file = input.files[0];
    if (!file) return;
    try {
      var text = await file.text();
      var data = JSON.parse(text);
      if (!data.shader_settings && !data.resource_packs) {
        window.toast('无效的配置文件格式', 'error');
        input.value = '';
        return;
      }
      if (!confirm('确定要导入此配置文件吗？当前配置将被覆盖。')) {
        input.value = '';
        return;
      }
      await window.api('POST', '/settings/import', { data: data, name: file.name });
      window.toast('配置已导入', 'success');
      await window.pullFromServer();
    } catch (err) {
      if (err instanceof SyntaxError) {
        window.toast('JSON 解析失败，请选择有效的 JSON 文件', 'error');
      } else {
        window.toast('导入失败: ' + err.message, 'error');
      }
    }
    input.value = '';
  }

  window.exportConfig = exportConfig;
  window.importConfigFromFile = importConfigFromFile;
})();
