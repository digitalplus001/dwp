/**
 * Notification bell + dropdown for both portals.
 *
 * Markup hook: <div data-notif-widget="client|admin"></div>
 *   client — bell + list + "mark all read"
 *   admin  — same, plus a "New notification" composer (broadcast)
 *
 * Data: GET/POST /api/notifications, POST /api/admin/notifications (admin).
 * Live updates: js/realtime.js event "notification:new" (falls back to focus).
 */
(function () {
  window.DWP = window.DWP || {};

  const container = document.querySelector("[data-notif-widget]");
  if (!container) return;

  const mode = container.getAttribute("data-notif-widget") === "admin" ? "admin" : "client";
  let unreadCount = 0;
  let items = [];
  let panelOpen = false;
  let started = false;
  let lastPushAt = 0; // newest known state came from a WS push / local write

  const esc = function (s) {
    if (typeof DWP !== "undefined" && DWP.escapeHtml) return DWP.escapeHtml(s);
    const el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  };

  const TYPE_ICONS = {
    deposit: "bi-arrow-down-circle-fill",
    withdrawal: "bi-arrow-up-circle-fill",
    chat: "bi-chat-dots-fill",
    signup: "bi-person-plus-fill",
    contact: "bi-envelope-fill",
    system: "bi-bell-fill",
  };

  function relTime(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return "just now";
    if (secs < 3600) return Math.floor(secs / 60) + "m ago";
    if (secs < 86400) return Math.floor(secs / 3600) + "h ago";
    if (secs < 604800) return Math.floor(secs / 86400) + "d ago";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  container.classList.add("notif-widget--ready");
  container.innerHTML =
    '<button type="button" class="notif-bell" id="notif-bell-btn" aria-haspopup="true" aria-expanded="false" aria-label="Notifications">' +
    '<i class="bi bi-bell"></i>' +
    '<span class="notif-bell__badge" id="notif-bell-badge" hidden></span>' +
    "</button>" +
    '<div class="notif-panel" id="notif-panel" role="dialog" aria-label="Notifications" hidden>' +
    '<div class="notif-panel__head">' +
    "<strong>Notifications</strong>" +
    '<button type="button" class="notif-panel__mark" id="notif-mark-all">Mark all read</button>' +
    "</div>" +
    '<div class="notif-panel__list" id="notif-list"></div>' +
    '<div class="notif-panel__foot">' +
    (mode === "admin" ? '<button type="button" class="notif-compose-btn" id="notif-compose-open"><i class="bi bi-pencil-square"></i> New notification</button>' : '<span class="notif-panel__hint">You are all caught up.</span>') +
    "</div>" +
    "</div>";

  const bellBtn = document.getElementById("notif-bell-btn");
  const badgeEl = document.getElementById("notif-bell-badge");
  const panelEl = document.getElementById("notif-panel");
  const listEl = document.getElementById("notif-list");
  const markAllBtn = document.getElementById("notif-mark-all");

  function setBadge(n) {
    unreadCount = Math.max(0, Number(n) || 0);
    if (!badgeEl) return;
    if (unreadCount > 0) {
      badgeEl.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badgeEl.hidden = false;
      bellBtn?.classList.add("notif-bell--unread");
    } else {
      badgeEl.hidden = true;
      badgeEl.textContent = "";
      bellBtn?.classList.remove("notif-bell--unread");
    }
  }

  function itemNode(n) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "notif-item" + (n.readAt ? "" : " notif-item--unread");
    el.dataset.id = n.id;
    el.innerHTML =
      '<span class="notif-item__icon notif-item__icon--' + esc(n.type || "system") + '"><i class="bi ' + (TYPE_ICONS[n.type] || TYPE_ICONS.system) + '"></i></span>' +
      '<span class="notif-item__main">' +
      '<span class="notif-item__title">' + esc(n.title || "") + "</span>" +
      (n.body ? '<span class="notif-item__body">' + esc(n.body) + "</span>" : "") +
      '<span class="notif-item__time">' + esc(relTime(n.createdAt)) + "</span>" +
      "</span>" +
      (n.readAt ? "" : '<span class="notif-item__dot" aria-label="Unread"></span>');
    el.addEventListener("click", function () {
      onItem(n);
    });
    return el;
  }

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (items.length === 0) {
      listEl.innerHTML = '<p class="notif-empty"><i class="bi bi-bell-slash"></i> No notifications yet.</p>';
      return;
    }
    for (const n of items) listEl.appendChild(itemNode(n));
  }

  function onItem(n) {
    if (!n.readAt) {
      n.readAt = new Date().toISOString();
      setBadge(unreadCount - 1);
      DWP.apiSend("POST", "/api/notifications/read", { ids: [n.id] }).catch(function () {});
    }
    close();
    navigate(n.link || "");
  }

  function navigate(link) {
    if (!link) return;
    if (link.indexOf("chat:") === 0) {
      window.dispatchEvent(new CustomEvent("dwp:open-chat", { detail: { uid: link.slice(5) } }));
      return;
    }
    if (link.charAt(0) === "#") {
      const tab = link.slice(1);
      const nav = document.querySelector('[data-tab="' + tab + '"]');
      if (nav) {
        nav.click();
        return;
      }
      window.location.hash = link;
      return;
    }
    window.location.href = link;
  }

  function open() {
    if (!panelEl) return;
    panelOpen = true;
    panelEl.hidden = false;
    bellBtn?.setAttribute("aria-expanded", "true");
    refresh().catch(function () {});
  }

  function close() {
    if (!panelEl) return;
    panelOpen = false;
    panelEl.hidden = true;
    bellBtn?.setAttribute("aria-expanded", "false");
  }

  bellBtn?.addEventListener("click", function (e) {
    e.stopPropagation();
    if (panelOpen) close();
    else open();
  });
  document.addEventListener("click", function (e) {
    if (panelOpen && panelEl && !panelEl.contains(e.target) && e.target !== bellBtn && !bellBtn?.contains(e.target)) {
      close();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panelOpen) close();
  });

  markAllBtn?.addEventListener("click", function (e) {
    e.stopPropagation();
    DWP.apiSend("POST", "/api/notifications/read", {})
      .then(function (json) {
        lastPushAt = Date.now();
        setBadge(json.unreadCount);
        for (const n of items) if (!n.readAt) n.readAt = new Date().toISOString();
        renderList();
      })
      .catch(function () {});
  });

  // ── data ───────────────────────────────────────────────────────────────
  async function refresh() {
    const startedAt = Date.now();
    const json = await DWP.apiGet("/api/notifications");
    // A WebSocket push (or local write) landed while this GET was in flight:
    // it is newer than this snapshot, so don't clobber it.
    if (lastPushAt > startedAt) return;
    items = json.items || [];
    setBadge(json.unreadCount);
    renderList();
  }

  // ── admin composer ─────────────────────────────────────────────────────
  let composer = null;
  function ensureComposer() {
    if (composer || mode !== "admin") return composer;
    composer = document.createElement("div");
    composer.className = "notif-compose";
    composer.hidden = true;
    composer.innerHTML =
      '<form class="notif-compose__card" id="notif-compose-form">' +
      '<div class="notif-compose__head"><strong>Send notification</strong><button type="button" class="notif-compose__close" id="notif-compose-close" aria-label="Close">&times;</button></div>' +
      '<label class="notif-compose__label" for="notif-compose-title">Title</label>' +
      '<input type="text" id="notif-compose-title" class="notif-compose__input" maxlength="120" placeholder="e.g. Maintenance window" required>' +
      '<label class="notif-compose__label" for="notif-compose-body">Message</label>' +
      '<textarea id="notif-compose-body" class="notif-compose__textarea" rows="4" maxlength="500" placeholder="Optional details shown under the title"></textarea>' +
      '<label class="notif-compose__label" for="notif-compose-to">Recipients</label>' +
      '<select id="notif-compose-to" class="notif-compose__input"><option value="">All clients</option></select>' +
      '<p class="notif-compose__msg" id="notif-compose-msg" hidden></p>' +
      '<div class="notif-compose__actions"><button type="submit" class="notif-compose__send" id="notif-compose-send">Send notification</button></div>' +
      "</form>";
    document.body.appendChild(composer);

    document.getElementById("notif-compose-close")?.addEventListener("click", function () {
      composer.hidden = true;
    });
    composer.addEventListener("click", function (e) {
      if (e.target === composer) composer.hidden = true;
    });
    document.getElementById("notif-compose-form")?.addEventListener("submit", sendComposer);
    return composer;
  }

  async function loadRecipients() {
    const select = document.getElementById("notif-compose-to");
    if (!select || select.options.length > 1) return;
    try {
      const json = await DWP.apiGet("/api/admin/applications");
      const seen = {};
      for (const app of json.applications || []) {
        const email = (app.data && app.data.email) || "";
        if (!email || seen[email]) continue;
        seen[email] = true;
        const opt = document.createElement("option");
        opt.value = app.id;
        opt.textContent = ((app.data && app.data.fullName) || email) + " — " + email;
        select.appendChild(opt);
      }
    } catch (_) { /* fall back to all clients */ }
  }

  async function sendComposer(e) {
    e.preventDefault();
    const title = document.getElementById("notif-compose-title");
    const body = document.getElementById("notif-compose-body");
    const to = document.getElementById("notif-compose-to");
    const msg = document.getElementById("notif-compose-msg");
    const btn = document.getElementById("notif-compose-send");
    if (!title || !title.value.trim()) return;
    if (btn) btn.disabled = true;
    try {
      const payload = { title: title.value.trim(), body: body ? body.value.trim() : "" };
      if (to && to.value) payload.userIds = [to.value];
      const json = await DWP.apiSend("POST", "/api/admin/notifications", payload);
      if (msg) {
        msg.textContent = "Sent to " + json.sent + " recipient" + (json.sent === 1 ? "" : "s") + ".";
        msg.className = "notif-compose__msg notif-compose__msg--ok";
        msg.hidden = false;
      }
      title.value = "";
      if (body) body.value = "";
      setTimeout(function () {
        composer.hidden = true;
        if (msg) msg.hidden = true;
      }, 1200);
    } catch (err) {
      if (msg) {
        msg.textContent = err.message || "Could not send. Please try again.";
        msg.className = "notif-compose__msg notif-compose__msg--err";
        msg.hidden = false;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  document.getElementById("notif-compose-open")?.addEventListener("click", function (e) {
    e.stopPropagation();
    const el = ensureComposer();
    if (el) {
      el.hidden = false;
      loadRecipients();
      document.getElementById("notif-compose-title")?.focus();
    }
  });

  // ── start ──────────────────────────────────────────────────────────────
  function start() {
    if (started) return;
    started = true;
    refresh().catch(function () {});

    if (DWP.realtime) {
      DWP.realtime.start();
      DWP.realtime.on("notification:new", function (data) {
        lastPushAt = Date.now();
        if (data.notification) {
          items.unshift(data.notification);
          if (items.length > 50) items.pop();
          if (panelOpen) renderList();
        }
        setBadge(data.unreadCount);
      });
      DWP.realtime.on("_open", function () {
        refresh().catch(function () {});
      });
    }

    // Fallback when the WebSocket is down.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") refresh().catch(function () {});
    });
    setInterval(function () {
      if (!DWP.realtime || !DWP.realtime.connected) refresh().catch(function () {});
    }, 45000);
  }

  /**
   * Marks unread notifications of one type as read (used by the chat thread
   * so an open conversation only clears chat notices, not deposits etc).
   */
  function markTypeRead(type) {
    const ids = items
      .filter(function (n) {
        return n.type === type && !n.readAt;
      })
      .map(function (n) {
        return n.id;
      });
    if (!ids.length) return;
    ids.forEach(function (id) {
      const n = items.find(function (x) {
        return x.id === id;
      });
      if (n) n.readAt = new Date().toISOString();
    });
    setBadge(unreadCount - ids.length);
    if (panelOpen) renderList();
    lastPushAt = Date.now();
    DWP.apiSend("POST", "/api/notifications/read", { ids: ids }).catch(function () {});
  }

  DWP.notifications = { refresh: refresh, open: open, close: close, markTypeRead: markTypeRead };

  DWP.onAuth(function (user) {
    if (!user) {
      close();
      return;
    }
    start();
  });
})();
