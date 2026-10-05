(function () {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const config = window.SITE_CONFIG || {};
  const contactEmail = (config.contactEmail || "").trim().toLowerCase();
  const emailConfigured =
    contactEmail &&
    contactEmail !== "your.email@gmail.com" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);

  const submitBtn = document.getElementById("submit-btn");
  const successEl = document.getElementById("form-success");
  const submitErrorEl = document.getElementById("form-submit-error");
  const llcNameGroup = document.getElementById("llc-name-group");
  const messageField = document.getElementById("message");
  const charCount = document.getElementById("char-count");
  const countrySelect = document.getElementById("addressCountry");

  if (!emailConfigured && submitErrorEl) {
    submitErrorEl.textContent =
      "Set your email in js/config.js (contactEmail) before using this form.";
    submitErrorEl.hidden = false;
  }

  if (countrySelect && window.COUNTRIES) {
    window.COUNTRIES.forEach(function (country) {
      const opt = document.createElement("option");
      opt.value = country;
      opt.textContent = country;
      countrySelect.appendChild(opt);
    });
  }

  function getFormData() {
    return {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      address: {
        line1: form.elements["address.line1"].value.trim(),
        line2: form.elements["address.line2"].value.trim(),
        city: form.elements["address.city"].value.trim(),
        state: form.elements["address.state"].value.trim(),
        zip: form.elements["address.zip"].value.trim(),
        country: form.elements["address.country"].value
      },
      clientType: form.clientType.value,
      hasLLCTrust: getRadio("hasLLCTrust"),
      LLCTrustName: form.LLCTrustName.value.trim(),
      currentAllocation: form.currentAllocation.value,
      hasXRP: getRadio("hasXRP"),
      digitalAssets: form.digitalAssets.value.trim(),
      message: form.message.value.trim(),
      acceptedComms: form.acceptedComms.checked
    };
  }

  function getRadio(name) {
    const checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : "";
  }

  function setError(name, msg) {
    const el = form.querySelector('[data-error="' + name + '"]');
    if (el) el.textContent = msg || "";

    let field =
      form.querySelector('[name="' + name + '"]') ||
      form.querySelector("#" + name);
    if (name === "acceptedComms") field = form.acceptedComms;
    if (field) field.classList.toggle("error", !!msg);
  }

  function clearErrors() {
    form.querySelectorAll("[data-error]").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll(".error").forEach(function (el) {
      el.classList.remove("error");
    });
    if (submitErrorEl) submitErrorEl.hidden = true;
  }

  function showSubmitError(msg) {
    if (submitErrorEl) {
      submitErrorEl.textContent = msg;
      submitErrorEl.hidden = false;
      submitErrorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function toggleLlcName() {
    const show = getRadio("hasLLCTrust") === "Yes";
    if (llcNameGroup) llcNameGroup.hidden = !show;
  }

  form.querySelectorAll('input[name="hasLLCTrust"]').forEach(function (r) {
    r.addEventListener("change", toggleLlcName);
  });

  if (messageField && charCount) {
    const updateCount = function () {
      charCount.textContent = String(messageField.value.length);
    };
    messageField.addEventListener("input", updateCount);
    updateCount();
  }

  function validate() {
    clearErrors();
    const data = getFormData();
    let ok = true;

    if (!data.firstName) {
      setError("firstName", "First name is required");
      ok = false;
    }
    if (!data.lastName) {
      setError("lastName", "Last name is required");
      ok = false;
    }
    if (!data.email) {
      setError("email", "Email is required");
      ok = false;
    } else if (!/\S+@\S+\.\S+/.test(data.email)) {
      setError("email", "Email is invalid");
      ok = false;
    }
    if (!data.phone) {
      setError("phone", "Phone number is required");
      ok = false;
    } else if (!/^\+?[\d\s-]{10,}$/.test(data.phone.replace(/\s+/g, ""))) {
      setError("phone", "Please enter a valid phone number");
      ok = false;
    }
    if (!data.clientType) {
      setError("clientType", "Please select a client type");
      ok = false;
    }
    if (!data.hasLLCTrust) {
      setError("hasLLCTrust", "Please select an option");
      ok = false;
    }
    if (!data.currentAllocation) {
      setError("currentAllocation", "Please select an allocation range");
      ok = false;
    }
    if (!data.hasXRP) {
      setError("hasXRP", "Please select an option");
      ok = false;
    }
    if (!data.digitalAssets) {
      setError("digitalAssets", "Please list your digital assets");
      ok = false;
    }
    if (!data.message) {
      setError("message", "Message is required");
      ok = false;
    }
    if (!data.acceptedComms) {
      setError("acceptedComms", "You must accept the communications policy");
      ok = false;
    }

    return ok;
  }

  async function submitToYourEmail(data) {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(data)
    });

    let result;
    try {
      result = await response.json();
    } catch (e) {
      throw new Error(
        "Could not send your message. Open the site via http://localhost (not a file:// link)."
      );
    }

    if (response.ok && result && result.success) {
      return;
    }

    throw new Error(
      (result && result.message) || "Could not send your message. Please try again."
    );
  }

  function completeSuccess(data) {
    if (successEl) successEl.hidden = false;
    sessionStorage.setItem("contactSubmitted", "true");
    sessionStorage.setItem("contactFormData", JSON.stringify(data));

    setTimeout(function () {
      window.location.href = "thank.html";
    }, 1000);
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!validate()) return;

    if (!emailConfigured) {
      showSubmitError(
        "Set your email in js/config.js (contactEmail), then reload this page."
      );
      return;
    }

    if (window.location.protocol === "file:") {
      showSubmitError(
        "Run a local server (e.g. python3 -m http.server 3000) so the form can send email."
      );
      return;
    }

    const data = getFormData();
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    if (successEl) successEl.hidden = true;
    if (submitErrorEl) submitErrorEl.hidden = true;

    try {
      await submitToYourEmail(data);
      completeSuccess(data);
    } catch (err) {
      console.error("Contact form error:", err);
      showSubmitError(
        err.message || "Failed to send. Please try again in a moment."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Next";
    }
  });
})();
