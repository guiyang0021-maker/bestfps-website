(() => {
  // public/js/dashboard/core.js
  (function() {
    "use strict";
    function authHeaders() {
      return { "Authorization": "Bearer " + localStorage.getItem("token") };
    }
    async function api(method, path, body, skipAuth) {
      const res = await fetch("/api" + path, {
        method,
        credentials: "include",
        // 发送 httpOnly Cookie（JWT）
        headers: {
          "Content-Type": "application/json",
          ...skipAuth ? {} : authHeaders()
        },
        body: body ? JSON.stringify(body) : void 0
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
        throw new Error("\u4F1A\u8BDD\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
      }
      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        alert(errData.error || "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458");
        window.location.href = "/login";
        throw new Error(errData.error || "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981");
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "\u8BF7\u6C42\u5931\u8D25");
      return data;
    }
    window.authHeaders = authHeaders;
    window.api = api;
  })();

  // public/js/dashboard/ui.js
  (function() {
    "use strict";
    function toast(message, type) {
      type = type || "info";
      var container = document.getElementById("toast-container");
      var icons = {
        success: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>',
        error: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
        info: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
        warning: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'
      };
      var toastEl = document.createElement("div");
      toastEl.className = "toast toast--" + type;
      toastEl.innerHTML = [
        '<span class="toast__icon">' + (icons[type] || icons.info) + "</span>",
        '<span class="toast__text">' + message + "</span>",
        '<button class="toast__close" onclick="this.parentElement.remove()">',
        '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
        "</button>"
      ].join("");
      container.appendChild(toastEl);
      setTimeout(function() {
        toastEl.classList.add("toast--exiting");
        setTimeout(function() {
          toastEl.remove();
        }, 250);
      }, 4e3);
    }
    function showSkeleton(section) {
      var map = {
        shader: document.getElementById("shader-skeleton"),
        chart: document.getElementById("chart-skeleton"),
        downloads: document.querySelectorAll(".downloads-skeleton"),
        presets: document.querySelectorAll(".preset-skeleton"),
        shares: document.getElementById("share-skeleton"),
        sessions: document.getElementById("sessions-skeleton"),
        history: document.querySelectorAll(".history-skeleton")
      };
      var el = map[section];
      if (!el) return;
      if (Symbol.iterator in Object(el)) {
        el.forEach(function(e) {
          if (e) e.classList.add("show");
        });
      } else {
        el.classList.add("show");
      }
    }
    function hideSkeleton(section) {
      var map = {
        shader: document.getElementById("shader-skeleton"),
        chart: document.getElementById("chart-skeleton"),
        downloads: document.querySelectorAll(".downloads-skeleton"),
        presets: document.querySelectorAll(".preset-skeleton"),
        shares: document.getElementById("share-skeleton"),
        sessions: document.getElementById("sessions-skeleton"),
        history: document.querySelectorAll(".history-skeleton")
      };
      var el = map[section];
      if (!el) return;
      if (Symbol.iterator in Object(el)) {
        el.forEach(function(e) {
          if (e) e.classList.remove("show");
        });
      } else {
        el.classList.remove("show");
      }
    }
    function showAlert(id, msg) {
      var successIds = ["shader-success", "resource-success", "profile-success", "password-success", "email-success", "share-success", "sessions-success"];
      var errorIds = ["shader-error", "resource-error", "profile-error", "password-error", "email-error", "share-error", "sessions-error"];
      [].concat(successIds).concat(errorIds).forEach(function(sid) {
        var el2 = document.getElementById(sid);
        if (el2) el2.style.display = "none";
      });
      var el = document.getElementById(id);
      if (el) {
        el.textContent = msg;
        el.className = "alert " + (successIds.indexOf(id) !== -1 ? "alert-success" : "alert-error");
        el.style.display = "flex";
        setTimeout(function() {
          el.style.display = "none";
        }, 5e3);
      }
    }
    function logout() {
      fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
      }).catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/";
      });
    }
    window.toast = toast;
    window.showSkeleton = showSkeleton;
    window.hideSkeleton = hideSkeleton;
    window.showAlert = showAlert;
    window.logout = logout;
  })();

  // public/js/dashboard/theme.js
  (function() {
    "use strict";
    function initTheme() {
      const savedTheme = localStorage.getItem("theme") || "light";
      document.documentElement.setAttribute("data-theme", savedTheme);
      document.querySelectorAll(".theme-btn").forEach(function(btn) {
        btn.classList.toggle("active", btn.dataset.theme === savedTheme);
        btn.addEventListener("click", function() {
          const theme = btn.dataset.theme;
          document.documentElement.setAttribute("data-theme", theme);
          localStorage.setItem("theme", theme);
          document.querySelectorAll(".theme-btn").forEach(function(b) {
            b.classList.remove("active");
          });
          btn.classList.add("active");
        });
      });
    }
    window.initTheme = initTheme;
  })();

  // public/js/dashboard/nav.js
  (function() {
    "use strict";
    function initSidebar() {
      document.getElementById("sidebar-toggle").addEventListener("click", function() {
        document.getElementById("dash-sidebar").classList.toggle("open");
        document.getElementById("sidebar-overlay").classList.toggle("open");
      });
    }
    function closeSidebar2() {
      document.getElementById("dash-sidebar").classList.remove("open");
      document.getElementById("sidebar-overlay").classList.remove("open");
    }
    function showSection2(name) {
      document.querySelectorAll(".dash-section").forEach(function(s) {
        s.classList.remove("active");
      });
      document.querySelectorAll(".sidebar-nav__item, .sidebar-nav__subitem").forEach(function(a) {
        a.classList.remove("active");
      });
      document.getElementById("section-" + name).classList.add("active");
      var navLink = document.querySelector('.sidebar-nav__item[data-section="' + name + '"]');
      if (navLink) navLink.classList.add("active");
      var subLink = document.querySelector('.sidebar-nav__subitem[data-section="' + name + '"]');
      if (subLink) subLink.classList.add("active");
      closeSidebar2();
    }
    function toggleAccountMenu() {
      var submenu = document.getElementById("account-submenu");
      var btn = document.querySelector(".sidebar-nav__group-title");
      var isOpen = submenu.style.display !== "none";
      submenu.style.display = isOpen ? "none" : "flex";
      btn.setAttribute("aria-expanded", !isOpen);
    }
    function initNavigation() {
      var origShowSection = showSection2;
      window.showSection = function(name) {
        origShowSection(name);
        if (name === "sessions" && typeof loadSessions === "function") loadSessions();
        if (name === "login-history" && typeof loadHistory === "function") loadHistory(1);
        if (name === "versions" && typeof loadVersions === "function") loadVersions();
      };
    }
    window.initSidebar = initSidebar;
    window.closeSidebar = closeSidebar2;
    window.showSection = showSection2;
    window.toggleAccountMenu = toggleAccountMenu;
    window.initNavigation = initNavigation;
  })();

  // public/js/dashboard/shortcuts.js
  (function() {
    "use strict";
    var gPressed = false;
    function openShortcutsModal() {
      document.getElementById("shortcuts-modal").classList.add("active");
    }
    function closeShortcutsModal() {
      document.getElementById("shortcuts-modal").classList.remove("active");
    }
    function initKeyboardShortcuts() {
      document.addEventListener("keydown", function(e) {
        var tag = document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        var key = e.key.toLowerCase();
        var ctrl = e.ctrlKey || e.metaKey;
        if (key === "escape") {
          closeShortcutsModal();
          if (typeof closeSidebar === "function") closeSidebar();
          var ob = document.getElementById("onboarding-modal");
          if (ob && ob.classList.contains("active") && typeof skipOnboarding === "function") skipOnboarding();
          return;
        }
        var ob = document.getElementById("onboarding-modal");
        if (ob && ob.classList.contains("active")) {
          if (key === "enter" || key === "arrowright") {
            if (typeof nextOnboardingStep === "function") nextOnboardingStep();
            return;
          }
          if (key === "arrowleft") {
            if (typeof prevOnboardingStep === "function") prevOnboardingStep();
            return;
          }
          return;
        }
        if (key === "?" || key === "/" && !ctrl) {
          e.preventDefault();
          openShortcutsModal();
          return;
        }
        if (ctrl && key === "s") {
          e.preventDefault();
          if (typeof pushToServer === "function") pushToServer();
          return;
        }
        if (ctrl && key === "p") {
          e.preventDefault();
          if (typeof showNewPresetModal === "function") showNewPresetModal();
          return;
        }
        if (key === "g" && !ctrl) {
          gPressed = true;
          setTimeout(function() {
            gPressed = false;
          }, 1e3);
          return;
        }
        if (gPressed) {
          gPressed = false;
          if (typeof showSection === "function") {
            switch (key) {
              case "h":
                showSection("home");
                break;
              case "s":
                showSection("shaders");
                break;
              case "p":
                showSection("presets");
                break;
              case "d":
                showSection("downloads");
                break;
              case "a":
                showSection("profile");
                break;
            }
          }
        }
      });
    }
    window.openShortcutsModal = openShortcutsModal;
    window.closeShortcutsModal = closeShortcutsModal;
    window.initKeyboardShortcuts = initKeyboardShortcuts;
  })();

  // public/js/dashboard/avatar.js
  (function() {
    "use strict";
    async function uploadAvatar(e) {
      var file = e.target.files[0];
      if (!file) return;
      var formData = new FormData();
      formData.append("avatar", file);
      try {
        var res = await fetch("/api/auth/avatar", {
          method: "POST",
          headers: { Authorization: "Bearer " + localStorage.getItem("token") },
          body: formData
        });
        var data = await res.json();
        if (!res.ok) throw new Error(data.error);
        var img = document.getElementById("sidebar-avatar-img");
        img.src = data.avatar + "?t=" + Date.now();
        img.style.display = "block";
        document.getElementById("avatar-placeholder").style.display = "none";
        var u = JSON.parse(localStorage.getItem("user") || "{}");
        u.avatar = data.avatar;
        localStorage.setItem("user", JSON.stringify(u));
      } catch (err) {
        alert("\u5934\u50CF\u4E0A\u4F20\u5931\u8D25: " + err.message);
      }
    }
    window.uploadAvatar = uploadAvatar;
  })();

  // public/js/dashboard/profile.js
  (function() {
    "use strict";
    async function loadProfile() {
      try {
        var data = await window.api("GET", "/auth/profile");
        document.getElementById("profile-bio").value = data.bio || "";
        document.getElementById("profile-website").value = data.website || "";
        document.getElementById("profile-discord").value = data.social_discord || "";
        document.getElementById("profile-twitter").value = data.social_twitter || "";
      } catch (err) {
        console.error("Load profile error:", err);
      }
    }
    async function saveProfile() {
      var bio = document.getElementById("profile-bio").value;
      var website = document.getElementById("profile-website").value;
      var discord = document.getElementById("profile-discord").value;
      var twitter = document.getElementById("profile-twitter").value;
      try {
        await window.api("PUT", "/auth/profile", { bio, website, social_discord: discord, social_twitter: twitter });
        window.toast("\u4E2A\u4EBA\u8D44\u6599\u5DF2\u4FDD\u5B58", "success");
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    window.loadProfile = loadProfile;
    window.saveProfile = saveProfile;
  })();

  // public/js/dashboard/password.js
  (function() {
    "use strict";
    async function changePassword() {
      var oldPw = document.getElementById("old-password").value;
      var newPw = document.getElementById("new-password").value;
      var confirmPw = document.getElementById("confirm-password").value;
      if (!oldPw || !newPw) return window.toast("\u8BF7\u586B\u5199\u6240\u6709\u5B57\u6BB5", "error");
      if (newPw.length < 8) return window.toast("\u65B0\u5BC6\u7801\u81F3\u5C11 8 \u4F4D", "error");
      if (newPw !== confirmPw) return window.toast("\u4E24\u6B21\u5BC6\u7801\u8F93\u5165\u4E0D\u4E00\u81F4", "error");
      try {
        await window.api("POST", "/auth/change-password", { oldPassword: oldPw, newPassword: newPw });
        window.toast("\u5BC6\u7801\u5DF2\u4FEE\u6539\uFF0C\u5176\u4ED6\u4F1A\u8BDD\u5DF2\u88AB\u540A\u9500", "success");
        document.getElementById("old-password").value = "";
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    window.changePassword = changePassword;
  })();

  // public/js/dashboard/email.js
  (function() {
    "use strict";
    async function changeEmail() {
      var newEmail = document.getElementById("new-email").value.trim();
      var password = document.getElementById("email-password").value;
      if (!newEmail || !password) return window.toast("\u8BF7\u586B\u5199\u6240\u6709\u5B57\u6BB5", "error");
      try {
        await window.api("POST", "/auth/change-email", { newEmail, password });
        window.toast("\u9A8C\u8BC1\u90AE\u4EF6\u5DF2\u53D1\u9001\u5230\u65B0\u90AE\u7BB1\uFF0C\u8BF7\u67E5\u6536\u5E76\u70B9\u51FB\u94FE\u63A5\u786E\u8BA4", "success");
        document.getElementById("new-email").value = "";
        document.getElementById("email-password").value = "";
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    window.changeEmail = changeEmail;
  })();

  // public/js/dashboard/sync.js
  (function() {
    "use strict";
    async function pullFromServer() {
      try {
        window.showSkeleton("shader");
        var data = await window.api("GET", "/sync/pull");
        window.hideSkeleton("shader");
        loadSettingsToUI(data);
        updateSyncStatus(true);
      } catch (err) {
        window.hideSkeleton("shader");
        console.error("Pull error:", err);
      }
    }
    function loadSettingsToUI(data) {
      var ss = data.shader_settings || {};
      function set(id, val, isCheckbox) {
        var el = document.getElementById(id);
        if (!el) return;
        if (isCheckbox) {
          el.checked = val !== void 0 ? val : el.checked;
        } else {
          if (val !== void 0) {
            el.value = val;
            var display = el.nextElementSibling;
            if (display) display.textContent = val + (id.includes("distance") ? " ch" : "%");
          }
        }
      }
      set("shader-dynamic-light", ss.dynamic_light, true);
      set("shader-smooth-light", ss.smooth_light, true);
      set("shader-clouds", ss.clouds, true);
      set("shader-particles", ss.particles, false);
      set("shader-view-distance", ss.view_distance, false);
      loadResourceList(data.resource_packs || []);
    }
    function collectSettingsFromUI() {
      var shader_settings = {
        dynamic_light: document.getElementById("shader-dynamic-light").checked,
        smooth_light: document.getElementById("shader-smooth-light").checked,
        clouds: document.getElementById("shader-clouds").checked,
        particles: parseInt(document.getElementById("shader-particles").value),
        view_distance: parseInt(document.getElementById("shader-view-distance").value)
      };
      var packs = [];
      document.querySelectorAll("#resource-list .resource-item").forEach(function(item) {
        var name = item.querySelector(".resource-name").textContent.trim();
        var on = item.querySelector(".toggle input").checked;
        packs.push({ name, enabled: on });
      });
      return { shader_settings, resource_packs: packs };
    }
    async function pushToServer2() {
      try {
        var settings = collectSettingsFromUI();
        await window.api("POST", "/sync/push", settings);
        updateSyncStatus(true);
        window.toast("\u914D\u7F6E\u5DF2\u540C\u6B65\u5230\u670D\u52A1\u5668", "success");
      } catch (err) {
        window.toast("\u540C\u6B65\u5931\u8D25: " + err.message, "error");
      }
    }
    function updateSyncStatus(synced) {
      var dot = document.getElementById("sync-dot");
      var text = document.getElementById("sync-text");
      if (dot) dot.classList.toggle("stale", !synced);
      if (text) text.textContent = synced ? "\u5DF2\u540C\u6B65" : "\u672A\u540C\u6B65";
    }
    function loadResourceList(packs) {
      var list = document.getElementById("resource-list");
      var empty = document.getElementById("resource-empty");
      list.innerHTML = "";
      if (!packs || packs.length === 0) {
        empty.style.display = "flex";
        return;
      }
      empty.style.display = "none";
      packs.forEach(function(pack) {
        list.appendChild(createResourceItem(pack.name, pack.enabled));
      });
    }
    function createResourceItem(name, enabled) {
      enabled = enabled !== void 0 ? enabled : true;
      var item = document.createElement("div");
      item.className = "resource-item";
      item.innerHTML = [
        '<div class="resource-icon">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
        "</div>",
        '<span class="resource-name">' + name + "</span>",
        '<label class="toggle" title="\u542F\u7528/\u7981\u7528">',
        '<input type="checkbox" ' + (enabled ? "checked" : "") + " />",
        '<span class="toggle-slider"></span>',
        "</label>",
        `<button class="resource-remove" onclick="this.closest('.resource-item').remove()" title="\u79FB\u9664">`,
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        "</button>"
      ].join("");
      return item;
    }
    function addResource() {
      var name = prompt("\u8F93\u5165\u8D44\u6E90\u5305\u540D\u79F0\uFF1A");
      if (name && name.trim()) {
        document.getElementById("resource-list").appendChild(createResourceItem(name.trim(), true));
        document.getElementById("resource-empty").style.display = "none";
      }
    }
    window.pullFromServer = pullFromServer;
    window.loadSettingsToUI = loadSettingsToUI;
    window.collectSettingsFromUI = collectSettingsFromUI;
    window.pushToServer = pushToServer2;
    window.updateSyncStatus = updateSyncStatus;
    window.loadResourceList = loadResourceList;
    window.createResourceItem = createResourceItem;
    window.addResource = addResource;
  })();

  // public/js/dashboard/downloads.js
  (function() {
    "use strict";
    async function loadDownloads() {
      try {
        window.showSkeleton("downloads");
        var data = await window.api("GET", "/downloads");
        var tbody = document.getElementById("downloads-body");
        var table = document.getElementById("downloads-table");
        var empty = document.getElementById("downloads-empty");
        tbody.querySelectorAll(".downloads-skeleton").forEach(function(r) {
          r.remove();
        });
        tbody.innerHTML = "";
        if (!data.downloads || data.downloads.length === 0) {
          table.style.display = "none";
          empty.style.display = "flex";
          return;
        }
        empty.style.display = "none";
        table.style.display = "table";
        data.downloads.forEach(function(dl) {
          var tr = document.createElement("tr");
          tr.innerHTML = [
            "<td>" + dl.version + "</td>",
            '<td><span class="os-badge os-' + dl.os + '">' + dl.os + "</span></td>",
            "<td>" + new Date(dl.downloaded_at).toLocaleString("zh-CN") + "</td>"
          ].join("");
          tbody.appendChild(tr);
        });
      } catch (err) {
        console.error("Load downloads error:", err);
      } finally {
        window.hideSkeleton("downloads");
      }
    }
    window.loadDownloads = loadDownloads;
  })();

  // public/js/dashboard/presets.js
  (function() {
    "use strict";
    async function loadPresets() {
      try {
        window.showSkeleton("presets");
        var data = await window.api("GET", "/presets");
        window.hideSkeleton("presets");
        renderPresets(data.presets || []);
      } catch (err) {
        window.hideSkeleton("presets");
        console.error("Load presets error:", err);
      }
    }
    function renderPresets(presets) {
      var grid = document.getElementById("presets-grid");
      var empty = document.getElementById("presets-empty");
      grid.innerHTML = "";
      if (presets.length === 0) {
        empty.style.display = "flex";
        grid.style.display = "none";
        return;
      }
      empty.style.display = "none";
      grid.style.display = "grid";
      presets.forEach(function(p) {
        var card = document.createElement("div");
        card.className = "preset-card" + (p.is_default ? " preset-card--default" : "");
        card.innerHTML = [
          '<div class="preset-card__header">',
          '<div class="preset-card__name">' + p.name + "</div>",
          p.is_default ? '<span class="preset-card__badge">\u9ED8\u8BA4</span>' : "",
          "</div>",
          '<p class="preset-card__desc">' + (p.description || "\u65E0\u63CF\u8FF0") + "</p>",
          '<div class="preset-card__meta">',
          "<span>" + new Date(p.created_at).toLocaleDateString("zh-CN") + "</span>",
          "</div>",
          '<div class="preset-card__actions">',
          '<button class="btn btn-primary btn-sm" onclick="applyPreset(' + p.id + ')">\u5E94\u7528</button>',
          !p.is_default ? '<button class="btn btn-secondary btn-sm" onclick="setDefaultPreset(' + p.id + ')">\u8BBE\u4E3A\u9ED8\u8BA4</button>' : "",
          '<button class="btn btn-ghost btn-sm" onclick="deletePreset(' + p.id + ')" style="color:var(--error);">\u5220\u9664</button>',
          "</div>"
        ].join("");
        grid.appendChild(card);
      });
    }
    function showNewPresetModal2() {
      document.getElementById("preset-modal").classList.add("active");
      document.getElementById("preset-name").focus();
      updatePresetPreview();
    }
    function updatePresetPreview() {
      var settings = window.collectSettingsFromUI();
      var shaderItems = document.getElementById("preset-preview-shader");
      var packItems = document.getElementById("preset-preview-packs");
      if (!shaderItems || !packItems) return;
      var ss = settings.shader_settings || {};
      var shaderHtml = "";
      if (ss.dynamic_light) shaderHtml += '<span class="preset-preview__item enabled">\u52A8\u6001\u5149\u7167 \u2713</span>';
      if (ss.smooth_light) shaderHtml += '<span class="preset-preview__item enabled">\u5E73\u6ED1\u5149\u7167 \u2713</span>';
      if (ss.clouds) shaderHtml += '<span class="preset-preview__item enabled">\u4E91\u5F69\u6E32\u67D3 \u2713</span>';
      shaderHtml += '<span class="preset-preview__item">\u7C92\u5B50 ' + (ss.particles || 0) + "%</span>";
      shaderHtml += '<span class="preset-preview__item">\u8DDD\u79BB ' + (ss.view_distance || 12) + " ch</span>";
      shaderItems.innerHTML = shaderHtml || '<span class="preset-preview__item disabled">\u65E0</span>';
      var packs = settings.resource_packs || [];
      if (packs.length === 0) {
        packItems.innerHTML = '<span class="preset-preview__item disabled">\u6682\u65E0</span>';
      } else {
        var packHtml = "";
        packs.forEach(function(p) {
          packHtml += '<span class="preset-preview__item ' + (p.enabled ? "enabled" : "disabled") + '">' + p.name + (p.enabled ? " \u2713" : "") + "</span>";
        });
        packItems.innerHTML = packHtml;
      }
    }
    function closePresetModal() {
      document.getElementById("preset-modal").classList.remove("active");
      document.getElementById("preset-name").value = "";
      document.getElementById("preset-desc").value = "";
    }
    async function createPreset() {
      var name = document.getElementById("preset-name").value.trim();
      var description = document.getElementById("preset-desc").value.trim();
      if (!name) return;
      try {
        var settings = window.collectSettingsFromUI();
        await window.api("POST", "/presets", {
          name,
          description,
          shader_settings: settings.shader_settings,
          resource_packs: settings.resource_packs
        });
        closePresetModal();
        await loadPresets();
      } catch (err) {
        alert("\u521B\u5EFA\u5931\u8D25: " + err.message);
      }
    }
    async function applyPreset(id) {
      try {
        await window.api("POST", "/presets/" + id + "/apply");
        await window.pullFromServer();
        window.toast("\u9884\u8BBE\u5DF2\u5E94\u7528", "success");
      } catch (err) {
        window.toast("\u5E94\u7528\u5931\u8D25: " + err.message, "error");
      }
    }
    async function setDefaultPreset(id) {
      try {
        await window.api("PUT", "/presets/" + id + "/default");
        await loadPresets();
      } catch (err) {
        alert("\u8BBE\u7F6E\u5931\u8D25: " + err.message);
      }
    }
    async function deletePreset(id) {
      if (!confirm("\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u9884\u8BBE\u5417\uFF1F")) return;
      try {
        await window.api("DELETE", "/presets/" + id);
        await loadPresets();
      } catch (err) {
        alert("\u5220\u9664\u5931\u8D25: " + err.message);
      }
    }
    window.loadPresets = loadPresets;
    window.renderPresets = renderPresets;
    window.showNewPresetModal = showNewPresetModal2;
    window.closePresetModal = closePresetModal;
    window.createPreset = createPreset;
    window.applyPreset = applyPreset;
    window.setDefaultPreset = setDefaultPreset;
    window.deletePreset = deletePreset;
  })();

  // public/js/dashboard/shares.js
  (function() {
    "use strict";
    async function loadShares() {
      try {
        window.showSkeleton("shares");
        var data = await window.api("GET", "/share");
        window.hideSkeleton("shares");
        renderShares(data.shares || []);
      } catch (err) {
        window.hideSkeleton("shares");
        console.error("Load shares error:", err);
      }
    }
    function renderShares(shares) {
      var list = document.getElementById("share-list");
      var empty = document.getElementById("share-empty");
      list.innerHTML = "";
      var active = shares.filter(function(s) {
        return !s.is_expired;
      });
      if (active.length === 0) {
        empty.style.display = "flex";
        list.style.display = "none";
        return;
      }
      empty.style.display = "none";
      list.style.display = "flex";
      active.forEach(function(s) {
        var item = document.createElement("div");
        item.className = "share-item";
        item.innerHTML = [
          '<div class="share-item__info">',
          "<strong>" + s.name + "</strong>",
          "<span>" + (s.description || "\u65E0\u63CF\u8FF0") + " \xB7 " + new Date(s.created_at).toLocaleDateString("zh-CN") + "</span>",
          "</div>",
          '<div class="share-item__actions">',
          `<button class="btn btn-secondary btn-sm" onclick="copyShareLink('` + s.token + `')">\u590D\u5236\u94FE\u63A5</button>`,
          `<button class="btn btn-ghost btn-sm" onclick="deleteShare('` + s.token + `')" style="color:var(--error);">\u5220\u9664</button>`,
          "</div>"
        ].join("");
        list.appendChild(item);
      });
    }
    async function createShare() {
      var name = document.getElementById("share-name").value.trim();
      if (!name) return window.toast("\u8BF7\u8F93\u5165\u5206\u4EAB\u540D\u79F0", "error");
      try {
        var settings = window.collectSettingsFromUI();
        var data = await window.api("POST", "/share", {
          name,
          description: document.getElementById("share-desc").value.trim(),
          shader_settings: settings.shader_settings,
          resource_packs: settings.resource_packs
        });
        navigator.clipboard.writeText(window.location.origin + data.url);
        window.toast("\u5206\u4EAB\u94FE\u63A5\u5DF2\u751F\u6210\u5E76\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01", "success");
        document.getElementById("share-name").value = "";
        document.getElementById("share-desc").value = "";
        await loadShares();
        await window.loadStats();
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    function copyShareLink(token) {
      navigator.clipboard.writeText(window.location.origin + "/share/" + token);
      window.toast("\u94FE\u63A5\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F", "success");
    }
    async function deleteShare(token) {
      if (!confirm("\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u5206\u4EAB\u94FE\u63A5\u5417\uFF1F")) return;
      try {
        await window.api("DELETE", "/share/" + token);
        await loadShares();
        await window.loadStats();
      } catch (err) {
        alert("\u5220\u9664\u5931\u8D25: " + err.message);
      }
    }
    window.loadShares = loadShares;
    window.renderShares = renderShares;
    window.createShare = createShare;
    window.copyShareLink = copyShareLink;
    window.deleteShare = deleteShare;
  })();

  // public/js/dashboard/stats.js
  (function() {
    "use strict";
    var downloadsChart = null;
    async function loadStats() {
      try {
        window.showSkeleton("chart");
        var profileData = await window.api("GET", "/auth/profile").catch(function() {
          return {};
        });
        var downloadsData = await window.api("GET", "/downloads").catch(function() {
          return { downloads: [] };
        });
        var presetsData = await window.api("GET", "/presets").catch(function() {
          return { presets: [] };
        });
        var sharesData = await window.api("GET", "/share").catch(function() {
          return { shares: [] };
        });
        document.getElementById("stat-downloads").textContent = downloadsData.downloads ? downloadsData.downloads.length : "0";
        document.getElementById("stat-presets").textContent = presetsData.presets ? presetsData.presets.length : "0";
        document.getElementById("stat-shares").textContent = sharesData.shares ? sharesData.shares.filter(function(s) {
          return !s.is_expired;
        }).length : "0";
        var user = JSON.parse(localStorage.getItem("user") || "null");
        if (user && user.created_at) {
          var days = Math.floor((Date.now() - new Date(user.created_at)) / 864e5);
          document.getElementById("stat-days").textContent = days + "\u5929";
        }
        renderDownloadChart(downloadsData.downloads || []);
        window.hideSkeleton("chart");
      } catch (err) {
        window.hideSkeleton("chart");
        console.error("Load stats error:", err);
      }
    }
    function renderDownloadChart(downloads) {
      var ctx = document.getElementById("downloads-chart");
      if (!ctx || typeof Chart === "undefined") return;
      if (downloadsChart) {
        try {
          downloadsChart.destroy();
        } catch (e) {
        }
      }
      var last30 = downloads.slice(0, 30).reverse();
      var labels = last30.map(function(d) {
        return new Date(d.downloaded_at).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
      });
      var counts = last30.map(function() {
        return 1;
      });
      downloadsChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "\u4E0B\u8F7D\u6B21\u6570",
            data: counts,
            borderColor: "#0071e3",
            backgroundColor: "rgba(0,113,227,0.08)",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointBackgroundColor: "#0071e3"
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxTicksLimit: 7, color: "var(--text-secondary)", font: { size: 11 } }
            },
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: "var(--text-secondary)", font: { size: 11 } },
              grid: { color: "var(--border-light)" }
            }
          }
        }
      });
    }
    window.loadStats = loadStats;
    window.renderDownloadChart = renderDownloadChart;
  })();

  // public/js/dashboard/announcements.js
  (function() {
    "use strict";
    async function loadAnnouncements() {
      try {
        var data = await window.api("GET", "/announcements");
        renderAnnouncements(data.announcements || []);
      } catch (err) {
        console.error("Load announcements error:", err);
      }
    }
    function renderAnnouncements(announcements) {
      var container = document.getElementById("announcement-banners");
      container.innerHTML = "";
      announcements.forEach(function(a) {
        if (a.dismissed) return;
        var banner = document.createElement("div");
        banner.className = "announcement-banner announcement-banner--" + (a.type || "info");
        banner.innerHTML = [
          '<span class="announcement-banner__text">' + a.title + ": " + a.content + "</span>",
          '<button class="announcement-banner__close" onclick="dismissAnnouncement(' + a.id + ', this)" aria-label="\u5173\u95ED">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
          "</button>"
        ].join("");
        container.appendChild(banner);
      });
    }
    async function dismissAnnouncement(id, btn) {
      try {
        await window.api("POST", "/announcements/" + id + "/dismiss");
        btn.closest(".announcement-banner").remove();
      } catch (err) {
        console.error("Dismiss error:", err);
      }
    }
    window.loadAnnouncements = loadAnnouncements;
    window.renderAnnouncements = renderAnnouncements;
    window.dismissAnnouncement = dismissAnnouncement;
  })();

  // public/js/dashboard/history.js
  (function() {
    "use strict";
    var currentPage = 1;
    async function loadHistory2(page) {
      if (page === void 0) page = 1;
      currentPage = page;
      try {
        window.showSkeleton("history");
        var data = await window.api("GET", "/auth/login-history?page=" + page + "&limit=20");
        window.hideSkeleton("history");
        renderHistory(data.history || [], data.total || 0, data.page || 1, data.totalPages || 1);
      } catch (err) {
        window.hideSkeleton("history");
        console.error("Load history error:", err);
      }
    }
    function renderHistory(history, total, page, totalPages) {
      var tbody = document.getElementById("history-body");
      var table = document.getElementById("history-table");
      var empty = document.getElementById("history-empty");
      var pagination = document.getElementById("history-pagination");
      tbody.innerHTML = "";
      if (history.length === 0) {
        table.style.display = "none";
        empty.style.display = "flex";
        pagination.style.display = "none";
        return;
      }
      empty.style.display = "none";
      table.style.display = "table";
      pagination.style.display = "flex";
      document.getElementById("history-page-info").textContent = "\u7B2C " + page + " / " + totalPages + " \u9875\uFF0C\u5171 " + total + " \u6761";
      history.forEach(function(h) {
        var tr = document.createElement("tr");
        tr.innerHTML = [
          "<td>" + new Date(h.created_at).toLocaleString("zh-CN") + "</td>",
          '<td><code style="font-size:0.8125rem;">' + (h.ip || "\u2014") + "</code></td>",
          '<td><span class="device-badge">' + (h.device_type || "\u672A\u77E5") + "</span></td>",
          "<td>" + (h.browser || "\u672A\u77E5") + "</td>",
          "<td>" + (h.os || "\u672A\u77E5") + "</td>",
          '<td><span class="status-badge ' + (h.success ? "status-badge--success" : "status-badge--error") + '">' + (h.success ? "\u6210\u529F" : "\u5931\u8D25") + "</span></td>"
        ].join("");
        tbody.appendChild(tr);
      });
      document.getElementById("history-prev").disabled = page <= 1;
      document.getElementById("history-next").disabled = page >= totalPages;
    }
    window.loadHistory = loadHistory2;
    window.renderHistory = renderHistory;
  })();

  // public/js/dashboard/sessions.js
  (function() {
    "use strict";
    async function loadSessions2() {
      try {
        window.showSkeleton("sessions");
        var data = await window.api("GET", "/auth/sessions");
        window.hideSkeleton("sessions");
        renderSessions(data.sessions || []);
      } catch (err) {
        window.hideSkeleton("sessions");
        console.error("Load sessions error:", err);
      }
    }
    function renderSessions(sessions) {
      var list = document.getElementById("sessions-list");
      var empty = document.getElementById("sessions-empty");
      list.innerHTML = "";
      var others = sessions.filter(function(s) {
        return !s.is_current;
      });
      if (others.length === 0) {
        empty.style.display = "flex";
        list.style.display = "none";
        return;
      }
      empty.style.display = "none";
      list.style.display = "flex";
      others.forEach(function(s) {
        var item = document.createElement("div");
        item.className = "session-item";
        item.innerHTML = [
          '<div class="session-item__icon">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
          "</div>",
          '<div class="session-item__info">',
          "<strong>" + (s.browser || "\u672A\u77E5\u6D4F\u89C8\u5668") + "</strong>",
          "<span>" + (s.os || "\u672A\u77E5\u7CFB\u7EDF") + " \xB7 " + (s.device_type || "\u672A\u77E5\u8BBE\u5907") + " \xB7 " + new Date(s.created_at).toLocaleDateString("zh-CN") + "</span>",
          "</div>",
          '<button class="btn btn-ghost btn-sm" onclick="revokeSession(' + s.id + ')" style="color:var(--error);">\u540A\u9500</button>'
        ].join("");
        list.appendChild(item);
      });
    }
    async function revokeSession(id) {
      try {
        await window.api("DELETE", "/auth/sessions/" + id);
        window.toast("\u4F1A\u8BDD\u5DF2\u540A\u9500", "success");
        await loadSessions2();
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    async function revokeAllSessions() {
      if (!confirm("\u786E\u5B9A\u8981\u540A\u9500\u6240\u6709\u5176\u4ED6\u4F1A\u8BDD\u5417\uFF1F\u8FD9\u4E0D\u4F1A\u5F71\u54CD\u5F53\u524D\u767B\u5F55\u3002")) return;
      try {
        await window.api("DELETE", "/auth/sessions");
        window.toast("\u6240\u6709\u5176\u4ED6\u4F1A\u8BDD\u5DF2\u540A\u9500", "success");
        await loadSessions2();
      } catch (err) {
        window.toast(err.message, "error");
      }
    }
    window.loadSessions = loadSessions2;
    window.renderSessions = renderSessions;
    window.revokeSession = revokeSession;
    window.revokeAllSessions = revokeAllSessions;
  })();

  // public/js/dashboard/search.js
  (function() {
    "use strict";
    var searchTimeout = null;
    async function handleGlobalSearch(query) {
      var results = document.getElementById("global-search-results");
      if (!query || query.trim().length < 1) {
        results.style.display = "none";
        results.innerHTML = "";
        return;
      }
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async function() {
        try {
          var presets = await window.api("GET", "/presets?name=" + encodeURIComponent(query)).catch(function() {
            return { presets: [] };
          });
          var shares = await window.api("GET", "/share?name=" + encodeURIComponent(query)).catch(function() {
            return { shares: [] };
          });
          var matchedPresets = (presets.presets || []).filter(function(p) {
            return p.name.toLowerCase().includes(query.toLowerCase());
          });
          var matchedShares = (shares.shares || []).filter(function(s) {
            return !s.is_expired && s.name.toLowerCase().includes(query.toLowerCase());
          });
          if (matchedPresets.length === 0 && matchedShares.length === 0) {
            results.innerHTML = '<div class="sidebar-search__no-results">\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u7ED3\u679C</div>';
          } else {
            var html = "";
            if (matchedPresets.length > 0) {
              html += '<div class="sidebar-search__group"><div class="sidebar-search__group-label">\u9884\u8BBE</div>';
              matchedPresets.forEach(function(p) {
                html += `<a class="sidebar-search__result-item" href="#" onclick="event.preventDefault(); showSection('presets'); applyPreset(` + p.id + `); document.getElementById('global-search').value=''; document.getElementById('global-search-results').style.display='none';">` + p.name + "</a>";
              });
              html += "</div>";
            }
            if (matchedShares.length > 0) {
              html += '<div class="sidebar-search__group"><div class="sidebar-search__group-label">\u5206\u4EAB\u94FE\u63A5</div>';
              matchedShares.forEach(function(s) {
                html += `<a class="sidebar-search__result-item" href="#" onclick="event.preventDefault(); showSection('share'); copyShareLink('` + s.token + `'); document.getElementById('global-search').value=''; document.getElementById('global-search-results').style.display='none';">` + s.name + "</a>";
              });
              html += "</div>";
            }
            results.innerHTML = html;
          }
          results.style.display = "flex";
        } catch (err) {
          console.error("Search error:", err);
        }
      }, 300);
    }
    window.handleGlobalSearch = handleGlobalSearch;
  })();

  // public/js/dashboard/config.js
  (function() {
    "use strict";
    async function exportConfig() {
      try {
        var res = await fetch("/api/settings/export", {
          headers: { Authorization: "Bearer " + localStorage.getItem("token") }
        });
        if (!res.ok) throw new Error("\u5BFC\u51FA\u5931\u8D25");
        var data = await res.json();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "bestfps-config-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(url);
        window.toast("\u914D\u7F6E\u5DF2\u5BFC\u51FA", "success");
      } catch (err) {
        window.toast("\u5BFC\u51FA\u5931\u8D25: " + err.message, "error");
      }
    }
    async function importConfigFromFile(input) {
      var file = input.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var data = JSON.parse(text);
        if (!data.shader_settings && !data.resource_packs) {
          window.toast("\u65E0\u6548\u7684\u914D\u7F6E\u6587\u4EF6\u683C\u5F0F", "error");
          input.value = "";
          return;
        }
        if (!confirm("\u786E\u5B9A\u8981\u5BFC\u5165\u6B64\u914D\u7F6E\u6587\u4EF6\u5417\uFF1F\u5F53\u524D\u914D\u7F6E\u5C06\u88AB\u8986\u76D6\u3002")) {
          input.value = "";
          return;
        }
        await window.api("POST", "/settings/import", { data, name: file.name });
        window.toast("\u914D\u7F6E\u5DF2\u5BFC\u5165", "success");
        await window.pullFromServer();
      } catch (err) {
        if (err instanceof SyntaxError) {
          window.toast("JSON \u89E3\u6790\u5931\u8D25\uFF0C\u8BF7\u9009\u62E9\u6709\u6548\u7684 JSON \u6587\u4EF6", "error");
        } else {
          window.toast("\u5BFC\u5165\u5931\u8D25: " + err.message, "error");
        }
      }
      input.value = "";
    }
    window.exportConfig = exportConfig;
    window.importConfigFromFile = importConfigFromFile;
  })();

  // public/js/dashboard/activities.js
  (function() {
    "use strict";
    async function loadActivities() {
      try {
        var skeleton = document.getElementById("activity-feed-skeleton");
        var list = document.getElementById("activity-feed-list");
        var empty = document.getElementById("activity-feed-empty");
        if (skeleton) skeleton.style.display = "flex";
        var data = await window.api("GET", "/auth/activities?limit=10").catch(function() {
          return { activities: [] };
        });
        if (skeleton) skeleton.style.display = "none";
        renderActivities(data.activities || []);
      } catch (err) {
        console.error("Load activities error:", err);
      }
    }
    function renderActivities(activities) {
      var list = document.getElementById("activity-feed-list");
      var empty = document.getElementById("activity-feed-empty");
      if (!list) return;
      list.innerHTML = "";
      if (activities.length === 0) {
        if (empty) empty.style.display = "flex";
        return;
      }
      if (empty) empty.style.display = "none";
      var iconMap = {
        preset_create: { icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', color: "#34c759" },
        preset_update: { icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', color: "#0071e3" },
        preset_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: "#ff3b30" },
        preset_apply: { icon: '<polyline points="20 6 9 17 4 12"/>', color: "#34c759" },
        preset_default: { icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', color: "#ff9500" },
        share_create: { icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>', color: "#5856d6" },
        share_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: "#ff3b30" },
        settings_export: { icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', color: "#0071e3" },
        settings_import: { icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', color: "#34c759" },
        settings_snapshot: { icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', color: "#ff9500" },
        settings_restore: { icon: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>', color: "#5856d6" },
        settings_snapshot_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: "#ff3b30" },
        login: { icon: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>', color: "#34c759" }
      };
      var defaultIcon = { icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', color: "#8e8e93" };
      activities.forEach(function(a) {
        var meta = iconMap[a.event_type] || defaultIcon;
        var timeAgo = getTimeAgo(new Date(a.created_at));
        var item = document.createElement("div");
        item.className = "activity-item";
        item.innerHTML = [
          '<div class="activity-item__icon" style="background: ' + meta.color + "1a; color: " + meta.color + ';">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' + meta.icon + "</svg>",
          "</div>",
          '<div class="activity-item__content">',
          '<span class="activity-item__desc">' + a.description + "</span>",
          '<span class="activity-item__time">' + timeAgo + "</span>",
          "</div>"
        ].join("");
        list.appendChild(item);
      });
    }
    function getTimeAgo(date) {
      var seconds = Math.floor((Date.now() - date.getTime()) / 1e3);
      if (seconds < 60) return "\u521A\u521A";
      var minutes = Math.floor(seconds / 60);
      if (minutes < 60) return minutes + " \u5206\u949F\u524D";
      var hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + " \u5C0F\u65F6\u524D";
      var days = Math.floor(hours / 24);
      if (days < 30) return days + " \u5929\u524D";
      return date.toLocaleDateString("zh-CN");
    }
    window.loadActivities = loadActivities;
    window.renderActivities = renderActivities;
    window.getTimeAgo = getTimeAgo;
  })();

  // public/js/dashboard/versions.js
  (function() {
    "use strict";
    async function loadVersions2() {
      try {
        var skeleton = document.getElementById("versions-skeleton");
        var list = document.getElementById("versions-list");
        var empty = document.getElementById("versions-empty");
        if (skeleton) skeleton.style.display = "flex";
        var data = await window.api("GET", "/settings/versions");
        if (skeleton) skeleton.style.display = "none";
        renderVersions(data.versions || []);
      } catch (err) {
        if (skeleton) skeleton.style.display = "none";
        console.error("Load versions error:", err);
      }
    }
    function renderVersions(versions) {
      var list = document.getElementById("versions-list");
      var empty = document.getElementById("versions-empty");
      if (!list) return;
      var skeleton = document.getElementById("versions-skeleton");
      if (skeleton) skeleton.style.display = "none";
      list.querySelectorAll(".version-item").forEach(function(el) {
        el.remove();
      });
      if (versions.length === 0) {
        if (empty) empty.style.display = "flex";
        return;
      }
      if (empty) empty.style.display = "none";
      versions.forEach(function(v) {
        var item = document.createElement("div");
        item.className = "version-item";
        item.innerHTML = [
          '<div class="version-item__info">',
          '<strong class="version-item__name">' + v.name + "</strong>",
          '<span class="version-item__time">' + new Date(v.created_at).toLocaleString("zh-CN") + "</span>",
          "</div>",
          '<div class="version-item__actions">',
          '<button class="btn btn-primary btn-sm" onclick="restoreVersion(' + v.id + ')">\u6062\u590D</button>',
          '<button class="btn btn-ghost btn-sm" onclick="deleteVersion(' + v.id + ')" style="color:var(--error);">\u5220\u9664</button>',
          "</div>"
        ].join("");
        list.appendChild(item);
      });
    }
    function showSaveSnapshotModal() {
      document.getElementById("snapshot-modal").classList.add("active");
      document.getElementById("snapshot-name").focus();
    }
    function closeSnapshotModal() {
      document.getElementById("snapshot-modal").classList.remove("active");
      document.getElementById("snapshot-name").value = "";
    }
    async function saveSnapshot() {
      var name = document.getElementById("snapshot-name").value.trim() || "\u624B\u52A8\u4FDD\u5B58";
      if (name.length > 50) {
        window.toast("\u5FEB\u7167\u540D\u79F0\u4E0D\u80FD\u8D85\u8FC7 50 \u4E2A\u5B57\u7B26", "error");
        return;
      }
      try {
        await window.api("POST", "/settings/versions", { name });
        closeSnapshotModal();
        window.toast("\u5FEB\u7167\u5DF2\u4FDD\u5B58", "success");
        await loadVersions2();
      } catch (err) {
        window.toast("\u4FDD\u5B58\u5931\u8D25: " + err.message, "error");
      }
    }
    async function restoreVersion(id) {
      if (!confirm("\u786E\u5B9A\u8981\u6062\u590D\u5230\u8BE5\u7248\u672C\u5417\uFF1F\u5F53\u524D\u914D\u7F6E\u5C06\u88AB\u8986\u76D6\u3002")) return;
      try {
        await window.api("POST", "/settings/versions/" + id + "/restore");
        await window.pullFromServer();
        window.toast("\u5DF2\u6062\u590D\u5230\u6307\u5B9A\u7248\u672C", "success");
      } catch (err) {
        window.toast("\u6062\u590D\u5931\u8D25: " + err.message, "error");
      }
    }
    async function deleteVersion(id) {
      if (!confirm("\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u5FEB\u7167\u5417\uFF1F")) return;
      try {
        await window.api("DELETE", "/settings/versions/" + id);
        window.toast("\u5FEB\u7167\u5DF2\u5220\u9664", "success");
        await loadVersions2();
      } catch (err) {
        window.toast("\u5220\u9664\u5931\u8D25: " + err.message, "error");
      }
    }
    window.loadVersions = loadVersions2;
    window.renderVersions = renderVersions;
    window.showSaveSnapshotModal = showSaveSnapshotModal;
    window.closeSnapshotModal = closeSnapshotModal;
    window.saveSnapshot = saveSnapshot;
    window.restoreVersion = restoreVersion;
    window.deleteVersion = deleteVersion;
  })();

  // public/js/dashboard/onboarding.js
  (function() {
    "use strict";
    var ONBOARDING_KEY = "hasSeenOnboarding";
    var currentOnboardingStep = 0;
    var TOTAL_ONBOARDING_STEPS = 4;
    function showOnboardingModal() {
      currentOnboardingStep = 0;
      updateOnboardingUI();
      document.getElementById("onboarding-modal").classList.add("active");
    }
    function skipOnboarding2() {
      localStorage.setItem(ONBOARDING_KEY, "1");
      document.getElementById("onboarding-modal").classList.remove("active");
    }
    function nextOnboardingStep2() {
      if (currentOnboardingStep < TOTAL_ONBOARDING_STEPS - 1) {
        currentOnboardingStep++;
        updateOnboardingUI();
      } else {
        localStorage.setItem(ONBOARDING_KEY, "1");
        document.getElementById("onboarding-modal").classList.remove("active");
        window.toast("\u6B22\u8FCE\u5F00\u59CB\u4F7F\u7528 bestfps\uFF01", "success");
      }
    }
    function prevOnboardingStep2() {
      if (currentOnboardingStep > 0) {
        currentOnboardingStep--;
        updateOnboardingUI();
      }
    }
    function updateOnboardingUI() {
      document.querySelectorAll(".onboarding-step-dot").forEach(function(dot, i) {
        dot.classList.toggle("active", i <= currentOnboardingStep);
        dot.classList.toggle("current", i === currentOnboardingStep);
      });
      document.querySelectorAll(".onboarding-step").forEach(function(step, i) {
        step.style.display = i === currentOnboardingStep ? "block" : "none";
      });
      var prevBtn = document.getElementById("onboarding-prev");
      var nextBtn = document.getElementById("onboarding-next");
      prevBtn.style.display = currentOnboardingStep > 0 ? "inline-flex" : "none";
      nextBtn.textContent = currentOnboardingStep === TOTAL_ONBOARDING_STEPS - 1 ? "\u5F00\u59CB\u4F7F\u7528" : "\u4E0B\u4E00\u6B65";
    }
    window.showOnboardingModal = showOnboardingModal;
    window.skipOnboarding = skipOnboarding2;
    window.nextOnboardingStep = nextOnboardingStep2;
    window.prevOnboardingStep = prevOnboardingStep2;
    window.updateOnboardingUI = updateOnboardingUI;
  })();

  // public/js/dashboard/init.js
  (function() {
    "use strict";
    async function initDashboard() {
      var user = JSON.parse(localStorage.getItem("user") || "null");
      document.getElementById("sidebar-username").textContent = user.username;
      document.getElementById("sidebar-email").textContent = user.email;
      document.getElementById("home-username").textContent = user.username;
      document.getElementById("profile-username").value = user.username;
      document.getElementById("profile-email").value = user.email;
      if (user.avatar) {
        var img = document.getElementById("sidebar-avatar-img");
        img.src = user.avatar;
        img.style.display = "block";
        document.getElementById("avatar-placeholder").style.display = "none";
      }
      var badge = document.getElementById("verified-badge");
      if (user.verified) {
        badge.className = "sidebar-badge badge-verified";
        badge.textContent = "\u5DF2\u9A8C\u8BC1";
      }
      if (user.role === "admin" || user.role === "superadmin") {
        var adminNav = document.getElementById("admin-nav-item");
        if (adminNav) adminNav.style.display = "";
      }
      document.getElementById("avatar-ring").addEventListener("click", function() {
        document.getElementById("avatar-input").click();
      });
      document.getElementById("avatar-input").addEventListener("change", window.uploadAvatar);
      await window.loadProfile();
      await window.pullFromServer();
      await window.loadDownloads();
      await window.loadPresets();
      await window.loadShares();
      await window.loadAnnouncements();
      await window.loadStats();
      await window.loadActivities();
    }
    window.initDashboard = initDashboard;
  })();
})();
//# sourceMappingURL=main.js.map
