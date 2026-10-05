(function () {
  const US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
    "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
    "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
    "Wisconsin", "Wyoming"
  ];

  const form = document.getElementById("signup-form");
  if (!form) return;

  const config = window.SITE_CONFIG || {};
  const contactEmail = (config.contactEmail || "").trim().toLowerCase();
  const emailConfigured =
    contactEmail &&
    contactEmail !== "your.email@gmail.com" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

  let currentStep = 1;
  /** True while submitSignup runs — blocks onAuth from signing out mid-write. */
  let signupInProgress = false;

  function fetchWithTimeout(url, options, ms) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (controller) controller.abort();
    }, ms);
    const opts = Object.assign({}, options || {});
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts).finally(function () {
      clearTimeout(timer);
    });
  }

  const progressBar = document.getElementById("progress-bar");
  const progressWrap = document.getElementById("progress-wrap");
  const formAlert = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");
  const reviewPreview = document.getElementById("review-preview");

  const countryList = document.getElementById("country-options");
  const stateList = document.getElementById("state-options");

  if (window.COUNTRIES && countryList) {
    window.COUNTRIES.forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c;
      countryList.appendChild(opt);
    });
  }

  if (stateList) {
    US_STATES.forEach(function (st) {
      const opt = document.createElement("option");
      opt.value = st;
      stateList.appendChild(opt);
    });
  }

  const signatureDate = document.getElementById("signatureDate");
  if (signatureDate) {
    signatureDate.value = new Date().toISOString().split("T")[0];
  }

  document.querySelectorAll(".password-toggle-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-toggle");
      const input = document.getElementById(id);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.innerHTML = show
        ? '<i class="bi bi-eye-slash"></i>'
        : '<i class="bi bi-eye"></i>';
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  function setError(name, msg) {
    const el = form.querySelector('[data-error="' + name + '"]');
    const field = form.querySelector('[name="' + name + '"]') || document.getElementById(name);
    if (el) el.textContent = msg || "";
    if (field) field.classList.toggle("is-invalid", !!msg);
  }

  function clearErrors() {
    form.querySelectorAll("[data-error]").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll(".is-invalid").forEach(function (el) {
      el.classList.remove("is-invalid");
    });
  }

  function getData() {
    return {
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      password: form.password.value,
      passwordConfirm: form.passwordConfirm.value,
      fullName: form.fullName.value.trim(),
      dob: form.dob.value,
      streetAddress: form.streetAddress.value.trim(),
      country: form.country.value.trim(),
      state: form.state.value.trim(),
      local: form.local.value.trim(),
      ssn: form.ssn.value.trim(),
      llcName: form.llcName.value.trim(),
      formationState: form.formationState.value.trim(),
      formationDate: form.formationDate.value,
      ownershipType: form.ownershipType.value,
      primaryAsset: form.primaryAsset.value,
      assetValue: form.assetValue.value,
      useCase: form.useCase.value.trim(),
      printedName: form.printedName.value.trim(),
      signatureDate: form.signatureDate.value,
      authorization: form.authorization.checked
    };
  }

  function validateStep(step) {
    clearErrors();
    const d = getData();
    let ok = true;

    if (step === 1) {
      if (!d.email) {
        setError("email", "Email is required");
        ok = false;
      } else if (!/\S+@\S+\.\S+/.test(d.email)) {
        setError("email", "Enter a valid email");
        ok = false;
      }
      if (!d.phone) {
        setError("phone", "Phone is required");
        ok = false;
      }
      if (!d.password || d.password.length < 8) {
        setError("password", "Password must be at least 8 characters");
        ok = false;
      }
      if (d.password !== d.passwordConfirm) {
        setError("passwordConfirm", "Passwords do not match");
        ok = false;
      }
      if (!d.fullName) {
        setError("fullName", "Full legal name is required");
        ok = false;
      }
      if (!d.dob) {
        setError("dob", "Date of birth is required");
        ok = false;
      }
      if (!d.streetAddress) {
        setError("streetAddress", "Street address is required");
        ok = false;
      }
      if (!d.country) {
        setError("country", "Country is required");
        ok = false;
      }
      if (!d.local) {
        setError("local", "City is required");
        ok = false;
      }
      if (!d.ssn) {
        setError("ssn", "SSN or EIN is required");
        ok = false;
      }
    }

    if (step === 2) {
      if (!d.llcName) {
        setError("llcName", "LLC name is required");
        ok = false;
      }
      if (!d.formationState) {
        setError("formationState", "State of formation is required");
        ok = false;
      }
      if (!d.formationDate) {
        setError("formationDate", "Formation date is required");
        ok = false;
      }
      if (!d.ownershipType) {
        setError("ownershipType", "Select ownership type");
        ok = false;
      }
      if (!d.primaryAsset) {
        setError("primaryAsset", "Select primary asset");
        ok = false;
      }
      if (!d.assetValue || Number(d.assetValue) < 0) {
        setError("assetValue", "Enter estimated asset value");
        ok = false;
      }
      if (!d.useCase) {
        setError("useCase", "LLC use case is required");
        ok = false;
      }
    }

    if (step === 3) {
      if (!d.printedName) {
        setError("printedName", "Printed name is required");
        ok = false;
      }
      if (!d.authorization) {
        setError("authorization", "You must accept the authorization");
        ok = false;
      }
    }

    return ok;
  }

  function escapeHtml(value) {
    if (typeof DWP !== "undefined" && DWP.escapeHtml) {
      return DWP.escapeHtml(value);
    }
    const el = document.createElement("div");
    el.textContent = value == null ? "" : String(value);
    return el.innerHTML;
  }

  function buildReview() {
    const d = getData();
    reviewPreview.innerHTML =
      '<div class="preview-section">' +
      '<h4>Step 1: Personal Information</h4>' +
      '<div class="preview-grid">' +
      previewRow("Email", d.email) +
      previewRow("Phone", d.phone) +
      previewRow("Full Name", d.fullName) +
      previewRow("Date of Birth", d.dob) +
      previewRow("Street Address", d.streetAddress) +
      previewRow("Country", d.country) +
      previewRow("State", d.state || "—") +
      previewRow("City", d.local) +
      previewRow("SSN/EIN", d.ssn ? "***-**-" + String(d.ssn).slice(-4) : "—") +
      "</div></div>" +
      '<div class="preview-section" style="margin-top:20px">' +
      '<h4>Step 2: LLC Information</h4>' +
      '<div class="preview-grid">' +
      previewRow("LLC Name", d.llcName) +
      previewRow("Formation State", d.formationState) +
      previewRow("Formation Date", d.formationDate) +
      previewRow("Ownership Type", d.ownershipType) +
      previewRow("Primary Asset", d.primaryAsset) +
      previewRow("Asset Value", d.assetValue) +
      previewRow("Use Case", d.useCase) +
      "</div></div>" +
      '<div class="preview-section" style="margin-top:20px">' +
      '<h4>Step 3: Authorization</h4>' +
      '<div class="preview-grid">' +
      previewRow("Printed Name", d.printedName) +
      previewRow("Date", d.signatureDate) +
      '<div class="full-span"><strong>Authorization:</strong> ' +
      (d.authorization
        ? '<span style="color:green">&#10003; Agreed</span>'
        : '<span style="color:#dc3545">&#10007; Not agreed</span>') +
      "</div></div></div>";
  }

  function previewRow(label, value) {
    return (
      "<div><strong>" +
      escapeHtml(label) +
      ":</strong> " +
      escapeHtml(value || "—") +
      "</div>"
    );
  }

  function goToStep(step) {
    currentStep = step;
    form.querySelectorAll("[data-step-panel]").forEach(function (panel) {
      panel.hidden = Number(panel.getAttribute("data-step-panel")) !== step;
    });
    document.querySelectorAll(".step-indicator .step").forEach(function (el) {
      const n = Number(el.getAttribute("data-step"));
      el.classList.toggle("active", n === step);
      el.classList.toggle("completed", n < step);
    });
    if (progressBar) {
      progressBar.style.width = (step / 3) * 100 + "%";
    }
    if (progressWrap) {
      progressWrap.setAttribute("aria-valuenow", String(step));
    }
    if (step === 3) {
      const printed = document.getElementById("printedName");
      if (printed && !printed.value) {
        printed.value = form.fullName.value.trim();
      }
      buildReview();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.querySelectorAll("[data-next]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const next = Number(btn.getAttribute("data-next"));
      if (validateStep(currentStep)) goToStep(next);
    });
  });

  form.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goToStep(Number(btn.getAttribute("data-back")));
    });
  });

  function showAlert(type, msg) {
    if (!formAlert) return;
    formAlert.className = "alert alert-" + type;
    formAlert.textContent = msg;
    formAlert.hidden = false;
  }

  /** Registration payload — the server creates the application document. */
  function registerPayload(data) {
    return {
      email: data.email,
      password: data.password,
      phone: data.phone,
      fullName: data.fullName,
      dob: data.dob,
      streetAddress: data.streetAddress,
      country: data.country,
      state: data.state,
      city: data.local,
      ssn: data.ssn,
      llcName: data.llcName,
      formationState: data.formationState,
      formationDate: data.formationDate,
      ownershipType: data.ownershipType,
      primaryAsset: data.primaryAsset,
      assetValue: data.assetValue,
      useCase: data.useCase,
      printedName: data.printedName,
      signatureDate: data.signatureDate,
      authorization: data.authorization === true
    };
  }

  async function submitSignup(data) {
    DWP.requireFirebase();
    signupInProgress = true;
    try {
      return await DWP.register(registerPayload(data));
    } finally {
      signupInProgress = false;
    }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validateStep(3)) return;

    if (window.location.protocol === "file:") {
      showAlert(
        "danger",
        "Run a local server (python3 -m http.server 3000) to submit the form."
      );
      return;
    }

    const data = getData();
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    formAlert.hidden = true;

    try {
      if (!DWP.apiReady) {
        showAlert(
          "danger",
          "Backend API is not loaded. Start the server (cd server && npm start) and reload."
        );
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Application";
        return;
      }

      const result = await submitSignup(data);
      sessionStorage.setItem("signupSubmitted", "true");
      sessionStorage.setItem("signupEmail", data.email);
      if (result && result.requiresVerification) {
        showAlert(
          "success",
          "Almost done! Enter the verification code we just emailed you to activate your account."
        );
        setTimeout(function () {
          window.location.href =
            "verify.html?email=" + encodeURIComponent(data.email);
        }, 1200);
        return;
      }
      showAlert(
        "success",
        "Application submitted! Redirecting — you can sign in after our team approves your account."
      );
      setTimeout(function () {
        window.location.href = "account-pending.html";
      }, 1500);
    } catch (err) {
      console.error(err);
      showAlert("danger", err.message || "Form not submitted. Please try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Application";
    }
  });

  if (typeof DWP !== "undefined" && DWP.onAuth) {
    DWP.onAuth(async function (user) {
      if (!user) return;
      // Never auto-redirect on signup page — if a restored session fires here,
      // sign it out so the visitor always sees a fresh signup form.
      if (signupInProgress) return;
      try { await DWP.signOut(); } catch (e) { /* ignore */ }
    });
  }
})();
