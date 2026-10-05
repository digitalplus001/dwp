(function () {
  const titleEl = document.getElementById("pending-title");
  const leadEl = document.getElementById("pending-lead");
  const messageEl = document.getElementById("pending-message");
  const emailLine = document.getElementById("pending-email-line");
  const emailEl = document.getElementById("pending-email");

  const submitted = sessionStorage.getItem("signupSubmitted") === "true";
  const signupEmail = sessionStorage.getItem("signupEmail");

  if (submitted && signupEmail && emailEl && emailLine) {
    emailEl.textContent = signupEmail;
    emailLine.hidden = false;
    sessionStorage.removeItem("signupSubmitted");
    sessionStorage.removeItem("signupEmail");
  }

  if (!DWP.onAuth) return;

  DWP.onAuth(async function (user) {
    if (!user) return;

    try {
      DWP.requireFirebase();
      const access = await DWP.getAccountAccess(user);

      if (access.allowed) {
        window.location.replace(DWP.isAdmin(user) ? "admin.html" : "dashboard.html");
        return;
      }

      await DWP.signOut();

      if (access.reason === "rejected" && titleEl && leadEl && messageEl) {
        titleEl.textContent = "Application Not Approved";
        leadEl.textContent =
          "Your application was reviewed and could not be approved at this time.";
        messageEl.innerHTML =
          "<p>Please <a href=\"contact.html\">contact our support team</a> if you believe this is an error or would like more information.</p>";
      }
    } catch (e) {
      console.warn(e);
    }
  });
})();
