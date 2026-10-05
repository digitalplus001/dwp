(function () {
  const form = document.getElementById("reset-form");
  if (!form) return;

  const passwordInput = document.getElementById("reset-password");
  const confirmInput = document.getElementById("reset-password-confirm");
  const submitBtn = document.getElementById("reset-submit");
  const errorEl = document.getElementById("reset-error");
  const successEl = document.getElementById("reset-success");

  const token = new URLSearchParams(window.location.search).get("token") || "";

  function showError(msg) {
    if (successEl) successEl.hidden = true;
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function showSuccess(msg) {
    if (errorEl) errorEl.hidden = true;
    if (!successEl) return;
    successEl.textContent = msg;
    successEl.hidden = false;
  }

  if (!token) {
    showError(
      "This reset link is invalid or incomplete. Request a new link from the forgot password page."
    );
    if (submitBtn) submitBtn.disabled = true;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;
    if (successEl) successEl.hidden = true;

    const password = passwordInput ? passwordInput.value : "";
    const confirm = confirmInput ? confirmInput.value : "";

    if (!token) {
      showError(
        "This reset link is invalid or incomplete. Request a new link from the forgot password page."
      );
      return;
    }
    if (!password || password.length < 8) {
      showError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      showError("Passwords do not match. Please try again.");
      return;
    }

    const originalLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Updating...";
    }

    try {
      await DWP.apiSend("POST", "/api/auth/reset-password", {
        token: token,
        password: password
      });
      showSuccess("Password updated. Redirecting to sign in...");
      setTimeout(function () {
        window.location.href = "login.html";
      }, 2500);
    } catch (err) {
      console.error(err);
      showError(
        err && err.message
          ? err.message
          : "Could not update your password. Please request a new link."
      );
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel || "Update Password";
      }
    }
  });
})();
