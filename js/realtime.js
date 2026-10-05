/**
 * Shared WebSocket client (/ws) — live chat + notification push.
 *
 * Depends on js/api.js (DWP.getToken). Safe to load on any page: it never
 * connects until start() is called (from the portal's auth handler). When the
 * connection fails the portals fall back to their existing polling.
 *
 *   DWP.realtime.on("chat:new", function (data) { ... });
 *   DWP.realtime.on("notification:new", function (data) { ... });
 *   DWP.realtime.start();
 */
(function () {
  window.DWP = window.DWP || {};

  const listeners = Object.create(null);
  let socket = null;
  let shouldRun = false;
  let retryMs = 1000;
  let started = false;

  function wsUrl() {
    try {
      const token = DWP.getToken && DWP.getToken();
      if (!token) return null;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return proto + "//" + window.location.host + "/ws?token=" + encodeURIComponent(token);
    } catch (_) {
      return null;
    }
  }

  function dispatch(type, data) {
    const cbs = listeners[type];
    if (!cbs) return;
    for (const cb of cbs) {
      try {
        cb(data);
      } catch (err) {
        console.error("[realtime] listener error:", err);
      }
    }
  }

  function scheduleReconnect() {
    if (!shouldRun) return;
    const delay = retryMs;
    retryMs = Math.min(retryMs * 2, 15000);
    setTimeout(function () {
      if (shouldRun) open();
    }, delay);
  }

  function open() {
    if (!shouldRun || (socket && socket.readyState <= 1)) return;
    const url = wsUrl();
    if (!url) {
      scheduleReconnect();
      return;
    }
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (_) {
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.onopen = function () {
      retryMs = 1000;
      dispatch("_open", {});
    };
    ws.onmessage = function (event) {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (!msg || !msg.type) return;
      if (msg.type === "hello") dispatch("_open", msg.data || {});
      dispatch(msg.type, msg.data || {});
    };
    ws.onerror = function () {
      /* onclose handles retry */
    };
    ws.onclose = function () {
      if (socket === ws) socket = null;
      dispatch("_close", {});
      scheduleReconnect();
    };
  }

  DWP.realtime = {
    start: function () {
      shouldRun = true;
      if (!started) {
        started = true;
        // Refresh on tab focus: re-sync if the socket died while hidden.
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible" && shouldRun && (!socket || socket.readyState > 1)) {
            retryMs = 1000;
            open();
          }
        });
      }
      if (!socket || socket.readyState > 1) open();
    },
    stop: function () {
      shouldRun = false;
      retryMs = 1000;
      if (socket) {
        try {
          socket.close();
        } catch (_) { /* ignore */ }
        socket = null;
      }
    },
    on: function (type, cb) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(cb);
    },
    off: function (type, cb) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (fn) {
        return fn !== cb;
      });
    },
    get connected() {
      return Boolean(socket && socket.readyState === 1);
    },
  };
})();
