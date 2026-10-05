const jwt = require("jsonwebtoken");
const { WebSocketServer } = require("ws");
const config = require("../config");
const { loadUser, isAdminUser } = require("../middleware/auth");

let wss = null;
// userId (string) -> Set of sockets
const clients = new Map();

function send(ws, type, data) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ type, data }));
    } catch (_) {
      /* socket closing */
    }
  }
}

function register(ws) {
  const key = ws.userId;
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(ws);
}

function unregister(ws) {
  const set = clients.get(ws.userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) clients.delete(ws.userId);
  }
}

function emitToUser(userId, type, data) {
  const set = clients.get(String(userId));
  if (!set) return 0;
  let sent = 0;
  for (const ws of set) {
    send(ws, type, data);
    sent += 1;
  }
  return sent;
}

function emitToAdmins(type, data) {
  let sent = 0;
  for (const [, set] of clients) {
    for (const ws of set) {
      if (ws.isAdmin) {
        send(ws, type, data);
        sent += 1;
      }
    }
  }
  return sent;
}

function rejectUpgrade(socket, code) {
  try {
    socket.write(`HTTP/1.1 ${code} ${code === 401 ? "Unauthorized" : "Error"}\r\nConnection: close\r\n\r\n`);
  } catch (_) {
    /* already closed */
  }
  socket.destroy();
}

/** Attaches the /ws WebSocket endpoint to the HTTP server. */
function attach(server) {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch (_) {
      /* ignore */
    }
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    (async () => {
      try {
        const url = new URL(req.url, "http://localhost");
        const token = url.searchParams.get("token");
        if (!token) return rejectUpgrade(socket, 401);
        const payload = jwt.verify(token, config.jwt.secret);
        const user = await loadUser(payload.sub);
        if (!user) return rejectUpgrade(socket, 401);

        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.userId = String(user.id);
          ws.isAdmin = isAdminUser(user);
          ws.isAlive = true;
          register(ws);
          ws.on("pong", () => {
            ws.isAlive = true;
          });
          ws.on("message", (raw) => {
            let msg = null;
            try {
              msg = JSON.parse(String(raw));
            } catch (_) {
              return;
            }
            if (msg && msg.type === "ping") send(ws, "pong", { t: Date.now() });
          });
          ws.on("close", () => unregister(ws));
          ws.on("error", () => unregister(ws));
          send(ws, "hello", {
            userId: ws.userId,
            isAdmin: ws.isAdmin,
            serverTime: new Date().toISOString(),
          });
        });
      } catch (_) {
        rejectUpgrade(socket, 401);
      }
    })();
  });

  // Heartbeat: terminate dead connections.
  const interval = setInterval(() => {
    for (const [, set] of clients) {
      for (const ws of set) {
        if (ws.isAlive === false) {
          unregister(ws);
          try {
            ws.terminate();
          } catch (_) {
            /* ignore */
          }
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (_) {
          /* ignore */
        }
      }
    }
  }, 30000);
  if (interval.unref) interval.unref();
}

function stats() {
  let sockets = 0;
  for (const set of clients) sockets += set[1].size;
  return { users: clients.size, sockets };
}

module.exports = { attach, emitToUser, emitToAdmins, stats };
