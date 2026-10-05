(function () {
  const form = document.getElementById("forgot-form");
  if (!form) return;

  const emailInput = document.getElementById("forgot-email");
  const submitBtn = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById("forgot-error");
  const successEl = document.getElementById("forgot-success");

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

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (errorEl) errorEl.hidden = true;
    if (successEl) successEl.hidden = true;

    const email = (emailInput?.value || "").trim();
    if (!email) {
      showError("Please enter your email address.");
      return;
    }

    if (window.location.protocol === "file:") {
      showError("Use a local web server (python3 -m http.server 3000).");
      return;
    }

    try {
      DWP.requireFirebase();
    } catch (err) {
      showError(err.message);
      return;
    }

    const originalLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
    }

    try {
      await DWP.forgotPassword(email);
      showSuccess(
        "If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder."
      );
      setTimeout(function () {
        window.location.href = "login.html";
      }, 4000);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-email") {
        showError("Invalid email address format.");
      } else {
        showError(DWP.getAuthErrorMessage(err.code));
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel || "Send Reset Link";
      }
    }
  });
})();
