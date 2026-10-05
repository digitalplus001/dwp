/**
 * Client portal chat — the receiving/reply side of the admin conversation.
 *
 * Loads history on first tab open, sends replies, appends live messages from
 * the WebSocket (js/realtime.js) and keeps an unread badge on the sidebar.
 */
(function () {
  window.DWP = window.DWP || {};

  const bodyEl = document.getElementById("chat-thread-body");
  const emptyEl = document.getElementById("chat-thread-empty");
  const formEl = document.getElementById("chat-thread-form");
  const inputEl = document.getElementById("chat-thread-input");
  const sendBtn = document.getElementById("chat-thread-send");
  const badgeEl = document.getElementById("nav-messages-badge");

  let loaded = false;
  let sending = false;
  let started = false;

  const esc = function (s) {
    if (typeof DWP !== "undefined" && DWP.escapeHtml) return DWP.escapeHtml(s);
    const el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  };

  function timeLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function setBadge(count) {
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.textContent = count > 99 ? "99+" : String(count);
      badgeEl.hidden = false;
    } else {
      badgeEl.hidden = true;
      badgeEl.textContent = "";
    }
  }

  function scrollDown() {
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function messageNode(msg) {
    const mine = msg.from === "client";
    const wrap = document.createElement("div");
    wrap.className = "chat-msg" + (mine ? " chat-msg--mine" : "");
    wrap.dataset.id = msg.id || "";
    const text = document.createElement("div");
    text.className = "chat-msg__text";
    text.textContent = msg.text || "";
    const meta = document.createElement("div");
    meta.className = "chat-msg__meta";
    meta.textContent = timeLabel(msg.createdAt);
    wrap.appendChild(text);
    wrap.appendChild(meta);
    return wrap;
  }

  function appendMessage(msg, opts) {
    if (!bodyEl) return;
    if (emptyEl) emptyEl.hidden = true;
    if (msg.id && bodyEl.querySelector('.chat-msg[data-id="' + CSS.escape(msg.id) + '"]')) return;
    bodyEl.appendChild(messageNode(msg));
    if (!opts || opts.scroll !== false) scrollDown();
  }

  async function loadHistory() {
    const json = await DWP.apiGet("/api/me/chats/messages");
    if (bodyEl) {
      bodyEl.innerHTML = "";
      const messages = json.messages || [];
      if (messages.length === 0) {
        if (emptyEl) {
          bodyEl.appendChild(emptyEl);
          emptyEl.hidden = false;
        }
      } else {
        for (const msg of messages) appendMessage(msg, { scroll: false });
        scrollDown();
      }
    }
    setBadge(Number(json.unreadFromAdmin || 0));
    loaded = true;
  }

  async function onOpen() {
    if (!DWP.apiReady || !DWP.getToken()) return;
    try {
      await loadHistory();
      if (inputEl) inputEl.focus({ preventScroll: true });
    } catch (err) {
      console.error("[chat] history failed:", err);
      if (bodyEl && emptyEl) {
        bodyEl.innerHTML = "";
        emptyEl.textContent = "Could not load messages. Please try again.";
        emptyEl.hidden = false;
        bodyEl.appendChild(emptyEl);
      }
    }
  }

  formEl?.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (sending) return;
    const text = String(inputEl?.value || "").trim();
    if (!text) return;
    if (window.location.protocol === "file:") return;

    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    try {
      const json = await DWP.apiSend("POST", "/api/me/chats/messages", { text });
      if (json && json.message) appendMessage(json.message);
      if (inputEl) inputEl.value = "";
    } catch (err) {
      console.error("[chat] send failed:", err);
      if (emptyEl && bodyEl && !bodyEl.querySelector(".chat-msg")) {
        emptyEl.textContent = "Message could not be sent. Please try again.";
        emptyEl.hidden = false;
      }
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
      inputEl?.focus({ preventScroll: true });
    }
  });

  inputEl?.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl?.requestSubmit();
    }
  });

  // ── realtime ──────────────────────────────────────────────────────────
  function start() {
    if (started) return;
    started = true;
    if (DWP.realtime) {
      DWP.realtime.start();
      DWP.realtime.on("chat:new", function (data) {
        const msg = data && data.message;
        if (!msg || msg.from !== "admin") return;
        const visible = activeMessagesVisible();
        if (visible) {
          appendMessage(msg);
          // Clear only chat notices, after the matching notification lands
          // (server emits chat:new just before the notification row).
          setTimeout(function () {
            if (DWP.notifications && DWP.notifications.markTypeRead) {
              DWP.notifications.markTypeRead("chat");
            }
          }, 400);
        } else {
          const current = badgeEl && !badgeEl.hidden ? parseInt(badgeEl.textContent, 10) || 0 : 0;
          setBadge(current + 1);
        }
      });
      DWP.realtime.on("_open", function () {
        if (loaded && activeMessagesVisible()) loadHistory().catch(function () {});
      });
    }
  }

  function activeMessagesVisible() {
    const panel = document.getElementById("panel-messages");
    return Boolean(panel && !panel.hidden);
  }

  DWP.portalChat = {
    onOpen: onOpen,
    refreshBadge: function () {
      if (!DWP.apiReady || !DWP.getToken()) return;
      DWP.apiGet("/api/me/chats/messages")
        .then(function (json) {
          setBadge(Number(json.unreadFromAdmin || 0));
        })
        .catch(function () {});
    },
  };

  DWP.onAuth(function (user) {
    if (!user) return;
    start();
    // Initial unread badge (non-blocking).
    setTimeout(function () {
      DWP.portalChat.refreshBadge();
    }, 800);
  });
})();
