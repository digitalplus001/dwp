/**
 * Shared helpers — deposits, transactions, portfolio balances.
 */
(function () {
  window.DWP = window.DWP || {};

  function formatTxDate(value) {
    if (value && value.toDate) {
      return value.toDate().toLocaleString("en-US");
    }
    if (value instanceof Date) {
      return value.toLocaleString("en-US");
    }
    if (typeof value === "string" && value) return value;
    return new Date().toLocaleString("en-US");
  }

  /** Fallback USD prices, used only if the live CoinGecko/Binance feed is
   * unreachable — overwritten immediately by the live feed when it succeeds.
   * Kept close to current market price so a fetch failure doesn't show a
   * wildly wrong number; refresh these periodically. */
  DWP.ASSET_META = {
    btc:  { symbol: "BTC",  name: "Bitcoin",        defaultPrice: 84190    },
    eth:  { symbol: "ETH",  name: "Ethereum",        defaultPrice: 2686.11 },
    usdt: { symbol: "USDT", name: "Tether",          defaultPrice: 1       },
    usdc: { symbol: "USDC", name: "USD Coin",        defaultPrice: 1       },
    xrp:  { symbol: "XRP",  name: "XRP",             defaultPrice: 1.51    },
    xlm:  { symbol: "XLM",  name: "Stellar Lumens",  defaultPrice: 0.223   },
    trx:  { symbol: "TRX",  name: "Tron",            defaultPrice: 0.339   },
    sol:  { symbol: "SOL",  name: "Solana",          defaultPrice: 119.33  },
    flr:  { symbol: "FLR",  name: "Flare",           defaultPrice: 0.00743 },
    hbar: { symbol: "HBAR", name: "Hedera",          defaultPrice: 0.1085  },
    link: { symbol: "LINK", name: "Chainlink",       defaultPrice: 14.27   },
    ltc:  { symbol: "LTC",  name: "Litecoin",        defaultPrice: 67.12   },
    hype: { symbol: "HYPE", name: "Hyperliquid",     defaultPrice: 87.14   },
    sui:  { symbol: "SUI",  name: "Sui",             defaultPrice: 1.18    }
  };

  DWP.defaultCryptoHoldings = function () {
    const out = {};
    Object.keys(DWP.ASSET_META).forEach(function (key) {
      const m = DWP.ASSET_META[key];
      out[key] = {
        units: 0,
        price: m.defaultPrice,
        value: 0,
        return: 0
      };
    });
    return out;
  };

  DWP.depositAssetKey = function (data) {
    if (!data) return null;
    const method = String(data.depositMethod || data.depositAsset || "")
      .toLowerCase()
      .trim();
    if (method && DWP.ASSET_META[method]) return method;
    const network = String(data.depositNetworkLabel || "").toLowerCase();
    if (network.indexOf("bitcoin") >= 0) return "btc";
    if (network.indexOf("ethereum") >= 0 || network.indexOf("erc-20") >= 0) {
      if (method === "usdt" || network.indexOf("tether") >= 0) return "usdt";
      if (method === "usdc") return "usdc";
      return "eth";
    }
    if (network.indexOf("tron") >= 0 || network.indexOf("trc-20") >= 0) {
      return method === "usdt" ? "usdt" : "trx";
    }
    if (network.indexOf("stellar") >= 0) return "xlm";
    if (network.indexOf("solana") >= 0) return "sol";
    if (network.indexOf("flare") >= 0) return "flr";
    if (network.indexOf("xrp") >= 0) return "xrp";
    return method || null;
  };

  /** USD amount the user entered in the deposit form (before fee). */
  DWP.depositUsdAmount = function (data) {
    if (!data) return 0;
    const amt = Number(data.depositAmount);
    if (!isNaN(amt) && amt > 0) return amt;
    const credit = Number(data.depositTotalCredit);
    if (!isNaN(credit) && credit > 0) return credit;
    return 0;
  };

  /** USD credited after processing fee (Total to Credit). */
  DWP.depositCreditAmount = function (data) {
    if (!data) return 0;
    const credit = Number(data.depositTotalCredit);
    if (!isNaN(credit) && credit > 0) return credit;
    return DWP.depositUsdAmount(data);
  };

  /** @deprecated Use depositUsdAmount — kept for compatibility. */
  DWP.depositTokenAmount = DWP.depositUsdAmount;

  function isDepositTx(tx) {
    return String((tx && tx.type) || "").toLowerCase().indexOf("deposit") >= 0;
  }

  function isWithdrawalTx(tx) {
    return String((tx && tx.type) || "").toLowerCase().indexOf("withdraw") >= 0;
  }

  function isDeniedWithdrawal(rec) {
    const s = String((rec && rec.status) || "").toLowerCase();
    return s.indexOf("den") >= 0 || s.indexOf("reject") >= 0;
  }

  function isApprovedWithdrawal(rec) {
    const s = String((rec && rec.status) || "").toLowerCase();
    return s.indexOf("approv") >= 0 || s === "confirmed";
  }

  function isPendingTx(tx) {
    return String((tx && tx.status) || "").toLowerCase().indexOf("pend") >= 0;
  }

  /** Deposit tx that still needs admin confirmation (broader than isPendingTx). */
  DWP.isPendingDepositTx = function isPendingDepositTx(tx) {
    if (!isDepositTx(tx)) return false;
    if (isApprovedTx(tx)) return false;
    const s = String((tx && tx.status) || "").toLowerCase();
    if (s.indexOf("reject") >= 0) return false;
    return (
      isPendingTx(tx) ||
      !s ||
      s === "waiting" ||
      s === "submitted" ||
      s.indexOf("review") >= 0
    );
  }

  function isApprovedTx(tx) {
    const s = String((tx && tx.status) || "").toLowerCase();
    return s.indexOf("approv") >= 0 || s === "confirmed";
  }

  function isFirestoreFieldValue(val) {
    if (!val || typeof val !== "object") return false;
    if (val.constructor && val.constructor.name === "FieldValue") return true;
    if (typeof val._methodName === "string" && val._methodName.indexOf("FieldValue") >= 0) {
      return true;
    }
    if (
      val._delegate &&
      typeof val._delegate._methodName === "string" &&
      val._delegate._methodName.indexOf("FieldValue") >= 0
    ) {
      return true;
    }
    return false;
  }

  /** Client timestamp for array fields (serverTimestamp() is not allowed inside arrays). */
  DWP.clientTimestamp = function () {
    if (
      typeof firebase !== "undefined" &&
      firebase.firestore &&
      typeof firebase.firestore.Timestamp === "function"
    ) {
      return firebase.firestore.Timestamp.now();
    }
    return new Date();
  };

  /** Remove undefined / NaN — Firestore rejects them on update(). */
  DWP.sanitizeFirestorePatch = function (obj) {
    if (obj === undefined) return undefined;
    if (typeof obj === "number" && !isFinite(obj)) return undefined;
    if (obj === null || typeof obj !== "object") return obj;
    if (typeof obj.toDate === "function") return obj;
    if (isFirestoreFieldValue(obj)) return obj;
    if (Array.isArray(obj)) {
      return obj
        .map(function (item) {
          return DWP.sanitizeFirestorePatch(item);
        })
        .filter(function (item) {
          return item !== undefined;
        });
    }
    const out = {};
    Object.keys(obj).forEach(function (key) {
      const val = obj[key];
      if (val === undefined) return;
      const cleaned = DWP.sanitizeFirestorePatch(val);
      if (cleaned === undefined) return;
      out[key] = cleaned;
    });
    return out;
  };

  DWP.depositUsdFromTx = function depositUsdFromTx(tx, data) {
    const histById = DWP.depositHistoryById(data);
    const hist = tx && tx.id ? histById[tx.id] : null;
    const key = DWP.assetKeyFromSymbol(tx.method);
    return DWP.resolveDepositUsd(tx.amount, key, {
      tokenUnits:
        Number(tx.depositTokenEquivalent) >= 0
          ? Number(tx.depositTokenEquivalent)
          : hist && Number(hist.depositTokenEquivalent) >= 0
            ? Number(hist.depositTokenEquivalent)
            : undefined,
      price:
        Number(tx.depositUsdPriceAtSubmit) > 0
          ? Number(tx.depositUsdPriceAtSubmit)
          : hist && Number(hist.depositUsdPriceAtSubmit) > 0
            ? Number(hist.depositUsdPriceAtSubmit)
            : undefined
    });
  }

  /** Sum of all approved deposit transactions (USD). */
  DWP.sumApprovedDepositUsd = function (data) {
    const txs = DWP.getTransactionsList(data || {});
    return txs
      .filter(function (tx) {
        return isDepositTx(tx) && isApprovedTx(tx);
      })
      .reduce(function (sum, tx) {
        return sum + DWP.depositUsdFromTx(tx, data);
      }, 0);
  };

  /** Sum of pending deposit transactions (USD). */
  DWP.sumPendingDepositUsd = function (data) {
    const txs = DWP.getTransactionsList(data || {});
    return txs
      .filter(function (tx) {
        return isDepositTx(tx) && isPendingTx(tx);
      })
      .reduce(function (sum, tx) {
        return sum + DWP.depositUsdFromTx(tx, data);
      }, 0);
  };

  /** Total USD value across crypto holdings (matches Your Assets). */
  DWP.sumHoldingsUsd = function (data) {
    return DWP.getCryptoHoldingsList(data || {}).reduce(function (sum, h) {
      return sum + (Number(h.value) || 0);
    }, 0);
  };

  DWP.migrateDepositHistoryToTransactions = function (data, list) {
    const hist = Array.isArray(data && data.depositHistory)
      ? data.depositHistory
      : [];
    hist.forEach(function (rec, idx) {
      const id =
        rec.id ||
        "dep-hist-" +
          idx +
          "-" +
          (rec.methodSymbol || rec.method || "") +
          "-" +
          (Number(rec.amount) || 0);
      if (
        list.some(function (tx) {
          return tx.id === id;
        })
      ) {
        return;
      }
      const txRow = DWP.buildDepositTransaction({
        id: id,
        date: formatTxDate(rec.submittedAt),
        amount: Number(rec.amount) || Number(rec.totalCredit) || 0,
        status: rec.status || "Pending",
        method: (rec.methodSymbol || rec.method || "").toUpperCase(),
        networkLabel: rec.networkLabel || "",
        description:
          rec.status && isApprovedTx({ status: rec.status })
            ? "Confirmed"
            : "Pending review"
      });
      if (Number(rec.depositTokenEquivalent) >= 0) {
        txRow.depositTokenEquivalent = Number(rec.depositTokenEquivalent);
      }
      if (Number(rec.depositUsdPriceAtSubmit) > 0) {
        txRow.depositUsdPriceAtSubmit = Number(rec.depositUsdPriceAtSubmit);
      }
      list.push(txRow);
    });
    return list;
  };

  DWP.formatTokenUnits = function (units, symbol) {
    const u = Number(units) || 0;
    const sym = String(symbol || "").toUpperCase();
    if (u <= 0 || !sym) return "—";
    const isStable = sym === "USDT" || sym === "USDC";
    const maxFrac = isStable ? (u >= 1 ? 2 : 6) : u >= 1 ? 6 : 8;
    return (
      u.toLocaleString(undefined, {
        maximumFractionDigits: maxFrac,
        minimumFractionDigits: 0
      }) +
      " " +
      sym
    );
  };

  DWP.usdToTokenUnits = function (usd, assetKey, priceOverride) {
    const amount = Number(usd) || 0;
    const key = String(assetKey || "").toLowerCase();
    const meta = DWP.ASSET_META[key];
    if (!meta || amount <= 0) return 0;
    const price =
      Number(priceOverride) > 0
        ? Number(priceOverride)
        : typeof DWP.getAssetUsdPrice === "function"
          ? DWP.getAssetUsdPrice(key)
          : Number(meta.defaultPrice) || 1;
    return price > 0 ? amount / price : 0;
  };

  /** Token amount equivalent for a USD deposit (live or snapshot price). */
  DWP.getDepositTokenEquivalent = function (data, assetKeyOverride) {
    const key =
      assetKeyOverride ||
      (data && DWP.depositAssetKey(data)) ||
      String((data && data.depositMethod) || "").toLowerCase();
    const usd = data ? DWP.depositUsdAmount(data) : 0;
    if (!key || usd <= 0 || !DWP.ASSET_META[key]) return null;
    const meta = DWP.ASSET_META[key];
    const snapPrice = data && Number(data.depositUsdPriceAtSubmit);
    const snapUnits = data && Number(data.depositTokenEquivalent);
    const price =
      snapPrice > 0
        ? snapPrice
        : typeof DWP.getAssetUsdPrice === "function"
          ? DWP.getAssetUsdPrice(key)
          : Number(meta.defaultPrice) || 1;
    const units =
      !isNaN(snapUnits) && snapUnits >= 0 && data.depositTokenEquivalent != null
        ? snapUnits
        : DWP.usdToTokenUnits(usd, key, price);
    return {
      key: key,
      symbol: meta.symbol,
      name: meta.name,
      units: units,
      price: price,
      usd: usd,
      formatted: DWP.formatTokenUnits(units, meta.symbol),
      priceSource: snapPrice > 0 ? "snapshot" : "live"
    };
  };

  DWP.getTokenEquivalentFromTx = function (tx, data) {
    if (!tx) return null;
    const usd = Number(tx.amount) || 0;
    const key = String(tx.method || tx.asset || "").toLowerCase();
    if (usd <= 0 || !key || !DWP.ASSET_META[key]) return null;
    const meta = DWP.ASSET_META[key];
    const isDeposit = String(tx.type || "").toLowerCase().indexOf("deposit") >= 0;
    if (isDeposit && data && data.depositTokenEquivalent != null) {
      const equiv = DWP.getDepositTokenEquivalent(data);
      if (equiv && equiv.key === key) return equiv;
    }
    const units = DWP.usdToTokenUnits(usd, key);
    return {
      symbol: meta.symbol,
      units: units,
      formatted: DWP.formatTokenUnits(units, meta.symbol)
    };
  };

  DWP.buildWithdrawalTransaction = function (opts) {
    const o = opts || {};
    const amount = Number(o.amount) || 0;
    const status = o.status || "Pending";
    const method = String(o.method || o.methodLabel || "").toUpperCase();
    let description = o.description;
    if (!description) {
      if (isApprovedWithdrawal({ status: status })) {
        description = "Withdrawal approved";
      } else if (isDeniedWithdrawal({ status: status })) {
        description = "Withdrawal denied";
      } else {
        description = "Pending review";
      }
    }
    return {
      id: o.id || "wd-" + Date.now(),
      date: o.date || formatTxDate(o.requestedAt) || new Date().toLocaleString("en-US"),
      type: "Withdrawal",
      description: description,
      amount: amount,
      status: status,
      method: method,
      network: o.walletAddress || o.network || ""
    };
  };

  DWP.migrateWithdrawalHistoryToTransactions = function (data, list) {
    const out = Array.isArray(list) ? list.slice() : [];
    const wds =
      typeof DWP.getWithdrawalList === "function"
        ? DWP.getWithdrawalList(data || {})
        : [];
    wds.forEach(function (rec) {
      const id = rec.id;
      if (
        id &&
        out.some(function (tx) {
          return tx.id === id;
        })
      ) {
        return;
      }
      out.push(
        DWP.buildWithdrawalTransaction({
          id: id || "wd-mig-" + rec.amount,
          requestedAt: rec.requestedAt,
          amount: rec.amount,
          status: rec.status || "Pending",
          method: rec.method,
          methodLabel: rec.methodLabel,
          walletAddress: rec.walletAddress,
          description:
            isApprovedWithdrawal(rec)
              ? "Withdrawal approved"
              : isDeniedWithdrawal(rec)
                ? "Withdrawal denied"
                : "Pending review"
        })
      );
    });
    return out;
  };

  DWP.buildDepositTransaction = function (opts) {
    const o = opts || {};
    const amount = Number(o.amount) || 0;
    const status = o.status || "Pending";
    const method = (o.method || "").toUpperCase();
    const network = o.networkLabel || "";
    let description = o.description;
    if (!description) {
      description =
        status === "Approved" || status === "approved" ? "Confirmed" : "Pending review";
    }
    return {
      id: o.id || "deposit-" + Date.now(),
      date: o.date || new Date().toLocaleString("en-US"),
      type: "Deposit",
      description: description,
      amount: amount,
      status: status,
      method: method,
      network: network
    };
  };

  /**
   * Firestore patch for dashboard deposit submit (matches firebase/firestore.rules).
   * Does not write transactions — UI rebuilds those from depositHistory.
   */
  DWP.buildDepositSubmitPatch = function (opts) {
    const o = opts || {};
    const existing = o.existing || {};
    const amount = Number(o.amount) || 0;
    const fee = Number(o.processingFee) || 0;
    const total = Number(o.totalCredit);
    const totalCredit = isFinite(total) ? total : Math.max(0, amount - fee);
    const assetKey = String(o.assetKey || "").toLowerCase();
    const symbol = String(o.symbol || "").toUpperCase();
    const wallet = o.wallet || {};
    const file = o.file || {};
    const upload = o.upload || null;
    const usdPrice = Number(o.usdPrice) || 0;
    const tokenEquiv = Number(o.tokenEquivalent);
    const depId = "dep-" + Date.now();
    const proofType =
      typeof DWP.normalizeProofContentType === "function"
        ? DWP.normalizeProofContentType(file)
        : file.type || "image/jpeg";

    const depositRecord = {
      id: depId,
      amount: amount,
      totalCredit: totalCredit,
      method: assetKey,
      methodSymbol: symbol,
      networkId: wallet.networkId || "",
      networkLabel: wallet.networkLabel || "",
      status: "Pending",
      submittedAt:
        typeof DWP.clientTimestamp === "function"
          ? DWP.clientTimestamp()
          : new Date()
    };
    if (tokenEquiv >= 0 && isFinite(tokenEquiv)) {
      depositRecord.depositTokenEquivalent = tokenEquiv;
    }
    if (usdPrice > 0) {
      depositRecord.depositUsdPriceAtSubmit = usdPrice;
    }

    const history = Array.isArray(existing.depositHistory)
      ? existing.depositHistory.slice()
      : [];
    history.push(depositRecord);

    const patch = {
      depositSubmitted: true,
      depositSubmittedAt: DWP.FieldValue.serverTimestamp(),
      depositAmountCurrency: "USD",
      depositMethod: assetKey,
      depositNetwork: wallet.networkId || "",
      depositNetworkLabel: wallet.networkLabel || "",
      depositAmount: Number(amount),
      depositWallet: wallet.address || "",
      depositProcessingFee: Number(fee),
      depositTotalCredit: Number(totalCredit),
      depositProofFileName: file.name || "proof",
      depositProofType: proofType,
      depositProofUploaded: true,
      depositHistory: history,
      updatedAt: DWP.FieldValue.serverTimestamp()
    };

    if (usdPrice > 0) {
      patch.depositUsdPriceAtSubmit = usdPrice;
    }
    if (tokenEquiv >= 0 && isFinite(tokenEquiv)) {
      patch.depositTokenEquivalent = tokenEquiv;
    }
    if (upload) {
      patch.depositProofStoragePath = upload.storagePath;
      patch.depositProofUrl = upload.downloadUrl;
      patch.depositProofSize = upload.size;
    }

    return {
      patch: patch,
      history: history,
      depId: depId,
      depositRecord: depositRecord
    };
  };

  /** Persist deposit on the user's application document (rules: deposit-v6). */
  DWP.saveDepositSubmission = async function (uid, built) {
    DWP.requireFirebase();
    const user = DWP.auth.currentUser;
    if (!user || user.uid !== uid) {
      throw new Error("You must be signed in to submit a deposit.");
    }

    await user.getIdToken(true);

    const resolved =
      typeof DWP.resolveApplicationDoc === "function"
        ? await DWP.resolveApplicationDoc(uid)
        : null;
    const docRef = resolved && resolved.ref
      ? resolved.ref
      : DWP.db.collection("applications").doc(uid);
    if (!resolved || !resolved.exists) {
      const err = new Error(
        "No application record found for your account (applications/" + uid + ")."
      );
      err.code = "not-found";
      throw err;
    }

    const storedUid = (resolved.data && resolved.data.uid) || "";
    if (storedUid && storedUid !== uid) {
      console.warn(
        "[DWP] Application uid field does not match Auth UID. docId=" +
          resolved.id +
          " storedUid=" +
          storedUid +
          " authUid=" +
          uid
      );
    }

    const patch = built.patch;
    const depId = built.depId;
    const projectId =
      typeof firebase !== "undefined" &&
      firebase.apps[0] &&
      firebase.apps[0].options
        ? firebase.apps[0].options.projectId
        : null;

    console.info("[DWP] saveDepositSubmission", {
      patchKeys: Object.keys(patch)
    });

    async function tryUpdate(data, label) {
      try {
        await docRef.update(data);
        console.info("[DWP] Deposit write OK:", label);
        return true;
      } catch (e) {
        console.error("[DWP] Deposit write failed:", label, e.code, e.message);
        throw e;
      }
    }

    const minimal = {
      depositSubmitted: true,
      depositAmount: patch.depositAmount,
      depositTotalCredit: patch.depositTotalCredit,
      depositMethod: patch.depositMethod,
      updatedAt: patch.updatedAt
    };

    try {
      await tryUpdate(patch, "full");
    } catch (firstErr) {
      if (firstErr.code !== "permission-denied") {
        throw firstErr;
      }
      console.warn("[DWP] Full deposit patch denied; retrying minimal patch…");
      try {
        await tryUpdate(minimal, "minimal");
        const rest = Object.assign({}, patch);
        delete rest.depositSubmitted;
        delete rest.depositAmount;
        delete rest.depositTotalCredit;
        delete rest.depositMethod;
        delete rest.updatedAt;
        if (Object.keys(rest).length) {
          await tryUpdate(rest, "remainder");
        }
      } catch (secondErr) {
        const hint =
          "Auth UID: " +
          uid +
          ", doc: " +
          docRef.path +
          ", project: " +
          projectId +
          ". Publish Firestore rules with RULES_VERSION: deposit-v6.";
        const err = new Error(hint);
        err.code = "permission-denied";
        err.cause = secondErr;
        throw err;
      }
    }

    const subPayload = Object.assign({}, built.depositRecord, {
      depositProofFileName: patch.depositProofFileName,
      depositProofType: patch.depositProofType,
      depositProofUploaded: true
    });
    if (patch.depositProofStoragePath) {
      subPayload.depositProofStoragePath = patch.depositProofStoragePath;
    }
    if (patch.depositProofUrl) {
      subPayload.depositProofUrl = patch.depositProofUrl;
    }
    if (patch.depositProofSize != null) {
      subPayload.depositProofSize = patch.depositProofSize;
    }

    try {
      await docRef.collection("deposits").doc(depId).set(subPayload);
    } catch (subErr) {
      console.warn("[DWP] deposits subcollection write skipped:", subErr);
    }
  };

  /** True when a deposit tx matches the latest deposit fields on the application doc. */
  DWP.depositTxMatchesCurrent = function (tx, data) {
    if (!isDepositTx(tx) || !data) return false;
    const txKey = DWP.assetKeyFromSymbol(tx.method);
    const currentKey = DWP.depositAssetKey(data);
    if (!txKey || !currentKey || txKey !== currentKey) return false;
    const amt = Number(tx.amount) || 0;
    const currentAmt = DWP.depositUsdAmount(data);
    return Math.abs(amt - currentAmt) < 0.01;
  };

  /** Status for the latest deposit — never inferred from accountActivated alone. */
  DWP.depositStatusForCurrent = function (data) {
    if (!data || !data.depositSubmitted) return null;
    const txs = Array.isArray(data.transactions) ? data.transactions : [];
    let match = null;
    txs.forEach(function (tx) {
      if (DWP.depositTxMatchesCurrent(tx, data)) match = tx;
    });
    if (match && match.status) return match.status;
    const hist = Array.isArray(data.depositHistory) ? data.depositHistory : [];
    const key = DWP.depositAssetKey(data);
    const usd = DWP.depositUsdAmount(data);
    for (let i = hist.length - 1; i >= 0; i--) {
      const rec = hist[i];
      const recKey = DWP.assetKeyFromSymbol(rec.methodSymbol || rec.method);
      const recUsd = Number(rec.amount) || Number(rec.totalCredit) || 0;
      if (recKey === key && Math.abs(recUsd - usd) < 0.01) {
        return rec.status || "Pending";
      }
    }
    return "Pending";
  };

  DWP.getTransactionsList = function (data) {
    let list = Array.isArray(data && data.transactions)
      ? data.transactions.slice()
      : [];

    list = DWP.migrateDepositHistoryToTransactions(data, list);
    list = DWP.migrateWithdrawalHistoryToTransactions(data, list);

    if (data && data.depositSubmitted) {
      const hasMatchingCurrent = list.some(function (tx) {
        return DWP.depositTxMatchesCurrent(tx, data);
      });

      if (!hasMatchingCurrent) {
        const usd = DWP.depositUsdAmount(data);
        const status = DWP.depositStatusForCurrent(data) || "Pending";
        const approved = isApprovedTx({ status: status });
        list.unshift(
          DWP.buildDepositTransaction({
            date: formatTxDate(data.depositSubmittedAt),
            amount: usd,
            status: status,
            method: (data.depositMethod || "").toUpperCase(),
            networkLabel: data.depositNetworkLabel || "",
            description: approved ? "Confirmed" : "Pending review"
          })
        );
      }
    }

    const byId = {};
    list.forEach(function (tx) {
      const id = tx.id || tx.date + "-" + tx.type + "-" + tx.amount;
      if (!byId[id]) byId[id] = tx;
    });
    list = Object.keys(byId).map(function (id) {
      return byId[id];
    });

    list.sort(function (a, b) {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return db - da;
    });

    return list;
  };

  /** Admin/client summary — signup status vs deposit confirmation are separate. */
  DWP.getDepositAdminSummary = function (data) {
    const d = data || {};
    const txs = DWP.getTransactionsList(d).filter(isDepositTx);
    const pending = txs.filter(DWP.isPendingDepositTx);
    const approved = txs.filter(isApprovedTx);
    const portfolio =
      typeof DWP.effectivePortfolio === "function"
        ? DWP.effectivePortfolio(d)
        : d.portfolio || {};
    let label = "No deposit";
    let tone = "none";
    if (txs.length) {
      if (pending.length) {
        label =
          pending.length === 1
            ? "1 deposit pending"
            : pending.length + " deposits pending";
        tone = "pending";
      } else if (d.accountActivated) {
        label = "Deposits credited";
        tone = "approved";
      } else if (approved.length) {
        label = "Approved — activate account";
        tone = "approved";
      } else {
        label = "Deposit submitted";
        tone = "pending";
      }
    } else if (d.depositSubmitted) {
      label = "Deposit pending";
      tone = "pending";
    }
    return {
      label: label,
      tone: tone,
      pendingCount: pending.length,
      txs: txs,
      portfolioTotal: Number(portfolio.totalBalance) || 0,
      canConfirm:
        String(d.status || "").toLowerCase() === "approved" &&
        (pending.length > 0 || (d.depositSubmitted && !d.accountActivated))
    };
  };

  /** Live price when stored price is missing or unreasonably low (legacy Firestore rows). */
  DWP.effectiveHoldingPrice = function (assetKey, storedPrice) {
    const live =
      typeof DWP.getAssetUsdPrice === "function"
        ? DWP.getAssetUsdPrice(assetKey)
        : 0;
    const meta = DWP.ASSET_META[assetKey];
    const fallback = meta && Number(meta.defaultPrice) > 0 ? Number(meta.defaultPrice) : 1;
    // Always prefer the live market price when available
    if (live > 0) return live;
    const p = Number(storedPrice);
    if (p > 0) return p;
    return fallback;
  };

  DWP.resolveDepositUsd = function (usd, assetKey, opts) {
    let credit = Number(usd) || 0;
    const o = opts || {};
    const snapUnits = Number(o.tokenUnits);
    const snapPrice =
      Number(o.price) > 0
        ? Number(o.price)
        : typeof DWP.getAssetUsdPrice === "function"
          ? DWP.getAssetUsdPrice(assetKey)
          : 0;
    if (!(credit > 0) && snapUnits > 0 && snapPrice > 0) {
      credit = snapUnits * snapPrice;
    }
    return credit;
  };

  DWP.hasPendingDeposits = function (data) {
    const txs = Array.isArray(data && data.transactions) ? data.transactions : [];
    if (
      txs.some(function (tx) {
        return DWP.isPendingDepositTx
          ? DWP.isPendingDepositTx(tx)
          : isDepositTx(tx) && isPendingTx(tx);
      })
    ) {
      return true;
    }
    const hist = Array.isArray(data && data.depositHistory)
      ? data.depositHistory
      : [];
    return hist.some(function (rec) {
      return isPendingTx({ status: rec.status });
    });
  };

  DWP.normalizeHolding = function (raw, assetKey) {
    const meta = DWP.ASSET_META[assetKey] || {
      symbol: assetKey.toUpperCase(),
      name: assetKey.toUpperCase(),
      defaultPrice: 1
    };
    const r = raw || {};
    const storedUsd = Number(r.valueUsd != null ? r.valueUsd : r.value);
    const snapPrice = Number(r.depositUsdPriceAtSubmit);
    const price = DWP.effectiveHoldingPrice(
      assetKey,
      Number(r.price) > 0 ? Number(r.price) : snapPrice > 0 ? snapPrice : 0
    );
    const explicitUnits =
      Number(r.tokenUnits) > 0
        ? Number(r.tokenUnits)
        : Number(r.depositTokenEquivalent) > 0
          ? Number(r.depositTokenEquivalent)
          : Number(r.units != null ? r.units : r.amount) || 0;

    // The recorded USD amount is the authoritative portfolio figure and
    // stays fixed — it's what the client actually has. The token quantity
    // shown is always what that dollar amount converts to at today's live
    // price, not a frozen unit count, so it floats as the market moves.
    let tokenUnits;
    let value;
    if (storedUsd > 0) {
      value = storedUsd;
      tokenUnits = price > 0 ? storedUsd / price : explicitUnits;
    } else if (explicitUnits > 0 && price > 0) {
      tokenUnits = explicitUnits;
      value = explicitUnits * price;
    } else {
      tokenUnits = explicitUnits;
      value = Number(r.marketValue) || 0;
    }
    const ret = Number(r.return != null ? r.return : r.returnPct) || 0;
    const depositUsd = !!r.depositUsd || storedUsd > 0;
    return {
      key: assetKey,
      symbol: meta.symbol,
      name: meta.name,
      units: tokenUnits,
      tokenUnits: tokenUnits,
      price: price,
      value: value,
      return: ret,
      depositUsd: depositUsd,
      networkLabel: r.networkLabel || "",
      tokenFormatted: DWP.formatTokenUnits(tokenUnits, meta.symbol)
    };
  };

  DWP.assetKeyFromSymbol = function (symbolOrMethod) {
    const raw = String(symbolOrMethod || "").toLowerCase().trim();
    if (raw && DWP.ASSET_META[raw]) return raw;
    return DWP.depositAssetKey({ depositMethod: symbolOrMethod });
  };

  DWP.addDepositToHoldingMap = function (map, assetKey, usd, opts) {
    if (!assetKey || assetKey === "usd") return map;
    const meta = DWP.ASSET_META[assetKey];
    if (!meta) return map;
    const o = opts || {};
    const price = DWP.effectiveHoldingPrice(
      assetKey,
      Number(o.price) > 0 ? Number(o.price) : 0
    );
    const creditUsd = DWP.resolveDepositUsd(usd, assetKey, {
      tokenUnits: o.tokenUnits,
      price: price
    });
    if (!(creditUsd > 0)) return map;
    const addUnits =
      Number(o.tokenUnits) > 0
        ? Number(o.tokenUnits)
        : price > 0
          ? creditUsd / price
          : 0;
    const prev = map[assetKey] || {};
    const prevUnits = Number(prev.units) || 0;
    const prevUsd =
      Number(prev.valueUsd != null ? prev.valueUsd : prev.value) || 0;
    map[assetKey] = {
      units: prevUnits + addUnits,
      price: price,
      value: prevUsd + creditUsd,
      valueUsd: prevUsd + creditUsd,
      depositUsd: true,
      networkLabel: o.networkLabel || prev.networkLabel || "",
      return: Number(prev.return) || 0
    };
    return map;
  };

  DWP.subtractWithdrawalFromHoldingMap = function (map, assetKey, usd) {
    if (!assetKey || !(Number(usd) > 0)) return map;
    const meta = DWP.ASSET_META[assetKey];
    if (!meta) return map;
    const price = DWP.effectiveHoldingPrice(assetKey, 0);
    const debitUsd = Number(usd) || 0;
    const removeUnits = price > 0 ? debitUsd / price : 0;
    const prev = map[assetKey] || {};
    const prevUnits = Number(prev.units) || 0;
    const prevUsd =
      Number(prev.valueUsd != null ? prev.valueUsd : prev.value) || 0;
    const nextUnits = Math.max(0, prevUnits - removeUnits);
    const nextUsd = Math.max(0, prevUsd - debitUsd);
    map[assetKey] = {
      units: nextUnits,
      price: price,
      value: nextUsd,
      valueUsd: nextUsd,
      networkLabel: prev.networkLabel || "",
      return: Number(prev.return) || 0
    };
    return map;
  };

  /** Reduce holdings for pending (reserved) and approved withdrawals. */
  DWP.applyWithdrawalsToHoldings = function (map, data) {
    if (!data || !map) return map;
    const list =
      typeof DWP.getWithdrawalList === "function"
        ? DWP.getWithdrawalList(data)
        : [];
    const seen = {};
    list.forEach(function (rec) {
      if (isDeniedWithdrawal(rec)) return;
      const pending = DWP.isPendingWithdrawal(rec);
      const approved = isApprovedWithdrawal(rec);
      if (!pending && !approved) return;
      const key = DWP.assetKeyFromSymbol(rec.method || rec.methodLabel);
      const amt = Number(rec.amount) || 0;
      const dedupeId = (rec.id || key + "-" + amt) + "-" + (rec.status || "");
      if (!key || amt <= 0 || seen[dedupeId]) return;
      seen[dedupeId] = true;
      DWP.subtractWithdrawalFromHoldingMap(map, key, amt);
    });
    return map;
  };

  DWP.sumPendingWithdrawalUsd = function (data) {
    const list =
      typeof DWP.getWithdrawalList === "function"
        ? DWP.getWithdrawalList(data || {})
        : [];
    return list
      .filter(DWP.isPendingWithdrawal)
      .reduce(function (sum, rec) {
        return sum + (Number(rec.amount) || 0);
      }, 0);
  };

  DWP.sumApprovedWithdrawalUsd = function (data) {
    const list =
      typeof DWP.getWithdrawalList === "function"
        ? DWP.getWithdrawalList(data || {})
        : [];
    return list
      .filter(isApprovedWithdrawal)
      .reduce(function (sum, rec) {
        return sum + (Number(rec.amount) || 0);
      }, 0);
  };

  DWP.depositHistoryById = function (data) {
    const out = {};
    const hist = Array.isArray(data && data.depositHistory)
      ? data.depositHistory
      : [];
    hist.forEach(function (rec) {
      if (rec && rec.id) out[rec.id] = rec;
    });
    return out;
  };

  /** Merge every approved (and optional pending) deposit into per-asset holdings. */
  DWP.mergeAllDepositsIntoHoldings = function (holdings, data) {
    const map = Object.assign({}, holdings || {});
    if (!data) return map;

    // Show submitted deposits in the client portfolio before admin confirms.
    const includePending =
      DWP.hasPendingDeposits(data) ||
      !!(data.depositSubmitted && !data.accountActivated) ||
      !!(data.depositSubmitted && !data.depositConfirmed);
    const seen = {};
    const histById = DWP.depositHistoryById(data);

    function applyDeposit(key, usd, opts) {
      const dedupeId = (opts && opts.id) || key + "-" + usd + "-" + (opts && opts.networkLabel);
      if (seen[dedupeId]) return;
      seen[dedupeId] = true;
      DWP.addDepositToHoldingMap(map, key, usd, opts || {});
    }

    function optsFromTx(tx) {
      const hist = tx.id ? histById[tx.id] : null;
      const snapUnits =
        Number(tx.depositTokenEquivalent) >= 0
          ? Number(tx.depositTokenEquivalent)
          : hist && Number(hist.depositTokenEquivalent) >= 0
            ? Number(hist.depositTokenEquivalent)
            : undefined;
      const snapPrice =
        Number(tx.depositUsdPriceAtSubmit) > 0
          ? Number(tx.depositUsdPriceAtSubmit)
          : hist && Number(hist.depositUsdPriceAtSubmit) > 0
            ? Number(hist.depositUsdPriceAtSubmit)
            : undefined;
      return {
        id: tx.id || "tx-" + (tx.method || "") + "-" + (tx.amount || "") + "-" + (tx.date || ""),
        networkLabel: tx.network || (hist && hist.networkLabel) || "",
        tokenUnits: snapUnits,
        price: snapPrice
      };
    }

    let txs = Array.isArray(data.transactions)
      ? data.transactions.slice()
      : [];
    txs = DWP.migrateDepositHistoryToTransactions(data, txs);

    txs.forEach(function (tx) {
      if (!isDepositTx(tx)) return;
      const approved = isApprovedTx(tx);
      const pending = isPendingTx(tx);
      if (!approved && !(includePending && pending)) return;

      const key = DWP.assetKeyFromSymbol(tx.method);
      const opts = optsFromTx(tx);
      const usd = DWP.resolveDepositUsd(tx.amount, key, opts);
      if (!key || usd <= 0) return;

      applyDeposit(key, usd, opts);
    });

    const hist = Array.isArray(data.depositHistory) ? data.depositHistory : [];
    hist.forEach(function (rec, idx) {
      const approved = isApprovedTx({ status: rec.status });
      const pending = isPendingTx({ status: rec.status });
      if (!approved && !(includePending && pending)) return;
      const key = DWP.assetKeyFromSymbol(rec.methodSymbol || rec.method);
      const histOpts = {
        id: rec.id,
        networkLabel: rec.networkLabel || "",
        tokenUnits:
          Number(rec.depositTokenEquivalent) >= 0
            ? Number(rec.depositTokenEquivalent)
            : undefined,
        price:
          Number(rec.depositUsdPriceAtSubmit) > 0
            ? Number(rec.depositUsdPriceAtSubmit)
            : undefined
      };
      const usd = DWP.resolveDepositUsd(
        Number(rec.amount) || Number(rec.totalCredit) || 0,
        key,
        histOpts
      );
      if (!key || usd <= 0) return;
      const recId =
        rec.id ||
        "dep-hist-only-" +
          idx +
          "-" +
          (rec.methodSymbol || rec.method || "") +
          "-" +
          usd;
      if (seen[recId]) return;
      const inTxs = txs.some(function (tx) {
        return tx.id === rec.id;
      });
      if (rec.id && inTxs) return;
      histOpts.id = recId;
      applyDeposit(key, usd, histOpts);
    });

    if (data.depositSubmitted) {
      const key = DWP.depositAssetKey(data);
      const usd = DWP.depositUsdAmount(data);
      const alreadyInList = txs.some(function (tx) {
        if (!isDepositTx(tx)) return false;
        const txKey = DWP.assetKeyFromSymbol(tx.method);
        return (
          txKey === key &&
          Math.abs((Number(tx.amount) || 0) - usd) < 0.01
        );
      });
      if (!alreadyInList && usd > 0 && key) {
        const show =
          includePending || data.accountActivated || data.depositConfirmed;
        if (show) {
          applyDeposit(key, usd, {
            id: "current-" + key + "-" + usd,
            networkLabel: data.depositNetworkLabel || "",
            tokenUnits: Number(data.depositTokenEquivalent) || undefined,
            price: Number(data.depositUsdPriceAtSubmit) || undefined
          });
        }
      }
    }

    return DWP.applyWithdrawalsToHoldings(map, data);
  };

  DWP.mergeDepositIntoHoldings = function (holdings, data) {
    return DWP.mergeAllDepositsIntoHoldings(holdings, data);
  };

  DWP.sumApprovedFiatUsd = function (data) {
    const txs = DWP.getTransactionsList(data);
    return txs
      .filter(function (tx) {
        if (!isDepositTx(tx) || !isApprovedTx(tx)) return false;
        const key = DWP.assetKeyFromSymbol(tx.method);
        return key === "usd";
      })
      .reduce(function (sum, tx) {
        return sum + (Number(tx.amount) || 0);
      }, 0);
  };

  DWP.getCryptoHoldingsList = function (data) {
    // Admin portfolio override — when set by admin panel, use these values directly
    // instead of computing from deposit transactions (non-destructive: preserves history).
    var adminOverride = data && data.adminPortfolioOverride;
    if (
      adminOverride &&
      adminOverride.cryptoHoldings &&
      Object.keys(adminOverride.cryptoHoldings).length > 0
    ) {
      var overrideList = [];
      var srcHoldings = adminOverride.cryptoHoldings;
      Object.keys(srcHoldings).forEach(function (k) {
        var h = DWP.normalizeHolding(srcHoldings[k], k);
        if (h.units > 0 || h.value > 0) overrideList.push(h);
      });
      overrideList.sort(function (a, b) { return b.value - a.value; });
      return overrideList;
    }

    let map = DWP.mergeAllDepositsIntoHoldings(
      DWP.defaultCryptoHoldings(),
      data
    );

    const txs = Array.isArray(data && data.transactions)
      ? data.transactions
      : [];
    const hasDepositRecords =
      txs.some(isDepositTx) ||
      (Array.isArray(data && data.depositHistory) &&
        data.depositHistory.length > 0);

    if (!hasDepositRecords) {
      const src = (data && data.cryptoHoldings) || data.cryptoInvestments || {};
      Object.keys(src).forEach(function (key) {
        const h = src[key];
        if (h && (Number(h.units) > 0 || Number(h.value) > 0)) {
          map[key] = h;
        }
      });
    }

    const list = [];
    Object.keys(map).forEach(function (key) {
      const h = DWP.normalizeHolding(map[key], key);
      if (h.units > 0 || h.value > 0) {
        list.push(h);
      }
    });

    list.sort(function (a, b) {
      return b.value - a.value;
    });

    return list;
  };

  DWP.effectivePortfolio = function (data) {
    // Admin portfolio override — bypass the ledger computation entirely.
    var adminOverride = data && data.adminPortfolioOverride;
    if (adminOverride && (adminOverride.cryptoHoldings || Number(adminOverride.availableCash) >= 0)) {
      var overrideBase = data && data.portfolio ? Object.assign({}, data.portfolio) : {};
      var overrideCash = Number(adminOverride.availableCash) || 0;
      overrideBase.availableCash = overrideCash;
      var overrideHoldings = DWP.getCryptoHoldingsList(data || {});
      var overrideCryptoTotal = overrideHoldings.reduce(function (s, h) {
        return s + (Number(h.value) || 0);
      }, 0);
      overrideBase.totalBalance = overrideCryptoTotal + overrideCash;
      if (overrideHoldings.length) {
        overrideBase.investmentsCount = overrideHoldings.length;
      }
      var wdPendingOvr = DWP.sumPendingWithdrawalUsd(data);
      var wdApprovedOvr = DWP.sumApprovedWithdrawalUsd(data);
      if (wdPendingOvr > 0 || wdApprovedOvr > 0) {
        overrideBase.withdrawalPendingUsd = wdPendingOvr;
        overrideBase.withdrawalApprovedUsd = wdApprovedOvr;
      }
      return overrideBase;
    }

    const base = data && data.portfolio ? Object.assign({}, data.portfolio) : {};
    const approvedTotal = DWP.sumApprovedDepositUsd(data);
    const pendingTotal = DWP.sumPendingDepositUsd(data);
    const holdingsTotal = DWP.sumHoldingsUsd(data);
    const fiatUsd = DWP.sumApprovedFiatUsd(data);
    const stored = Number(base.totalBalance) || 0;

    if (data && data.accountActivated) {
      if (holdingsTotal > 0) {
        base.totalBalance = holdingsTotal;
      } else if (approvedTotal > 0) {
        base.totalBalance = approvedTotal;
      } else if (stored > 0) {
        base.totalBalance = stored;
      }
      base.availableCash = fiatUsd;
    } else if (data && data.depositSubmitted) {
      if (holdingsTotal > 0) {
        base.totalBalance = holdingsTotal;
      } else if (approvedTotal > 0) {
        base.totalBalance = approvedTotal;
      } else if (pendingTotal > 0) {
        base.totalBalance = pendingTotal;
      } else if (stored > 0) {
        base.totalBalance = stored;
      }
      base.availableCash = approvedTotal > 0 ? fiatUsd : 0;
    } else if (holdingsTotal > 0) {
      base.totalBalance = holdingsTotal;
    }

    const cryptoHoldings = DWP.getCryptoHoldingsList(data || {}).filter(function (h) {
      return h.key !== "usd" && (Number(h.value) > 0 || Number(h.tokenUnits) > 0);
    });
    if (cryptoHoldings.length) {
      base.investmentsCount = cryptoHoldings.length;
    }

    const wdPending = DWP.sumPendingWithdrawalUsd(data);
    const wdApproved = DWP.sumApprovedWithdrawalUsd(data);
    if (wdPending > 0 || wdApproved > 0) {
      base.withdrawalPendingUsd = wdPending;
      base.withdrawalApprovedUsd = wdApproved;
    }

    return base;
  };

  /** Overview cards — aligned with Your Assets and deposit ledger. */
  DWP.getOverviewSummary = function (data) {
    const p = DWP.effectivePortfolio(data || {});
    const holdings = DWP.getCryptoHoldingsList(data || {});
    const cryptoRows = holdings.filter(function (h) {
      return h.key !== "usd" && (Number(h.value) > 0 || Number(h.tokenUnits) > 0);
    });
    const cashRow = holdings.find(function (h) {
      return h.key === "usd";
    });
    const approvedUsd = DWP.sumApprovedDepositUsd(data);
    const pendingUsd = DWP.sumPendingDepositUsd(data);
    const cryptoUsd = cryptoRows.reduce(function (s, h) {
      return s + (Number(h.value) || 0);
    }, 0);
    const cashUsd =
      cashRow && Number(cashRow.value) > 0
        ? Number(cashRow.value)
        : Number(p.availableCash) || 0;

    const breakdown = cryptoRows.map(function (h) {
      return {
        symbol: h.symbol,
        name: h.name,
        usd: Number(h.value) || 0,
        tokens: h.tokenFormatted || DWP.formatTokenUnits(h.tokenUnits, h.symbol)
      };
    });

    const wdPending = DWP.sumPendingWithdrawalUsd(data);
    const wdApproved = DWP.sumApprovedWithdrawalUsd(data);

    let pendingNote = "";
    const notes = [];
    if (pendingUsd > 0) {
      notes.push(
        formatMoneyUsd(pendingUsd) +
          " in deposits awaiting admin confirmation (included in total above)."
      );
    }
    if (wdPending > 0) {
      notes.push(
        formatMoneyUsd(wdPending) +
          " in withdrawals pending review (deducted from assets above)."
      );
    }
    if (wdApproved > 0) {
      notes.push(
        formatMoneyUsd(wdApproved) +
          " in approved withdrawals (deducted from assets above)."
      );
    }
    pendingNote = notes.join(" ");

    return {
      totalBalance: Number(p.totalBalance) || 0,
      availableCash: cashUsd,
      cryptoUsd: cryptoUsd,
      investmentsCount: Number(p.investmentsCount) || cryptoRows.length || 0,
      approvedUsd: approvedUsd,
      pendingUsd: pendingUsd,
      withdrawalPendingUsd: wdPending,
      withdrawalApprovedUsd: wdApproved,
      breakdown: breakdown,
      pendingNote: pendingNote,
      breakdownLabel: breakdown.length
        ? breakdown
            .map(function (b) {
              return b.tokens + " (" + formatMoneyUsd(b.usd) + ")";
            })
            .join(" · ")
        : ""
    };
  };

  function formatMoneyUsd(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    });
  }

  DWP.buildActivationPatch = function (data) {
    const d = data || {};
    const usdGross = DWP.depositUsdAmount(d);
    const credit = DWP.depositCreditAmount(d);
    let txs = DWP.getTransactionsList(d);
    const histById = DWP.depositHistoryById(d);

    let approvedPending = false;
    txs = txs.map(function (tx) {
      if (!DWP.isPendingDepositTx(tx)) return tx;
      approvedPending = true;
      const usd =
        Number(tx.amount) > 0
          ? Number(tx.amount)
          : DWP.depositUsdFromTx(tx, d);
      const hist = tx.id ? histById[tx.id] : null;
      const approved = Object.assign({}, tx, {
        status: "Approved",
        description: "Confirmed",
        amount: usd,
        date: tx.date || formatTxDate(d.depositSubmittedAt)
      });
      if (hist && Number(hist.depositTokenEquivalent) >= 0) {
        approved.depositTokenEquivalent = Number(hist.depositTokenEquivalent);
      }
      if (hist && Number(hist.depositUsdPriceAtSubmit) > 0) {
        approved.depositUsdPriceAtSubmit = Number(hist.depositUsdPriceAtSubmit);
      }
      return approved;
    });

    if (d.depositSubmitted && !approvedPending && usdGross > 0) {
      txs.unshift(
        DWP.buildDepositTransaction({
          date: formatTxDate(d.depositSubmittedAt),
          amount: usdGross,
          status: "Approved",
          method: (d.depositMethod || "").toUpperCase(),
          networkLabel: d.depositNetworkLabel || "",
          description: "Confirmed"
        })
      );
      approvedPending = true;
    }

    const approvedHistory = Array.isArray(d.depositHistory)
      ? d.depositHistory.map(function (rec) {
          const status = String(rec.status || "").toLowerCase();
          if (
            status.indexOf("pend") >= 0 ||
            !status ||
            status.indexOf("review") >= 0
          ) {
            return Object.assign({}, rec, { status: "Approved" });
          }
          return rec;
        })
      : d.depositHistory;

    const merged = Object.assign({}, d, {
      transactions: txs,
      depositHistory: approvedHistory,
      accountActivated: true,
      depositConfirmed: true
    });

    const portfolio = DWP.effectivePortfolio(merged);
    const prev = d.portfolio || {};
    if (!(Number(portfolio.totalBalance) > 0)) {
      portfolio.totalBalance = Number(prev.totalBalance) || 0;
    }

    const activities = Array.isArray(d.activities) && d.activities.length
      ? d.activities.slice()
      : [
          {
            text:
              "Welcome to Digital Wealth Partners, your one-stop solution for all your trading needs. We are thrilled to have you on board and look forward to helping you achieve your trading goals."
          }
        ];

    let cryptoHoldings = DWP.mergeAllDepositsIntoHoldings(
      DWP.defaultCryptoHoldings(),
      merged
    );

    const assetLabel =
      (DWP.depositAssetKey(d) &&
        DWP.ASSET_META[DWP.depositAssetKey(d)] &&
        DWP.ASSET_META[DWP.depositAssetKey(d)].symbol) ||
      "crypto";

    if (d.depositSubmitted && usdGross > 0) {
      activities.unshift({
        date: formatTxDate(d.depositSubmittedAt),
        text:
          "Your " +
          assetLabel +
          " deposit of " +
          usdGross.toLocaleString("en-US", {
            style: "currency",
            currency: "USD"
          }) +
          " has been confirmed and credited to your account."
      });
    } else if (credit > 0) {
      activities.unshift({
        date: formatTxDate(d.depositSubmittedAt),
        text:
          "Your deposit of " +
          credit.toLocaleString("en-US", {
            style: "currency",
            currency: "USD"
          }) +
          " has been confirmed and credited to your account."
      });
    }

    const assetKey = DWP.depositAssetKey(d);
    const priceAtActivate =
      Number(d.depositUsdPriceAtSubmit) > 0
        ? Number(d.depositUsdPriceAtSubmit)
        : assetKey && typeof DWP.getAssetUsdPrice === "function"
          ? DWP.getAssetUsdPrice(assetKey)
          : 0;
    const tokenEquivAtActivate =
      d.depositTokenEquivalent != null
        ? Number(d.depositTokenEquivalent)
        : assetKey && usdGross > 0 && priceAtActivate > 0
          ? usdGross / priceAtActivate
          : null;

    const patch = {
      accountActivated: true,
      depositConfirmed: !!d.depositSubmitted,
      depositAmountCurrency: "USD",
      portfolio: portfolio,
      transactions: txs,
      depositHistory: approvedHistory,
      cryptoHoldings: cryptoHoldings,
      allocation: d.allocation || [],
      investments: d.investments || [],
      purchaseHistory: d.purchaseHistory || [],
      activities: activities
    };

    if (priceAtActivate > 0) {
      patch.depositUsdPriceAtSubmit = priceAtActivate;
    }
    if (tokenEquivAtActivate != null && !isNaN(tokenEquivAtActivate)) {
      patch.depositTokenEquivalent = tokenEquivAtActivate;
    }

    // If an admin portfolio override exists, merge all newly-approved deposits
    // into it so the override stays in sync with real deposits.
    if (d.adminPortfolioOverride) {
      const prevHist = Array.isArray(d.depositHistory) ? d.depositHistory : [];
      const newlyApprovedRecs = prevHist.filter(function (rec) {
        const s = String(rec.status || "").toLowerCase();
        return !s || s.indexOf("pend") >= 0 || s.indexOf("review") >= 0;
      });

      if (newlyApprovedRecs.length > 0) {
        const updOvr = JSON.parse(JSON.stringify(d.adminPortfolioOverride));
        updOvr.cryptoHoldings = updOvr.cryptoHoldings || {};

        newlyApprovedRecs.forEach(function (rec) {
          const ak = DWP.assetKeyFromSymbol(rec.methodSymbol || rec.method);
          const te = Number(rec.depositTokenEquivalent);
          const sp = Number(rec.depositUsdPriceAtSubmit);
          const ua = Number(rec.amount || rec.totalCredit || 0);
          const lp = typeof DWP.getAssetUsdPrice === "function" ? DWP.getAssetUsdPrice(ak) : 0;
          const p = lp > 0 ? lp : sp > 0 ? sp : 0;
          const u = isFinite(te) && te > 0 ? te : (p > 0 ? ua / p : 0);
          const v = p > 0 ? u * p : ua;
          if (!ak || !(u > 0 || v > 0)) return;
          const ex = updOvr.cryptoHoldings[ak] || {};
          updOvr.cryptoHoldings[ak] = {
            value: (Number(ex.value) || 0) + v,
            units: (Number(ex.units) || 0) + u,
            price: p || Number(ex.price) || 0
          };
        });

        patch.adminPortfolioOverride = updOvr;
      }
    }

    const clean = DWP.sanitizeFirestorePatch(patch);
    if (DWP.FieldValue) {
      clean.activatedAt = DWP.FieldValue.serverTimestamp();
      clean.updatedAt = DWP.FieldValue.serverTimestamp();
    }
    return clean;
  };

  function formatWithdrawalDate(value) {
    if (value && value.toDate) {
      return value.toDate().toLocaleString("en-US");
    }
    if (value instanceof Date) {
      return value.toLocaleString("en-US");
    }
    if (typeof value === "string" && value) return value;
    return "—";
  }

  DWP.isPendingWithdrawal = function (rec) {
    if (!rec) return false;
    const s = String(rec.status || "").toLowerCase();
    if (s.indexOf("approv") >= 0 || s.indexOf("confirm") >= 0) return false;
    if (s.indexOf("den") >= 0 || s.indexOf("reject") >= 0) return false;
    return (
      isPendingTx({ status: rec.status }) ||
      !s ||
      s === "submitted" ||
      s.indexOf("review") >= 0
    );
  };

  /** All withdrawal requests (history + latest if missing from array). */
  DWP.getWithdrawalList = function (data) {
    const list = [];
    const seen = {};
    const hist = Array.isArray(data && data.withdrawalHistory)
      ? data.withdrawalHistory.slice()
      : [];

    hist.forEach(function (rec, idx) {
      if (!rec) return;
      const id = rec.id || "wd-hist-" + idx;
      if (seen[id]) return;
      seen[id] = true;
      list.push(Object.assign({ id: id }, rec));
    });

    const last = data && data.lastWithdrawalRequest;
    if (last && typeof last === "object") {
      const lid = last.id || "wd-last";
      if (!seen[lid]) {
        list.push(Object.assign({ id: lid }, last));
      }
    }

    list.sort(function (a, b) {
      const ta = a.requestedAt && a.requestedAt.toDate ? a.requestedAt.toDate().getTime() : 0;
      const tb = b.requestedAt && b.requestedAt.toDate ? b.requestedAt.toDate().getTime() : 0;
      return tb - ta;
    });

    return list;
  };

  DWP.getWithdrawalAdminSummary = function (data) {
    const list = DWP.getWithdrawalList(data || {});
    const pending = list.filter(DWP.isPendingWithdrawal);
    let label = "—";
    let tone = "none";
    if (pending.length) {
      label =
        pending.length === 1
          ? "1 withdrawal pending"
          : pending.length + " withdrawals pending";
      tone = "pending";
    } else if (list.length) {
      const last = list[0];
      const st = String(last.status || "—");
      label = st;
      tone =
        String(st).toLowerCase().indexOf("approv") >= 0
          ? "approved"
          : String(st).toLowerCase().indexOf("den") >= 0 ||
              String(st).toLowerCase().indexOf("reject") >= 0
            ? "rejected"
            : "none";
    }
    return {
      list: list,
      pendingCount: pending.length,
      label: label,
      tone: tone,
      hasAny: list.length > 0
    };
  };

  /**
   * Patch to approve or deny a withdrawal (updates history + lastWithdrawalRequest).
   * @param {string} newStatus — "Approved" or "Denied"
   */
  DWP.buildWithdrawalReviewPatch = function (data, withdrawalId, newStatus, reviewerEmail) {
    const d = data || {};
    const status =
      String(newStatus || "").toLowerCase().indexOf("approv") >= 0
        ? "Approved"
        : "Denied";
    const reviewedAt = DWP.clientTimestamp ? DWP.clientTimestamp() : new Date();
    const reviewer = reviewerEmail || null;

    function applyReview(rec) {
      if (!rec || !withdrawalId || rec.id !== withdrawalId) return rec;
      return Object.assign({}, rec, {
        status: status,
        reviewedAt: reviewedAt,
        reviewedBy: reviewer
      });
    }

    const history = DWP.getWithdrawalList(d).map(applyReview);
    let last = d.lastWithdrawalRequest;
    if (last) {
      const lid = last.id || "wd-last";
      if (withdrawalId && (lid === withdrawalId || !last.id)) {
        last = Object.assign({}, last, {
          id: withdrawalId,
          status: status,
          reviewedAt: reviewedAt,
          reviewedBy: reviewer
        });
      }
    }

    const amount = Number((last && last.amount) || 0);
    const activities = Array.isArray(d.activities) ? d.activities.slice() : [];
    if (amount > 0) {
      const money = amount.toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
      });
      const methodLabel =
        (last && (last.methodLabel || last.method)) || "crypto";
      activities.unshift({
        date: formatWithdrawalDate(reviewedAt),
        text:
          status === "Approved"
            ? "Your withdrawal of " +
              money +
              " via " +
              methodLabel +
              " has been approved and will be processed within 24–48 hours."
            : "Your withdrawal request of " +
              money +
              " via " +
              methodLabel +
              " was not approved. Contact support if you have questions."
      });
    }

    let txs = Array.isArray(d.transactions) ? d.transactions.slice() : [];
    txs = DWP.migrateWithdrawalHistoryToTransactions(d, txs);
    txs = txs.map(function (tx) {
      if (!withdrawalId || tx.id !== withdrawalId || !isWithdrawalTx(tx)) {
        return tx;
      }
      const desc =
        status === "Approved"
          ? "Withdrawal approved"
          : status === "Denied"
            ? "Withdrawal denied"
            : tx.description;
      return Object.assign({}, tx, {
        status: status,
        description: desc
      });
    });

    const merged = Object.assign({}, d, {
      withdrawalHistory: history,
      lastWithdrawalRequest: last,
      transactions: txs
    });
    const cryptoHoldings = DWP.mergeAllDepositsIntoHoldings(
      DWP.defaultCryptoHoldings(),
      merged
    );
    const portfolio = DWP.effectivePortfolio(merged);

    const patch = {
      withdrawalHistory: history,
      lastWithdrawalRequest: last,
      transactions: txs,
      cryptoHoldings: cryptoHoldings,
      portfolio: portfolio,
      activities: activities,
      updatedAt: DWP.FieldValue.serverTimestamp()
    };

    const clean = DWP.sanitizeFirestorePatch(patch);
    return clean;
  };

  /**
   * Approve or decline a single deposit entry by its id.
   * @param {object} data       — full application document data
   * @param {string} depositId  — the id field on the depositHistory / transaction entry
   * @param {string} action     — "approve" | "decline"
   * @param {string} [reviewerEmail]
   */
  DWP.buildSingleDepositReviewPatch = function (data, depositId, action, reviewerEmail) {
    const d = data || {};
    const isApprove = String(action || "").toLowerCase().indexOf("approv") >= 0;
    const newStatus = isApprove ? "Approved" : "Declined";
    const reviewedAt = typeof DWP.clientTimestamp === "function"
      ? DWP.clientTimestamp()
      : new Date();
    const reviewedAtStr = reviewedAt instanceof Date
      ? reviewedAt.toLocaleString("en-US")
      : (reviewedAt && reviewedAt.toDate ? reviewedAt.toDate().toLocaleString("en-US") : new Date().toLocaleString("en-US"));

    // Find the target deposit record for the activity message
    const depRec = Array.isArray(d.depositHistory)
      ? d.depositHistory.find(function (r) { return r && r.id === depositId; })
      : null;

    // Update depositHistory — only the matched entry changes status
    const depositHistory = Array.isArray(d.depositHistory)
      ? d.depositHistory.map(function (rec) {
          if (!rec || rec.id !== depositId) return rec;
          return Object.assign({}, rec, { status: newStatus });
        })
      : (d.depositHistory || []);

    // Update transactions — only the matched entry changes status
    const transactions = Array.isArray(d.transactions)
      ? d.transactions.map(function (tx) {
          if (!tx || tx.id !== depositId) return tx;
          return Object.assign({}, tx, {
            status: newStatus,
            description: isApprove ? "Confirmed" : "Declined"
          });
        })
      : (d.transactions || []);

    // Merge updated data to recompute holdings and portfolio
    const merged = Object.assign({}, d, {
      depositHistory: depositHistory,
      transactions: transactions,
      accountActivated: d.accountActivated || isApprove,
      depositConfirmed: d.depositConfirmed || isApprove
    });

    const cryptoHoldings = DWP.mergeAllDepositsIntoHoldings(
      DWP.defaultCryptoHoldings(),
      merged
    );
    const portfolio = DWP.effectivePortfolio(merged);

    // Activity feed entry
    const activities = Array.isArray(d.activities) ? d.activities.slice() : [];
    if (depRec) {
      const usd = Number(depRec.amount || depRec.totalCredit || 0);
      const sym = (depRec.methodSymbol || depRec.method || "crypto").toUpperCase();
      if (usd > 0) {
        const money = usd.toLocaleString("en-US", { style: "currency", currency: "USD" });
        activities.unshift({
          date: reviewedAtStr,
          text: isApprove
            ? "Your " + sym + " deposit of " + money + " has been confirmed and credited to your account."
            : "Your " + sym + " deposit of " + money + " could not be confirmed. Please contact support."
        });
      }
    }

    const patch = {
      depositHistory: depositHistory,
      transactions: transactions,
      cryptoHoldings: cryptoHoldings,
      portfolio: portfolio,
      activities: activities
    };

    // If this approval activates the account for the first time, set the flag
    if (isApprove && !d.accountActivated) {
      patch.accountActivated = true;
      patch.depositConfirmed = true;
      if (DWP.FieldValue) {
        patch.activatedAt = DWP.FieldValue.serverTimestamp();
      }
    }

    // If an admin portfolio override exists, merge the newly approved deposit
    // tokens into it so the override stays in sync with real deposits.
    if (isApprove && depRec && d.adminPortfolioOverride) {
      const depAssetKey = DWP.assetKeyFromSymbol(depRec.methodSymbol || depRec.method);
      const depTokenEquiv = Number(depRec.depositTokenEquivalent);
      const depUsdPrice = Number(depRec.depositUsdPriceAtSubmit);
      const depUsdAmount = Number(depRec.amount || depRec.totalCredit || 0);
      const depLivePrice = typeof DWP.getAssetUsdPrice === "function"
        ? DWP.getAssetUsdPrice(depAssetKey) : 0;
      const depPrice = depLivePrice > 0 ? depLivePrice : depUsdPrice > 0 ? depUsdPrice : 0;
      const depUnits = isFinite(depTokenEquiv) && depTokenEquiv > 0
        ? depTokenEquiv
        : (depPrice > 0 ? depUsdAmount / depPrice : 0);
      const depValue = depPrice > 0 ? depUnits * depPrice : depUsdAmount;

      if (depAssetKey && (depUnits > 0 || depValue > 0)) {
        const updOvr = JSON.parse(JSON.stringify(d.adminPortfolioOverride));
        updOvr.cryptoHoldings = updOvr.cryptoHoldings || {};
        const existing = updOvr.cryptoHoldings[depAssetKey] || {};
        updOvr.cryptoHoldings[depAssetKey] = {
          value: (Number(existing.value) || 0) + depValue,
          units: (Number(existing.units) || 0) + depUnits,
          price: depPrice || Number(existing.price) || 0
        };
        patch.adminPortfolioOverride = updOvr;
      }
    }

    const clean = DWP.sanitizeFirestorePatch(patch);
    if (DWP.FieldValue) {
      clean.updatedAt = DWP.FieldValue.serverTimestamp();
    }
    return clean;
  };
})();
