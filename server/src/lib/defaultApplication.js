// Default application document written at signup — identical shape to the
// legacy document the frontend builds in js/signup.js.
function defaultApplication({ uid, email, passwordless, ...fields }) {
  const now = new Date().toISOString();
  return {
    uid,
    email: email || "",
    phone: fields.phone || "",
    fullName: fields.fullName || "",
    dob: fields.dob || "",
    streetAddress: fields.streetAddress || "",
    country: fields.country || "",
    state: fields.state || "",
    city: fields.city || "",
    ssn: fields.ssn || "",
    llcName: fields.llcName || "",
    formationState: fields.formationState || "",
    formationDate: fields.formationDate || "",
    ownershipType: fields.ownershipType || "",
    primaryAsset: fields.primaryAsset || "",
    assetValue: fields.assetValue || "",
    useCase: fields.useCase || "",
    printedName: fields.printedName || "",
    signatureDate: fields.signatureDate || "",
    authorization: fields.authorization === true,

    status: "pending",
    accountActivated: false,
    depositSubmitted: false,

    portfolio: {
      totalBalance: 0,
      availableCash: 0,
      investmentsCount: 0,
      monthlyChange: 0,
      ytdChange: 0,
      totalReturn: 0,
      totalReturnPct: 0,
      dividendYield: 0,
    },
    cryptoHoldings: {
      xrp: { units: 0, price: 0.52, value: 0, return: 0 },
      xlm: { units: 0, price: 0.12, value: 0, return: 0 },
    },
    allocation: [],
    investments: [],
    purchaseHistory: [],
    activities: [],
    transactions: [],
    depositHistory: [],

    createdAt: now,
    updatedAt: now,
  };
}

module.exports = { defaultApplication };
