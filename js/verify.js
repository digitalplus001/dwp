/**
 * Email verification (OTP) page — verifies the code issued at signup,
 * then starts a normal session and continues to the portal.
 */
(function () {
  const form = document.getElementById("verify-form");
  if (!form) return;

  const emailInput = document.getElementById("verify-email");
  const codeInput = document.getElementById("verify-code");
  const errorEl = document.getElementById("verify-error");
  const successEl = document.getElementById("verify-success");
  const submitBtn = document.getElementById("verify-submit");
  const resendBtn = document.getElementById("verify-resend");
  const resendNote = document.getElementById("verify-resend-note");

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message || "";
    errorEl.hidden = !message;
    if (successEl) successEl.hidden = true;
  }

  function showSuccess(message, devOtp) {
    if (!successEl) return;
    let html = DWP.escapeHtml(message);
    if (devOtp) {
      html += '<span class="verify-dev-otp">Dev mode (no email provider): your code is ' + DWP.escapeHtml(String(devOtp)) + "</span>";
    }
    successEl.innerHTML = html;
    successEl.hidden = false;
    if (errorEl) errorEl.hidden = true;
  }

  // Prefill from ?email= or the signup form.
  try {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("email") || sessionStorage.getItem("signupEmail") || "";
    if (prefill && emailInput && !emailInput.value) {
      emailInput.value = prefill;
      if (codeInput) codeInput.focus();
    }
  } catch (_) { /* ignore */ }

  // Digits only.
  codeInput?.addEventListener("input", function () {
    codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
  });

  // Resend cooldown.
  let cooldownTimer = null;
  function startCooldown(seconds) {
    let left = seconds;
    const tick = function () {
      if (resendNote) resendNote.textContent = "Resend available in " + left + "s";
      if (resendBtn) resendBtn.disabled = true;
      if (left <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        if (resendNote) resendNote.textContent = "Didn't get the code?";
        if (resendBtn) resendBtn.disabled = false;
        return;
      }
      left -= 1;
    };
    tick();
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(tick, 1000);
  }

  resendBtn?.addEventListener("click", async function () {
    const email = String(emailInput?.value || "").trim().toLowerCase();
    if (!email) {
      showError("Enter your email address first.");
      return;
    }
    resendBtn.disabled = true;
    try {
      const json = await DWP.apiSend("POST", "/api/auth/resend-otp", { email });
      showSuccess(json.message || "A new code has been sent.", json.devOtp);
      startCooldown(60);
    } catch (err) {
      showError(err.message || DWP.getAuthErrorMessage(err.code));
      if (resendBtn) resendBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    showError("");

    const email = String(emailInput?.value || "").trim().toLowerCase();
    const code = String(codeInput?.value || "").trim();

    if (!email) {
      showError("Please enter your email address.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      showError("Enter the 6-digit verification code from your email.");
      codeInput?.focus();
      return;
    }
    if (window.location.protocol === "file:") {
      showError("Open this site via a local server (http://localhost:3000), not as a file link.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying...";
    }

    try {
      DWP.requireFirebase();
      const json = await DWP.apiSend("POST", "/api/auth/verify-otp", { email, code });
      if (json.token) DWP.setToken(json.token);
      try { sessionStorage.removeItem("signupEmail"); } catch (_) { /* ignore */ }
      showSuccess("Email verified! Your application is now queued for admin review — redirecting you to your application status…");
      setTimeout(function () {
        window.location.replace("dashboard.html");
      }, 900);
    } catch (err) {
      console.error(err);
      showError(err.message || DWP.getAuthErrorMessage(err.code));
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Verify & Continue";
      }
      codeInput?.select();
    }
  });
})();
