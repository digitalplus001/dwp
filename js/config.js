/**
 * SITE CONFIG — contact/admin emails, deposit wallets, site options.
 * Backend API: same origin (/api), configured via server/.env
 */
window.SITE_CONFIG = {
  contactEmail: "jakeclaver@digitalwealthpartners.co",
  adminEmails: [
    "jakeclaver@digitalwealthpartners.co",
    "admin@digitalwealthpartners.co",
    "anthonysmallwdr@gmail.com"
  ],
  /** Login with username "admin" maps to this Firebase email */
  adminUsernames: {
    admin: "admin@digitalwealthpartners.co"
  },
  /**
   * Deposit wallets per asset and blockchain network (addresses + QR on Deposit tab).
   * Each asset has one or more networks — user must pick the matching network before sending.
   */
  depositWallets: {
    BTC: {
      label: "Bitcoin",
      networks: [
        {
          id: "bitcoin",
          label: "Bitcoin",
          address: "bc1q2wawqktkrxcm57fwph0pdpd4qqkcxcn9qz9jfr"
        }
      ]
    },
    ETH: {
      label: "Ethereum",
      networks: [
        {
          id: "ethereum",
          label: "Ethereum Mainnet",
          address: "0x94145E242365C08340391E18bcf33915409BBa23"
        }
      ]
    },
    USDT: {
      label: "USDT (Tether)",
      networks: [
        {
          id: "erc20",
          label: "Ethereum (ERC-20)",
          address: "0x94145E242365C08340391E18bcf33915409BBa23"
        },
        {
          id: "trc20",
          label: "Tron (TRC-20)",
          address: "TQDvccnsD76tZc4scnNhf98ZH3zEm3P6se"
        }
      ]
    },
    USDC: {
      label: "USDC",
      networks: [
        {
          id: "erc20",
          label: "Ethereum (ERC-20)",
          address: "0x94145E242365C08340391E18bcf33915409BBa23"
        }
      ]
    },
    XRP: {
      label: "XRP",
      networks: [
        {
          id: "xrp",
          label: "XRP Ledger",
          address: "rw6xUhmQbyufJHzwAtPyje7mN7thDJfYqk"
        }
      ]
    },
    XLM: {
      label: "Stellar (XLM)",
      networks: [
        {
          id: "stellar",
          label: "Stellar",
          address: "GAMHE64OPEY5ZX7QN3AA3SGM7T7WRWAWFUVNO36PCHJPGECITZMGZVBP"
        }
      ]
    },
    TRX: {
      label: "Tron (TRX)",
      networks: [
        {
          id: "tron",
          label: "Tron",
          address: "TQDvccnsD76tZc4scnNhf98ZH3zEm3P6se"
        }
      ]
    },
    SOL: {
      label: "Solana",
      networks: [
        {
          id: "solana",
          label: "Solana",
          address: "E3j2DyL5c7FYDKWHzd7KzpHMLMDSZ2rVtUguPRFvZMJi"
        }
      ]
    },
    FLR: {
      label: "Flare",
      networks: [
        {
          id: "flare",
          label: "Flare Network",
          address: "0x94145E242365C08340391E18bcf33915409BBa23"
        }
      ]
    },
    HBAR: {
      label: "Hedera (HBAR)",
      networks: [
        {
          id: "hedera",
          label: "Hedera Network",
          address: ""
        }
      ]
    },
    LINK: {
      label: "Chainlink (LINK)",
      networks: [
        {
          id: "erc20",
          label: "Ethereum (ERC-20)",
          address: ""
        }
      ]
    },
    LTC: {
      label: "Litecoin",
      networks: [
        {
          id: "litecoin",
          label: "Litecoin Network",
          address: ""
        }
      ]
    },
    HYPE: {
      label: "Hyperliquid (HYPE)",
      networks: [
        {
          id: "hyperevm",
          label: "HyperEVM",
          address: ""
        }
      ]
    },
    SUI: {
      label: "Sui",
      networks: [
        {
          id: "sui",
          label: "Sui Network",
          address: ""
        }
      ]
    }
  },
  depositProcessingFee: 0,
  /**
   * Optional override per asset key (btc, eth, …). Defaults: assets/coins/{key}.svg
   * Icons use official brand colors — BTC #F7931A, ETH #627EEA, USDT #26A17B,
   * USDC #2775CA, XRP #23292F, XLM white circle + black mark, TRX #EF0027, SOL gradient, FLR #E62027.
   */
  assetCoinIcons: {},
  /** Minimum crypto withdrawal amount (USD). */
  withdrawalMinUsd: 100,
  withdrawalReasons: [
    { value: "personal", label: "Personal use" },
    { value: "investment", label: "Investment transfer" },
    { value: "business", label: "Business expense" },
    { value: "rebalance", label: "Portfolio rebalancing" },
    { value: "external", label: "Transfer to external wallet" },
    { value: "other", label: "Other" }
  ],
  /**
   * Live chat (Smartsupp — same as reference site). Leave empty to use built-in chat.
   * Get your key: Smartsupp dashboard → Settings → Chat box → Chat code
   */
  smartsuppKey: ""
};
