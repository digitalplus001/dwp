/**
 * DWP REST client — replaces the Firebase compat SDK.
 *
 * Exposes:
 *   DWP.apiReady / DWP.firebaseReady   legacy readiness flags
 *   DWP.getToken / setToken            JWT storage (dwp:token)
 *   DWP.apiRequest/Get/Send/Upload     raw HTTP helpers (throw {code,message})
 *   DWP.FieldValue.*                   Firestore-style write sentinels
 *   DWP.db                             Firestore-shaped shim routed to the API
 *
 * The shim lets the existing UI code keep calling
 *   DWP.db.collection("applications").doc(id).update(patch)
 *   DWP.db.collection("applications").orderBy("createdAt","desc").get()
 *   docRef.onSnapshot(cb, err)
 * without knowing about HTTP.
 */
(function () {
  window.DWP = window.DWP || {};

  var TOKEN_KEY = "dwp:token";

  DWP.apiReady = true;
  DWP.firebaseReady = true; // legacy flag — the auth layer is ready

  // ── token storage ──────────────────────────────────────────────────────
  DWP.getToken = function () {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  };
  DWP.setToken = function (token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      /* storage unavailable */
    }
  };

  // ── HTTP ───────────────────────────────────────────────────────────────
  DWP.apiRequest = async function (method, path, opts) {
    opts = opts || {};
    var headers = {};
    var token = DWP.getToken();
    if (token) headers.Authorization = "Bearer " + token;

    var body;
    if (opts.form) {
      body = opts.form; // FormData — browser sets multipart boundary
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    var res;
    try {
      res = await fetch(path, { method: method, headers: headers, body: body });
    } catch (e) {
      var netErr = new Error(
        "Network error. Check your connection and try again."
      );
      netErr.code = "auth/network-request-failed";
      throw netErr;
    }

    var json = null;
    try {
      json = await res.json();
    } catch (e) {
      /* non-JSON body */
    }

    if (!res.ok) {
      // The site must be served by the Express server (which also serves /api).
      // Live Server / python -m http.server etc. return 404/405 for API calls.
      if ((res.status === 404 || res.status === 405) && path.indexOf("/api/") === 0) {
        const apiErr = new Error(
          "The backend API is not available on this address. Open the site via " +
            "http://localhost:3000 (cd server && npm start), not via Live Server or a static file server."
        );
        apiErr.code = "api/not-served";
        apiErr.status = res.status;
        throw apiErr;
      }
      var err = new Error(
        (json && json.error && json.error.message) ||
          "Request failed (" + res.status + ")."
      );
      err.code = (json && json.error && json.error.code) || "unknown";
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  };

  DWP.apiGet = function (path) {
    return DWP.apiRequest("GET", path);
  };
  DWP.apiSend = function (method, path, body) {
    return DWP.apiRequest(method, path, { body: body });
  };
  DWP.apiUpload = function (path, formData) {
    return DWP.apiRequest("POST", path, { form: formData });
  };

  // ── write sentinels (understood by the server patch engine) ────────────
  DWP.FieldValue = {
    serverTimestamp: function () {
      return { __serverTimestamp: true };
    },
    arrayUnion: function (value) {
      return { __arrayUnion: Array.isArray(value) ? value : [value] };
    },
    arrayRemove: function (value) {
      return { __arrayRemove: Array.isArray(value) ? value : [value] };
    },
    delete: function () {
      return { __delete: true };
    },
    increment: function (n) {
      return { __increment: n };
    },
  };

  // ── snapshot shapes (matching Firestore's compat API) ──────────────────
  function makeSnapshot(items) {
    var docs = items.map(function (item) {
      return {
        id: item.id,
        exists: true,
        data: function () {
          return item.data;
        },
      };
    });
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs,
      forEach: function (cb) {
        docs.forEach(function (d, i) {
          cb(d, i);
        });
      },
    };
  }

  function docSnapshot(id, data) {
    return {
      id: id,
      exists: data !== null && data !== undefined,
      data: function () {
        return data || null;
      },
    };
  }

  // ── role routing: admin token → /api/admin, client → /api/me ──────────
  function isAdminContext() {
    var user = DWP.auth && DWP.auth.currentUser;
    return !!(user && DWP.isAdmin && DWP.isAdmin(user));
  }

  async function fetchApplicationList() {
    var json = await DWP.apiGet("/api/admin/applications");
    return makeSnapshot(
      (json.applications || []).map(function (a) {
        return { id: a.id, data: a.data };
      })
    );
  }

  // ── document reference ─────────────────────────────────────────────────
  function DocumentRef(collection, id) {
    this.collectionName = collection;
    this.id = id;
  }

  DocumentRef.prototype.get = async function () {
    if (this.collectionName === "applications") {
      if (isAdminContext()) {
        try {
          var json = await DWP.apiGet(
            "/api/admin/applications/" + encodeURIComponent(this.id)
          );
          return docSnapshot(json.id, json.data);
        } catch (e) {
          if (e.status === 404) return docSnapshot(this.id, null);
          throw e;
        }
      }
      // Clients may only read their own application document.
      var own = DWP.auth && DWP.auth.currentUser;
      if (!own || String(own.uid) !== String(this.id)) {
        return docSnapshot(this.id, null);
      }
      var me = await DWP.apiGet("/api/me/application");
      return docSnapshot(me.id, me.data);
    }

    if (this.collectionName === "chats") {
      try {
        var chat = await DWP.apiGet(
          "/api/admin/chats/" + encodeURIComponent(this.id)
        );
        return {
          id: this.id,
          exists: !!chat.exists,
          data: function () {
            return chat;
          },
        };
      } catch (e) {
        if (e.status === 404) return docSnapshot(this.id, null);
        throw e;
      }
    }

    if (this.collectionName === "siteConfig") {
      var cfg = await DWP.apiGet("/api/site/deposit-wallets");
      var wallets = cfg.depositWallets || {};
      return {
        id: this.id,
        exists: Object.keys(wallets).length > 0,
        data: function () {
          return wallets;
        },
      };
    }

    return docSnapshot(this.id, null);
  };

  DocumentRef.prototype.update = async function (patch) {
    if (this.collectionName === "applications") {
      if (isAdminContext()) {
        return DWP.apiSend(
          "PATCH",
          "/api/admin/applications/" + encodeURIComponent(this.id),
          patch
        );
      }
      return DWP.apiSend("PATCH", "/api/me/application", patch);
    }
    if (this.collectionName === "chats") {
      // Server derives lastMessage from stored messages — nothing to write.
      return { ok: true };
    }
    throw new Error("update() is not supported on " + this.collectionName);
  };

  DocumentRef.prototype.set = async function (data) {
    if (this.collectionName === "siteConfig") {
      return DWP.apiSend("PUT", "/api/site/deposit-wallets", data);
    }
    if (this.collectionName === "applications") {
      if (isAdminContext()) {
        return DWP.apiSend(
          "PATCH",
          "/api/admin/applications/" + encodeURIComponent(this.id),
          data
        );
      }
      return DWP.apiSend("PATCH", "/api/me/application", data);
    }
    throw new Error("set() is not supported on " + this.collectionName);
  };

  /** Live listener — polls the API every 4 s (replaces onSnapshot). */
  DocumentRef.prototype.onSnapshot = function (onNext, onError) {
    var self = this;
    var stopped = false;
    var timer = null;

    async function tick() {
      if (stopped) return;
      try {
        var snap = await self.get();
        if (!stopped && onNext) onNext(snap);
      } catch (e) {
        if (stopped) return;
        if (onError) onError(e);
        else console.warn("[DWP] onSnapshot error:", e);
      }
    }

    tick();
    timer = setInterval(tick, 4000);

    return function () {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    };
  };

  /** Sub-collection (e.g. chats/{id}/messages). */
  DocumentRef.prototype.collection = function (subName) {
    var parent = this;
    return {
      add: async function (msg) {
        if (parent.collectionName === "chats") {
          var json = await DWP.apiSend(
            "POST",
            "/api/admin/chats/" + encodeURIComponent(parent.id) + "/messages",
            { text: String((msg && msg.text) || "") }
          );
          return { id: json.id };
        }
        throw new Error("add() is not supported on " + parent.collectionName + "/" + subName);
      },
    };
  };

  // ── collection reference ───────────────────────────────────────────────
  function CollectionRef(name) {
    this.name = name;
  }

  CollectionRef.prototype.doc = function (id) {
    return new DocumentRef(this.name, id);
  };

  CollectionRef.prototype.orderBy = function () {
    var self = this;
    return {
      limit: function () {
        return { get: function () { return self.get(); } };
      },
      get: function () {
        return self.get();
      },
    };
  };

  CollectionRef.prototype.get = async function () {
    if (this.name === "applications") {
      if (isAdminContext()) return fetchApplicationList();
      // A plain client reading the collection sees only its own document.
      var own = DWP.auth && DWP.auth.currentUser;
      if (!own) return makeSnapshot([]);
      var me = await DWP.apiGet("/api/me/application");
      return me && me.data ? makeSnapshot([{ id: me.id, data: me.data }]) : makeSnapshot([]);
    }
    return makeSnapshot([]);
  };

  /** Legacy query filter — returns an empty result set (unused at runtime). */
  CollectionRef.prototype.where = function () {
    var empty = function () {
      return makeSnapshot([]);
    };
    return { limit: function () { return { get: empty }; }, get: empty };
  };

  DWP.db = {
    collection: function (name) {
      return new CollectionRef(name);
    },
  };
})();
