(function () {
  const form = document.getElementById("login-form");
  if (!form) return;

  const emailInput = document.getElementById("loginEmail");
  const passwordInput = document.getElementById("loginPassword");
  const toggleBtn = document.getElementById("password-toggle");
  const submitBtn = document.getElementById("login-submit");
  const errorAlert = document.getElementById("login-error");
  const errorMessage = document.getElementById("login-error-message");
  const errorClose = document.getElementById("login-error-close");

  function showError(message) {
    if (!errorAlert || !errorMessage) return;
    errorMessage.textContent = message;
    errorAlert.hidden = false;
  }

  function hideError() {
    if (!errorAlert) return;
    errorAlert.hidden = true;
    if (errorMessage) errorMessage.textContent = "";
  }

  errorClose?.addEventListener("click", hideError);

  toggleBtn?.addEventListener("click", function () {
    if (!passwordInput) return;
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    const icon = toggleBtn.querySelector("i");
    if (icon) {
      icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
    }
    toggleBtn.setAttribute(
      "aria-label",
      show ? "Hide password" : "Show password"
    );
  });

  // True only when the user explicitly submitted the login form on this page.
  // Keeps us from auto-redirecting a restored background session — visiting the
  // login page should always show the login form, not silently skip to dashboard.
  let explicitSignIn = false;

  DWP.onAuth(async function (user) {
    if (!user) return;

    if (!explicitSignIn) {
      // A previous session was restored automatically.  Sign it out so the
      // user is always presented with a fresh login form.
      try { await DWP.signOut(); } catch (e) { /* ignore */ }
      return;
    }

    try {
      DWP.requireFirebase();
      const access = await DWP.getAccountAccess(user);
      if (!access.allowed) {
        await DWP.signOut();
        return;
      }
      window.location.replace(DWP.isAdmin(user) ? "admin.html" : "dashboard.html");
    } catch (e) {
      console.warn(e);
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    hideError();

    const email = DWP.normalizeLoginEmail(emailInput?.value || "");
    const password = passwordInput?.value || "";

    if (!email) {
      showError("Please enter your email or admin username.");
      return;
    }

    if (!password) {
      showError("Please enter your password.");
      return;
    }

    if (window.location.protocol === "file:") {
      showError(
        "Open this site via a local server (python3 -m http.server 3000), not as a file link."
      );
      return;
    }

    try {
      DWP.requireFirebase();
    } catch (err) {
      showError(err.message);
      return;
    }

    const btnText = submitBtn?.querySelector(".btn-text");
    if (submitBtn) {
      submitBtn.disabled = true;
      if (btnText) btnText.textContent = "Signing In...";
    }

    try {
      explicitSignIn = true;
      const cred = await DWP.signInWithPassword(email, password);
      const user = cred.user;
      const access = await DWP.getAccountAccess(user);

      if (!access.allowed) {
        await DWP.signOut();
        showError(DWP.getLoginBlockMessage(access));
        if (submitBtn) {
          submitBtn.disabled = false;
          if (btnText) btnText.textContent = "Sign In";
        }
        return;
      }

      window.location.replace(DWP.isAdmin(user) ? "admin.html" : "dashboard.html");
    } catch (err) {
      explicitSignIn = false; // allow the onAuth guard to fire again on retry
      console.error(err);
      if (err && err.code === "auth/email-not-verified") {
        window.location.replace("verify.html?email=" + encodeURIComponent(email));
        return;
      }
      showError(DWP.getAuthErrorMessage(err.code));
      if (submitBtn) {
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = "Sign In";
      }
    }
  });
})();
