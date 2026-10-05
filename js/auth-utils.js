/**
 * Shared auth helpers (REST/JWT session — replaces Firebase Auth).
 *
 * Relies on js/api.js being loaded first. Keeps the same global surface the
 * pages already use: DWP.onAuth, DWP.signInWithPassword, DWP.signOut,
 * DWP.getAccountAccess, DWP.resolveApplicationDoc, DWP.isAdmin, …
 */
(function () {
  window.DWP = window.DWP || {};

  var listeners = [];
  var currentUser = null;

  DWP.escapeHtml = function (value) {
    const el = document.createElement("div");
    el.textContent = value == null ? "" : String(value);
    return el.innerHTML;
  };

  DWP.requireFirebase = function () {
    if (!DWP.apiReady) {
      throw new Error(
        "Backend API is not loaded. Add <script src=\"js/api.js\"></script> " +
          "to this page and start the server (cd server && npm start)."
      );
    }
  };

  DWP.getAuthErrorMessage = function (code) {
    switch (code) {
      case "auth/user-not-found":
        return "No account found with this email address. Please check your email or sign up.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again or reset your password.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/invalid-credential":
        return "Invalid email or password. Please check your credentials and try again.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Try signing in instead.";
      case "auth/weak-password":
        return "Password must be at least 8 characters.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a few minutes before trying again.";
      case "auth/email-not-verified":
        return "Your email address has not been verified yet. Enter the code we sent you to activate your account.";
      case "auth/invalid-otp":
        return "Incorrect verification code. Please check your email and try again.";
      case "auth/otp-expired":
        return "This verification code has expired. Request a new one.";
      case "auth/too-many-attempts":
        return "Too many incorrect attempts. Please request a new code.";
      case "auth/resend-cooldown":
        return "Please wait a moment before requesting another code.";
      case "auth/resend-failed":
        return "Could not send the code right now. Please try again.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled. Contact support.";
      case "api/not-served":
        return (
          "The backend is not reachable from this page. Open the site via " +
          "http://localhost:3000 after starting the server (cd server && npm start), " +
          "instead of Live Server or a plain static server."
        );
      default:
        return "Something went wrong. Please try again or contact support.";
    }
  };

  /** Maps username "admin" (or configured aliases) to the real email. */
  DWP.normalizeLoginEmail = function (input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    const map =
      (window.SITE_CONFIG && window.SITE_CONFIG.adminUsernames) || {};
    if (map[lower]) return map[lower];
    return raw;
  };

  DWP.isAdmin = function (user) {
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase();
    const list = (window.SITE_CONFIG && window.SITE_CONFIG.adminEmails) || [];
    return list.some(function (e) {
      return String(e).toLowerCase() === email;
    });
  };

  // ── user object (Firebase-compatible shape) ────────────────────────────
  function presentUser(json) {
    if (!json) return null;
    return {
      uid: String(json.id),
      email: json.email || "",
      displayName: json.displayName || json.fullName || "",
      photoURL: null,
      emailVerified: true,
      role: json.role || "client",
      getIdToken: async function () {
        return DWP.getToken();
      },
    };
  }

  DWP.auth = { currentUser: null };

  function emit(user) {
    currentUser = user;
    DWP.auth.currentUser = user;
    try {
      if (user) localStorage.setItem("dwp:session", "1");
      else localStorage.removeItem("dwp:session");
    } catch (e) {
      /* storage unavailable */
    }
    listeners.slice().forEach(function (cb) {
      try {
        cb(user);
      } catch (e) {
        console.error(e);
      }
    });
  }

  // ── restore session on load (defers first onAuth callback until the
  //    server has answered, mirroring Firebase's auth-state semantics) ────
  var initPromise = (async function () {
    if (!DWP.apiReady) return;
    if (!DWP.getToken()) {
      emit(null);
      return;
    }
    try {
      const session = await DWP.apiGet("/api/auth/session");
      emit(presentUser(session.user));
    } catch (e) {
      DWP.setToken("");
      emit(null);
    }
  })();

  /**
   * Subscribe to auth state. Fires once the initial session check resolves,
   * then on every change. Returns an unsubscribe function.
   */
  DWP.onAuth = function (callback) {
    if (!DWP.apiReady) {
      callback(null);
      return function () {};
    }
    var fired = false;
    var wrapped = function (user) {
      fired = true;
      callback(user);
    };
    listeners.push(wrapped);
    initPromise.then(function () {
      if (!fired) {
        fired = true;
        try {
          callback(currentUser);
        } catch (e) {
          console.error(e);
        }
      }
    });
    return function () {
      listeners = listeners.filter(function (l) {
        return l !== wrapped;
      });
    };
  };

  // ── application document ───────────────────────────────────────────────
  DWP.resolveApplicationDoc = async function (uid) {
    DWP.requireFirebase();
    const id = String(uid || "").trim();
    if (!id) {
      return { ref: null, id: "", exists: false, data: null };
    }
    const ref = DWP.db.collection("applications").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      return { ref: ref, id: snap.id, exists: true, data: snap.data() };
    }
    return { ref: ref, id: id, exists: false, data: null };
  };

  DWP.fetchApplication = async function (uid) {
    DWP.requireFirebase();
    const resolved = await DWP.resolveApplicationDoc(uid);
    return resolved.exists ? resolved.data : null;
  };

  /** Returns whether the user may use the client dashboard (admins always allowed). */
  DWP.getAccountAccess = async function (user) {
    if (!user) {
      return { allowed: false, reason: "not_signed_in", status: null, data: null };
    }
    if (DWP.isAdmin(user)) {
      return { allowed: true, reason: "admin", status: "admin", data: null };
    }
    try {
      return await DWP.apiGet("/api/me/access");
    } catch (e) {
      if (e.status === 401) {
        return { allowed: false, reason: "not_signed_in", status: null, data: null };
      }
      return { allowed: false, reason: "error", status: null, data: null };
    }
  };

  DWP.getLoginBlockMessage = function (access) {
    const reason = access && access.reason;
    if (reason === "pending") {
      return (
        "Your account is pending review. Our team will email you once your " +
        "application is approved and you can sign in."
      );
    }
    if (reason === "rejected") {
      return (
        "Your application was not approved. Please visit our contact page if you have questions."
      );
    }
    if (reason === "no_application") {
      return (
        "No application was found for this account. Please complete sign-up or contact our support team."
      );
    }
    return (
      "You cannot sign in yet. Please contact our support team for assistance."
    );
  };

  // ── session actions ────────────────────────────────────────────────────
  DWP.signOut = function () {
    DWP.setToken("");
    emit(null);
    return Promise.resolve();
  };

  /** Sign in with email + password (REST). Returns { user }. */
  DWP.signInWithPassword = async function (email, password) {
    DWP.requireFirebase();
    const normalized = String(email || "").trim().toLowerCase();
    const json = await DWP.apiSend("POST", "/api/auth/login", {
      email: normalized,
      password: password,
    });
    DWP.setToken(json.token);
    emit(presentUser(json.user));
    return { user: DWP.auth.currentUser };
  };

  /** Create the account + application document in one server call. */
  DWP.register = async function (fields) {
    DWP.requireFirebase();
    return DWP.apiSend("POST", "/api/auth/register", fields);
  };

  /** Request a password reset link (server always reports success). */
  DWP.forgotPassword = async function (email) {
    DWP.requireFirebase();
    return DWP.apiSend("POST", "/api/auth/forgot-password", {
      email: String(email || "").trim().toLowerCase(),
    });
  };
})();
