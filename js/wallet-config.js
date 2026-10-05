/**
 * Wallet config sync — loads admin-set deposit addresses from the API
 * and merges them into SITE_CONFIG.depositWallets so the deposit form
 * always reflects the live admin-managed addresses.
 */
(function () {
  window.DWP = window.DWP || {};

  /** Read from the API and merge into SITE_CONFIG.depositWallets. */
  DWP.loadWalletConfig = async function () {
    try {
      DWP.requireFirebase();
      const json = await DWP.apiGet("/api/site/deposit-wallets");
      const data = json && json.depositWallets;
      if (data && Object.keys(data).length > 0) {
        window.SITE_CONFIG = window.SITE_CONFIG || {};
        window.SITE_CONFIG.depositWallets = Object.assign(
          {},
          window.SITE_CONFIG.depositWallets || {},
          data
        );
      }
    } catch (err) {
      console.warn("[DWP] Could not load wallet config:", err.message || err);
    }
    return (window.SITE_CONFIG && window.SITE_CONFIG.depositWallets) || {};
  };

  /** Write admin-edited wallets to the API and update live config. */
  DWP.saveWalletConfig = async function (wallets) {
    DWP.requireFirebase();
    await DWP.apiSend("PUT", "/api/site/deposit-wallets", wallets);
    window.SITE_CONFIG = window.SITE_CONFIG || {};
    window.SITE_CONFIG.depositWallets = wallets;
  };
})();
