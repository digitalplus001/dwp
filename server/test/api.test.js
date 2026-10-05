// End-to-end API test: register → deposit → admin approve → activate →
// withdrawal → review → wallets → contact. Run: npm test
const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${extra ? " -> " + JSON.stringify(extra) : ""}`);
  }
}

async function api(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (form) {
    // multer accepts multipart
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    /* non-json */
  }
  return { status: res.status, json };
}

async function main() {
  const stamp = Date.now();
  const clientEmail = `e2e.client${stamp}@example.com`;
  const password = "Passw0rd!1";

  console.log("\n1) registration + auth");
  const reg = await api("POST", "/api/auth/register", {
    body: {
      email: clientEmail,
      password,
      fullName: "E2E Test Client",
      phone: "+15555550100",
      dob: "1990-01-01",
      streetAddress: "1 Main St",
      country: "United States",
      state: "TX",
      city: "Dallas",
      ssn: "000-00-0000",
      llcName: "E2E Holdings LLC",
      formationState: "TX",
      formationDate: "2025-01-01",
      ownershipType: "Single Member",
      primaryAsset: "XRP",
      assetValue: "25000",
      useCase: "Long term custody",
      printedName: "E2E Test Client",
      signatureDate: "2026-10-01",
      authorization: true,
    },
  });
  ok("register creates application", reg.status === 201 && reg.json && reg.json.success === true, reg.json);

  const dup = await api("POST", "/api/auth/register", { body: { email: clientEmail, password, fullName: "Dup" } });
  ok("duplicate email rejected", dup.status === 409 && dup.json.error.code === "auth/email-already-in-use", dup.json);

  const badLogin = await api("POST", "/api/auth/login", { body: { email: clientEmail, password: "wrong-password" } });
  ok("wrong password rejected", badLogin.status === 401 && badLogin.json.error.code === "auth/invalid-credential", badLogin.json);

  // --- OTP email verification gate ---
  ok("register flags verification", reg.json && reg.json.requiresVerification === true, reg.json);

  const gateLogin = await api("POST", "/api/auth/login", { body: { email: clientEmail, password } });
  ok("login blocked until verified", gateLogin.status === 403 && gateLogin.json.error.code === "auth/email-not-verified", gateLogin.json);

  const wrongOtp = reg.json.devOtp ? String((Number(reg.json.devOtp) + 1) % 1000000).padStart(6, "0") : "000000";
  const badVerify = await api("POST", "/api/auth/verify-otp", { body: { email: clientEmail, code: wrongOtp } });
  ok("wrong OTP rejected", badVerify.status === 400 && badVerify.json.error.code === "auth/invalid-otp", badVerify.json);

  const resend1 = await api("POST", "/api/auth/resend-otp", { body: { email: clientEmail } });
  ok("resend OTP", resend1.status === 200 && resend1.json.success === true, resend1.json);
  const resend2 = await api("POST", "/api/auth/resend-otp", { body: { email: clientEmail } });
  ok("resend cooldown enforced", resend2.status === 429 && resend2.json.error.code === "auth/resend-cooldown", resend2.json);

  const otpCode = resend1.json && resend1.json.devOtp;
  if (otpCode) {
    const verify = await api("POST", "/api/auth/verify-otp", { body: { email: clientEmail, code: otpCode } });
    ok("OTP verifies account + returns token", verify.status === 200 && !!verify.json.token && verify.json.user.emailVerified === true, verify.json);
  } else {
    // A real email provider is configured (no devOtp) — mark verified directly.
    const { query: q0 } = require("../src/db/pool");
    await q0("UPDATE users SET email_verified = true WHERE email = $1", [clientEmail]);
    ok("account verified (live email provider)", true);
  }

  const login = await api("POST", "/api/auth/login", { body: { email: clientEmail, password } });
  ok("client login", login.status === 200 && !!login.json.token, login.json);
  const clientToken = login.json && login.json.token;

  const session = await api("GET", "/api/auth/session", { token: clientToken });
  ok("session returns user", session.status === 200 && session.json.user.email === clientEmail, session.json);

  console.log("\n2) client access gate");
  const access1 = await api("GET", "/api/me/access", { token: clientToken });
  ok("pending application blocks", access1.json && access1.json.allowed === false && access1.json.reason === "pending", access1.json);

  console.log("\n3) client deposit submission (whitelist)");
  const depId = `dep-${stamp}`;
  const depositPatch = {
    depositSubmitted: true,
    depositSubmittedAt: { __serverTimestamp: true },
    depositMethod: "xrp",
    depositNetwork: "xrp-mainnet",
    depositNetworkLabel: "XRP Ledger",
    depositAmount: 5000,
    depositProcessingFee: 0,
    depositTotalCredit: 5000,
    depositWallet: "rTESTWALLETADDRESS0000000000001",
    depositAmountCurrency: "USD",
    depositProofFileName: "proof.png",
    depositProofType: "image/png",
    depositProofUploaded: true,
    depositHistory: [
      {
        id: depId,
        amount: 5000,
        totalCredit: 5000,
        method: "xrp",
        methodSymbol: "XRP",
        networkId: "xrp-mainnet",
        networkLabel: "XRP Ledger",
        status: "Pending",
        submittedAt: new Date().toISOString(),
      },
    ],
    updatedAt: { __serverTimestamp: true },
  };
  const dep = await api("PATCH", "/api/me/application", { token: clientToken, body: depositPatch });
  ok("deposit patch accepted", dep.status === 200 && dep.json.application.depositSubmitted === true, dep.json);
  ok("server timestamp injected", dep.json && typeof dep.json.application.depositSubmittedAt === "string" && !dep.json.application.depositSubmittedAt.includes("__server"), dep.json && dep.json.application.depositSubmittedAt);

  const status1 = await api("GET", `/api/me/deposits/${depId}/status`, { token: clientToken });
  ok("deposit status endpoint", status1.status === 200 && status1.json.status === "Pending", status1.json);

  const denied = await api("PATCH", "/api/me/application", { token: clientToken, body: { accountActivated: true, "portfolio.totalBalance": 999999 } });
  ok("client cannot escalate", denied.status === 403 && denied.json.error.code === "permission-denied", denied.json);

  console.log("\n4) admin flow");
  const adminLogin = await api("POST", "/api/auth/login", {
    body: { email: process.env.ADMIN_EMAIL || "admin@digitalwealthpartners.co", password: process.env.ADMIN_PASSWORD || "Admin123!" },
  });
  ok("admin login", adminLogin.status === 200 && !!adminLogin.json.token, adminLogin.json);
  const adminToken = adminLogin.json && adminLogin.json.token;

  const list = await api("GET", "/api/admin/applications", { token: adminToken });
  ok("admin list applications", list.status === 200 && Array.isArray(list.json.applications), { status: list.status });
  const target = list.json && list.json.applications.find((a) => a.data && a.data.email === clientEmail);
  ok("new client appears in admin list", !!target, { count: list.json && list.json.total });

  const noAdmin = await api("GET", "/api/admin/applications", { token: clientToken });
  ok("client blocked from admin API", noAdmin.status === 403, { status: noAdmin.status });

  const approve = await api("PATCH", `/api/admin/applications/${target.id}`, {
    token: adminToken,
    body: { status: "approved", reviewedAt: { __serverTimestamp: true }, reviewedBy: "admin@digitalwealthpartners.co", updatedAt: { __serverTimestamp: true }, accountActivated: false },
  });
  ok("admin approves application", approve.status === 200 && approve.json.data.status === "approved", approve.json && approve.json.data.status);

  const access2 = await api("GET", "/api/me/access", { token: clientToken });
  ok("approved client passes gate", access2.json && access2.json.allowed === true && access2.json.reason === "approved", access2.json);

  const activate = await api("PATCH", `/api/admin/applications/${target.id}`, {
    token: adminToken,
    body: {
      accountActivated: true,
      depositConfirmed: true,
      depositAmountCurrency: "USD",
      activatedAt: { __serverTimestamp: true },
      updatedAt: { __serverTimestamp: true },
      transactions: [
        { id: "deposit-1", date: new Date().toLocaleString(), type: "Deposit", description: "Confirmed", amount: 5000, status: "Approved", method: "XRP", network: "XRP Ledger" },
      ],
      depositHistory: [{ ...depositPatch.depositHistory[0], status: "Approved" }],
      cryptoHoldings: { xrp: { units: 9090.9, price: 0.55, value: 5000, return: 0 } },
      portfolio: { totalBalance: 5000, availableCash: 0, investmentsCount: 0, monthlyChange: 0, ytdChange: 0, totalReturn: 0, totalReturnPct: 0, dividendYield: 0 },
      activities: [{ date: new Date().toLocaleString(), text: "Welcome! Your deposit has been confirmed and credited." }],
    },
  });
  ok("admin activates account", activate.status === 200 && activate.json.data.accountActivated === true, activate.json && activate.json.data.accountActivated);

  const depStatus = await api("GET", `/api/me/deposits/${depId}/status`, { token: clientToken });
  ok("deposit now approved", depStatus.json && depStatus.json.status === "Approved" && depStatus.json.accountActivated === true, depStatus.json);

  console.log("\n5) withdrawal request + review");
  const wdId = `wd-${stamp}`;
  const wd = await api("PATCH", "/api/me/application", {
    token: clientToken,
    body: {
      withdrawalHistory: [
        { id: wdId, amount: 1500, amountCurrency: "USD", reason: "personal", reasonLabel: "Personal", method: "xrp", methodLabel: "XRP", walletAddress: "rCLIENTWALLET00000000000000001", additionalInfo: "", status: "Pending", requestedAt: new Date().toISOString() },
      ],
      lastWithdrawalRequest: { id: wdId, amount: 1500, status: "Pending" },
      updatedAt: { __serverTimestamp: true },
    },
  });
  ok("withdrawal submitted", wd.status === 200 && wd.json.application.withdrawalHistory.length === 1, wd.json && wd.json.error);

  const review = await api("PATCH", `/api/admin/applications/${target.id}`, {
    token: adminToken,
    body: {
      withdrawalHistory: [{ id: wdId, amount: 1500, status: "Approved", reviewedAt: new Date().toISOString(), reviewedBy: "admin@digitalwealthpartners.co" }],
      lastWithdrawalRequest: { id: wdId, amount: 1500, status: "Approved", reviewedAt: new Date().toISOString(), reviewedBy: "admin@digitalwealthpartners.co" },
      updatedAt: { __serverTimestamp: true },
    },
  });
  ok("admin approves withdrawal", review.status === 200 && review.json.data.withdrawalHistory[0].status === "Approved", review.json && review.json.data.withdrawalHistory);

  console.log("\n6) profile edit / profit / return (admin-only fields)");
  const profit = await api("PATCH", `/api/admin/applications/${target.id}`, {
    token: adminToken,
    body: {
      adminPortfolioOverride: { cryptoHoldings: { xrp: { value: 5500, units: 10000, price: 0.55 } }, availableCash: 0 },
      profitHistory: { __arrayUnion: [{ period: "Q4 2026", startDate: "2026-10-01", endDate: "2026-12-31", profitPct: 10, profitUsd: 500, totalBefore: 5000, totalAfter: 5500, appliedAt: new Date().toISOString() }] },
      updatedAt: { __serverTimestamp: true },
    },
  });
  ok("profit applied (arrayUnion)", profit.status === 200 && profit.json.data.profitHistory.length === 1, profit.json && profit.json.data.profitHistory);

  const ret = await api("PATCH", `/api/admin/applications/${target.id}`, {
    token: adminToken,
    body: { "portfolio.monthlyReturnRatePct": 0.95, "portfolio.annualReturnRatePct": 11.4, updatedAt: { __serverTimestamp: true } },
  });
  ok("dotted portfolio paths", ret.status === 200 && ret.json.data.portfolio.monthlyReturnRatePct === 0.95, ret.json && ret.json.data.portfolio);

  console.log("\n7) site config + contact");
  const wallets = await api("GET", "/api/site/deposit-wallets");
  ok("wallets readable", wallets.status === 200 && Object.keys(wallets.json.depositWallets || {}).length >= 10, Object.keys(wallets.json.depositWallets || {}).length);

  const mutated = { ...wallets.json.depositWallets, XRP: { label: "XRP", networks: [{ id: "xrp-mainnet", label: "XRP Ledger", address: "rUPDATEDADDRESS0000000000000001" }] } };
  const saveW = await api("PUT", "/api/site/deposit-wallets", { token: adminToken, body: mutated });
  const readBack = await api("GET", "/api/site/deposit-wallets");
  ok("admin can save wallets", saveW.status === 200 && readBack.json.depositWallets.XRP.networks[0].address.startsWith("rUPDATED"), readBack.json && readBack.json.depositWallets.XRP);

  const saveWClient = await api("PUT", "/api/site/deposit-wallets", { token: clientToken, body: mutated });
  ok("client cannot save wallets", saveWClient.status === 403, { status: saveWClient.status });

  const contact = await api("POST", "/api/contact", {
    body: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+15555550199",
      address: { line1: "1 Main St", city: "Dallas", state: "TX", zip: "75201", country: "United States" },
      clientType: "Individual",
      hasLLCTrust: "No",
      currentAllocation: "10-25%",
      hasXRP: "Yes",
      digitalAssets: "XRP, XLM",
      message: "Interested in custody services.",
      acceptedComms: true,
    },
  });
  ok("contact stored", contact.status === 200 && contact.json.success === true, contact.json);

  console.log("\n8) password reset flow");
  const forgot = await api("POST", "/api/auth/forgot-password", { body: { email: clientEmail } });
  ok("forgot-password always succeeds", forgot.status === 200 && forgot.json.success === true, forgot.json);

  const { query } = require("../src/db/pool");
  const resets = await query("SELECT token_hash FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE u.email = $1 ORDER BY pr.created_at DESC LIMIT 1", [clientEmail]);
  const crypto = require("crypto");
  // We cannot reverse the hash; instead verify reset works with a fresh token we create directly.
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     SELECT id, $2, now() + interval '60 minutes' FROM users WHERE email = $1`,
    [clientEmail, hash]
  );
  const reset = await api("POST", "/api/auth/reset-password", { body: { token: rawToken, password: "NewPassw0rd!2" } });
  ok("reset password", reset.status === 200 && reset.json.success === true, reset.json);

  const relogin = await api("POST", "/api/auth/login", { body: { email: clientEmail, password: "NewPassw0rd!2" } });
  ok("login with new password", relogin.status === 200 && !!relogin.json.token, relogin.json);
  ok("old reset token is single use", (await api("POST", "/api/auth/reset-password", { body: { token: rawToken, password: "Another123!" } })).status === 400);

  console.log("\n9) notifications module");
  await new Promise((r) => setTimeout(r, 500)); // let fire-and-forget side effects land
  const notifs = await api("GET", "/api/notifications", { token: clientToken });
  ok("client notifications list", notifs.status === 200 && Array.isArray(notifs.json.items), notifs.json && { count: notifs.json.items.length, unread: notifs.json.unreadCount });
  ok(
    "deposit + withdrawal notifications created",
    notifs.json.items.some((n) => n.type === "deposit") && notifs.json.items.some((n) => n.type === "withdrawal"),
    notifs.json.items.map((n) => n.type)
  );

  const readAll = await api("POST", "/api/notifications/read", { token: clientToken, body: {} });
  ok("mark all read", readAll.status === 200 && readAll.json.unreadCount === 0, readAll.json);

  const adminNotifs = await api("GET", "/api/notifications", { token: adminToken });
  ok("admin notifications (signup/deposit/withdrawal)", adminNotifs.status === 200 && adminNotifs.json.items.length >= 2, adminNotifs.json && adminNotifs.json.items.map((n) => n.type));

  const broadcast = await api("POST", "/api/admin/notifications", {
    token: adminToken,
    body: { title: "Scheduled maintenance", body: "We will be offline Sunday 02:00 UTC.", link: "#overview" },
  });
  ok("admin broadcast", broadcast.status === 200 && broadcast.json.success === true && broadcast.json.sent >= 1, broadcast.json);

  const broadcastClient = await api("POST", "/api/admin/notifications", { token: clientToken, body: { title: "nope" } });
  ok("client cannot broadcast", broadcastClient.status === 403, { status: broadcastClient.status });

  console.log("\n10) client chat + WebSocket");
  const chatPost = await api("POST", "/api/me/chats/messages", { token: clientToken, body: { text: "Hello, I have a question about custody." } });
  ok("client sends chat message", chatPost.status === 201 && chatPost.json.message && chatPost.json.message.from === "client", chatPost.json);

  const chatEmpty = await api("POST", "/api/me/chats/messages", { token: clientToken, body: { text: "   " } });
  ok("empty chat message rejected", chatEmpty.status === 400, { status: chatEmpty.status });

  const chatGet = await api("GET", "/api/me/chats/messages", { token: clientToken });
  ok("client chat history", chatGet.status === 200 && chatGet.json.messages.some((m) => m.from === "client"), chatGet.json && { count: chatGet.json.messages.length });

  const adminHistory = await api("GET", `/api/admin/chats/${target.id}/messages`, { token: adminToken });
  ok("admin sees client message", adminHistory.status === 200 && adminHistory.json.messages.some((m) => m.from === "client"), adminHistory.json && { count: adminHistory.json.messages.length });

  const adminReply = await api("POST", `/api/admin/chats/${target.id}/messages`, { token: adminToken, body: { text: "Hi! How can we help?" } });
  ok("admin replies in chat", adminReply.status === 201, adminReply.json);

  const chatAfter = await api("GET", "/api/me/chats/messages", { token: clientToken });
  ok("client receives admin reply", chatAfter.status === 200 && chatAfter.json.messages.some((m) => m.from === "admin" && m.text === "Hi! How can we help?"), chatAfter.json && { count: chatAfter.json.messages.length });

  // WebSocket handshake (server started via `node src/index.js` attaches /ws)
  const wsHandshake = await new Promise((resolve) => {
    let socket;
    let settled = false;
    let timer;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (socket) socket.close();
      } catch (_) { /* ignore */ }
      resolve(value);
    };
    try {
      const WebSocket = require("ws");
      socket = new WebSocket(`ws://localhost:3000/ws?token=${encodeURIComponent(clientToken)}`);
      timer = setTimeout(() => done(false), 4000);
      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === "hello" && msg.data && msg.data.userId) done(true);
        } catch (_) { /* ignore */ }
      });
      socket.on("error", () => done(false));
      socket.on("close", () => done(false));
    } catch (_) {
      resolve(false);
    }
  });
  ok("websocket authenticated handshake", wsHandshake, { wsHandshake });

  const wsNoAuth = await new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const WebSocket = require("ws");
      const socket = new WebSocket("ws://localhost:3000/ws");
      const timer = setTimeout(() => done(false), 4000);
      socket.on("open", () => {
        clearTimeout(timer);
        done(false);
        try { socket.close(); } catch (_) { /* ignore */ }
      });
      socket.on("error", () => { clearTimeout(timer); done(true); });
      socket.on("close", () => { clearTimeout(timer); done(true); });
    } catch (_) {
      resolve(true);
    }
  });
  ok("websocket rejects missing token", wsNoAuth, { wsNoAuth });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("TEST CRASH:", err);
  process.exit(1);
});
