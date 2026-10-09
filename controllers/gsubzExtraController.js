const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const {
  getDataPlans,
  buyGsubzPlan,
  generateRechargePins,
  sendBulkSms,
  getEsimCountries,
  getEsimPackages,
  buyEsim,
  getGames,
  getGameProducts,
  validateGamePlayer,
  buyGame,
  getGameOrder,
} = require("../services/gsubzService");

const EXAM_SERVICES = new Set(["waec", "neco", "nabteb", "jamb"]);
const PLAN_SERVICES = {
  education: EXAM_SERVICES,
  social: new Set(["socials"]),
  apps: new Set(["canva"]),
};
const ref = (prefix) => `MDS-${prefix}-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const ok = (result) => String(result?.status || "").toLowerCase() === "successful" || String(result?.status || "").toLowerCase() === "success";

async function getCatalog(req, res) {
  try {
    const kind = req.params.kind;
    if (PLAN_SERVICES[kind]) {
      const ids = [...PLAN_SERVICES[kind]];
      const lists = await Promise.all(ids.map(async (serviceID) => {
        try {
          const data = await getDataPlans(serviceID);
          return { serviceID, label: data.service || serviceID.toUpperCase(), plans: (data.plans || []).map((plan) => ({ id: String(plan.value ?? ""), name: String(plan.displayName ?? plan.name ?? serviceID), price: Number(plan.price), providerPrice: Number(plan.api_price), planField: data.PlanName || "plan" })).filter((plan) => plan.id && Number.isFinite(plan.price)) };
        } catch (_) { return { serviceID, label: serviceID.toUpperCase(), plans: [] }; }
      }));
      return res.json({ success: true, services: lists });
    }
    if (kind === "games") return res.json({ success: true, ...(await getGames(String(req.query.q || "").slice(0, 80))) });
    if (kind === "game-products") {
      const gameID = Number(req.query.gameID);
      if (!Number.isSafeInteger(gameID) || gameID < 1) return res.status(400).json({ success: false, message: "Choose a game first" });
      return res.json({ success: true, ...(await getGameProducts(gameID)) });
    }
    if (kind === "esim-countries") return res.json({ success: true, ...(await getEsimCountries(req.query.q || "")) });
    if (kind === "esim-packages") {
      const locationCode = String(req.query.locationCode || "").trim().slice(0, 100);
      if (!locationCode) return res.status(400).json({ success: false, message: "Choose a country first" });
      return res.json({ success: true, ...(await getEsimPackages(locationCode)) });
    }
    return res.status(404).json({ success: false, message: "Unknown service catalog" });
  } catch (error) {
    return res.status(502).json({ success: false, message: "Could not load service options from GSUBZ" });
  }
}

async function createPurchase(req, res) {
  let transaction;
  let charged = 0;
  try {
    const body = req.body || {};
    const category = String(body.category || "").trim().toLowerCase();
    const pin = String(body.pin || "").trim();
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ success: false, message: "Enter your 4-digit transaction PIN" });

    const user = await User.findById(req.user._id);
    if (!user || user.accountStatus !== "active") return res.status(403).json({ success: false, message: "Your account is not active" });
    if (!user.transactionPinHash) return res.status(400).json({ success: false, message: "Create your transaction PIN in Security settings first" });
    if (!(await bcrypt.compare(pin, user.transactionPinHash))) return res.status(401).json({ success: false, message: "Incorrect transaction PIN" });

    const requestID = ref(category.toUpperCase().slice(0, 8) || "SVC");
    let serviceID = "";
    let plan = "";
    let charge = 0;
    let purchase;
    let metadata = { category };

    if (PLAN_SERVICES[category]) {
      serviceID = String(body.serviceID || "").trim().toLowerCase();
      if (!PLAN_SERVICES[category].has(serviceID)) return res.status(400).json({ success: false, message: "Unsupported service" });
      const planData = await getDataPlans(serviceID);
      plan = String(body.plan || "");
      const selected = (planData.plans || []).find((item) => String(item.value) === plan);
      if (!selected) return res.status(400).json({ success: false, message: "Choose a valid plan" });
      charge = number(selected.price);
      if (!charge || charge <= 0) return res.status(400).json({ success: false, message: "This plan has no valid price" });
      if (category === "education" || category === "apps") {
        const phone = String(body.phone || "").replace(/\s+/g, "");
        if (!/^\d{10,15}$/.test(phone)) return res.status(400).json({ success: false, message: "Enter a valid phone number" });
        purchase = () => buyGsubzPlan({ serviceID, plan, phone, requestID, planField: planData.PlanName || "plan" });
        metadata = { ...metadata, serviceID, plan, phone, planName: selected.displayName || serviceID };
      } else {
        const link = String(body.link || "").trim();
        const quantity = Number(body.quantity);
        if (!/^https?:\/\//i.test(link) || link.length > 500) return res.status(400).json({ success: false, message: "Enter a valid public profile or post URL" });
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) return res.status(400).json({ success: false, message: "Enter a valid quantity" });
        purchase = () => buyGsubzPlan({ serviceID, plan, link, quantity, requestID, planField: planData.PlanName || "plan" });
        metadata = { ...metadata, serviceID, plan, link, quantity, planName: selected.displayName || serviceID };
      }
    } else if (category === "games") {
      const gameID = Number(body.gameID);
      const productID = String(body.productID || "").trim();
      if (!Number.isSafeInteger(gameID) || gameID < 1 || !productID) return res.status(400).json({ success: false, message: "Choose a game and product" });
      const gameData = await getGameProducts(gameID);
      const lines = gameData.lines || [];
      const selectedLine = lines.find((line) => (line.products || []).some((item) => String(item.productID) === productID));
      const selectedProduct = selectedLine?.products?.find((item) => String(item.productID) === productID);
      if (!selectedProduct || selectedProduct.inStock === false || !Number.isFinite(Number(selectedProduct.price)) || Number(selectedProduct.price) <= 0) return res.status(400).json({ success: false, message: "This game product is unavailable" });
      const providedFields = body.playerFields && typeof body.playerFields === "object" && !Array.isArray(body.playerFields) ? body.playerFields : {};
      const requirements = selectedLine.requirements || [];
      const fields = {};
      for (const requirement of requirements) {
        const key = String(requirement.field || "").trim();
        if (!key) continue;
        const value = String(providedFields[key] || "").trim();
        if (requirement.required && !value) return res.status(400).json({ success: false, message: `${requirement.label || key} is required` });
        if (value) {
          if (value.length > 160) return res.status(400).json({ success: false, message: `${requirement.label || key} is too long` });
          if (Array.isArray(requirement.options) && requirement.options.length && !requirement.options.some((option) => String(option.value ?? option.id ?? option.code ?? option.name ?? option) === value)) return res.status(400).json({ success: false, message: `Choose a valid ${requirement.label || key}` });
          fields[key] = value;
        }
      }
      if (requirements.length) {
        try {
          const validation = await validateGamePlayer({ productID, fields });
          if (!ok(validation)) return res.status(400).json({ success: false, message: validation.api_response || validation.description || "The game account could not be validated" });
        } catch (validationError) {
          const providerResult = validationError.response?.data;
          if (providerResult?.status) return res.status(400).json({ success: false, message: providerResult.api_response || providerResult.description || "The game account could not be validated" });
          throw validationError;
        }
      }
      charge = Number(selectedProduct.price);
      purchase = () => buyGame({ productID, fields, requestID });
      metadata = { category, gameID, gameName: gameData.game?.name || "Game", lineID: selectedLine.lineID, region: selectedLine.region, productID, productName: selectedProduct.name, playerFields: fields };
    } else if (category === "recharge") {
      const network = String(body.network || "").trim().toLowerCase();
      const value = Number(body.value), count = Number(body.count);
      if (!["mtn", "airtel", "glo", "9mobile"].includes(network) || ![100, 200, 400, 500].includes(value) || !Number.isSafeInteger(count) || count < (value < 500 ? 10 : 1) || count > 500) return res.status(400).json({ success: false, message: "Choose a supported network, PIN value, and quantity (minimum 10 PINs below ₦500)" });
      charge = value * count;
      purchase = () => generateRechargePins({ network, value, number: count });
      metadata = { category, network, value, count };
    } else if (category === "sms") {
      const sender = String(body.sender || "").trim();
      const message = String(body.message || "").trim();
      const rawNumbers = String(body.recipients || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const recipients = [...new Set(rawNumbers)];
      if (!/^[A-Za-z]{3,11}$/.test(sender) || !message || message.length > 905 || !recipients.length || recipients.length > 5000 || recipients.some((x) => !/^\+?\d{10,15}$/.test(x))) return res.status(400).json({ success: false, message: "Check sender ID, message and recipient phone numbers (up to 5,000)" });
      const unicode = /[^\u0000-\u007f]/.test(message);
      const limit = unicode ? (message.length <= 70 ? 70 : 67) : (message.length <= 160 ? 160 : 153);
      const pages = Math.ceil(message.length / limit);
      charge = pages * recipients.length * 5;
      purchase = () => sendBulkSms({ sender, recipients, message, requestID });
      metadata = { category, sender, message, recipients, pages };
    } else if (category === "esim") {
      const packageCode = String(body.packageCode || "").trim();
      const packages = await getEsimPackages(String(body.locationCode || "").trim());
      const selected = (packages.packages || []).find((item) => String(item.packageCode) === packageCode);
      if (!selected || !Number.isFinite(Number(selected.price)) || Number(selected.price) <= 0) return res.status(400).json({ success: false, message: "Choose a valid eSIM package" });
      charge = Number(selected.price);
      purchase = () => buyEsim({ packageCode, requestID });
      metadata = { category, packageCode, packageName: selected.name, country: selected.country };
    } else {
      return res.status(400).json({ success: false, message: "Unsupported service" });
    }

    if (!Number.isFinite(charge) || charge <= 0) return res.status(400).json({ success: false, message: "Invalid purchase amount" });
    transaction = await Transaction.create({ user: user._id, type: "gsubz_purchase", amount: charge, status: "pending", reference: requestID, description: `${category} purchase${serviceID ? ` - ${serviceID}` : ""}`, metadata: { ...metadata, requestID } });
    const updatedUser = await User.findOneAndUpdate({ _id: user._id, accountStatus: "active", walletBalance: { $gte: charge } }, { $inc: { walletBalance: -charge } }, { new: true });
    if (!updatedUser) {
      await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", metadata: { ...metadata, requestID, error: "Insufficient wallet balance" } });
      return res.status(400).json({ success: false, message: "Insufficient wallet balance", requiredAmount: charge });
    }
    charged = charge;

    let result;
    try { result = await purchase(); }
    catch (providerError) {
      const providerBody = providerError.response?.data;
      if (String(providerBody?.status || "").toLowerCase() === "failed") {
        const refund = await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: charged } }, { new: true });
        await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", metadata: { ...metadata, requestID, providerResponse: providerBody } });
        return res.status(400).json({ success: false, status: "failed", message: providerBody.api_response || providerBody.description || "Provider declined this request", reference: requestID, refunded: true, walletBalance: refund?.walletBalance ?? 0 });
      }
      await Transaction.findByIdAndUpdate(transaction._id, { status: "pending", metadata: { ...metadata, requestID, providerError: providerBody || providerError.message } });
      return res.status(202).json({ success: true, status: "pending", message: "Provider response is pending confirmation. Do not retry this purchase yet.", reference: requestID, walletBalance: updatedUser.walletBalance });
    }

    if (!ok(result)) {
      const refund = await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: charged } }, { new: true });
      await Transaction.findByIdAndUpdate(transaction._id, { status: "failed", metadata: { ...metadata, requestID, providerResponse: result } });
      return res.status(400).json({ success: false, status: "failed", message: result?.api_response || result?.message || "Provider declined this request", reference: requestID, refunded: true, walletBalance: refund?.walletBalance ?? 0 });
    }

    const providerAmount = category === "sms" ? number(result.amountPaid ?? result.amount) : null;
    if (providerAmount !== null && providerAmount >= 0 && Math.abs(charged - providerAmount) >= 0.01) {
      const difference = charged - providerAmount;
      if (difference > 0) {
        await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: difference } });
        charged = providerAmount;
      }
    }
    const finalUser = await User.findById(user._id).select("walletBalance");
    const isGameProcessing = category === "games" && String(result.orderStatus || "").toLowerCase() === "processing";
    const finalStatus = isGameProcessing ? "pending" : "successful";
    await Transaction.findByIdAndUpdate(transaction._id, { amount: charged, status: finalStatus, metadata: { ...metadata, requestID, providerResponse: result } });
    return res.json({ success: true, status: finalStatus, message: isGameProcessing ? "Game order is processing. Check its status shortly." : result.api_response || "Purchase successful", reference: requestID, amount: charged, walletBalance: finalUser?.walletBalance ?? 0, result });
  } catch (error) {
    console.error("GSUBZ extra service purchase error:", error.response?.data || error.message);
    if (transaction && charged === 0) await Transaction.findByIdAndUpdate(transaction._id, { status: "failed" }).catch(() => {});
    return res.status(500).json({ success: false, message: "Could not complete this service purchase" });
  }
}

async function checkGameOrder(req, res) {
  const requestID = String(req.params.requestID || "").slice(0, 100);
  const transaction = await Transaction.findOne({ user: req.user._id, reference: requestID, type: "gsubz_purchase", "metadata.category": "games" });
  if (!transaction) return res.status(404).json({ success: false, message: "Game order not found" });
  if (transaction.status !== "pending") return res.json({ success: true, status: transaction.status, result: transaction.metadata?.providerResponse || null });
  try {
    const data = await getGameOrder(requestID);
    const order = (data.orders || [])[0];
    const orderStatus = String(order?.orderStatus || "").toLowerCase();
    if (orderStatus === "completed") {
      await Transaction.findOneAndUpdate({ _id: transaction._id, status: "pending" }, { $set: { status: "successful", "metadata.providerResponse": order } });
      return res.json({ success: true, status: "successful", result: order });
    }
    if (orderStatus === "refunded") {
      const changed = await Transaction.findOneAndUpdate({ _id: transaction._id, status: "pending" }, { $set: { status: "reversed", "metadata.providerResponse": order } });
      if (changed) await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: transaction.amount } });
      return res.json({ success: true, status: "reversed", result: order });
    }
    return res.status(202).json({ success: true, status: "pending", result: order || null, message: "Game order is still processing" });
  } catch (error) {
    return res.status(502).json({ success: false, message: "Could not check game order status" });
  }
}

module.exports = { getCatalog, createPurchase, checkGameOrder };
