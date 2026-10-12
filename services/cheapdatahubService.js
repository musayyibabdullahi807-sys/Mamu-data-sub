const axios = require("axios");

const PLAN_IDS_URL = "https://www.cheapdatahub.ng/api/plan-ids/";
const API_BASE_URL = "https://www.cheapdatahub.ng/api/v1/resellers/";
const http = axios.create({ timeout: 15000 });
let cachedPlans = null;
let cacheExpiresAt = 0;

const decodeHtml = (value) => String(value || "")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const cellText = (cell) => decodeHtml(
  String(cell || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
).replace(/\s+/g, " ").trim();

// The public Plan IDs page is the only published full catalog source.
// Its markup is not a documented API, so fail closed if its table changes.
const parsePlanIdsHtml = (html) => {
  const tableMatch = String(html || "").match(/<table\b[^>]*id=["']planIdTable["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) throw new Error("CheapDataHub plan catalog format was not recognized");

  const rows = tableMatch[1].match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const plans = [];

  for (const row of rows) {
    const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 6) continue;

    const [networkName, service, plan, requestField, idText, priceText] = cells.map(cellText);
    const bundleId = Number(idText);
    const providerPrice = Number(priceText.replace(/[^\d.]/g, ""));

    if (
      service.toLowerCase() !== "data" ||
      requestField.replace(/`/g, "").toLowerCase() !== "bundle_id" ||
      !Number.isSafeInteger(bundleId) || bundleId <= 0 ||
      !Number.isFinite(providerPrice) || providerPrice <= 0 ||
      /unavailable/i.test(plan)
    ) continue;

    plans.push({
      _id: `cheapdatahub-${bundleId}`,
      provider: "cheapdatahub",
      providerPlanId: String(bundleId),
      network: networkName.toUpperCase(),
      networkName: networkName.toUpperCase(),
      planType: "cheapdatahub",
      plan,
      validity: (plan.match(/\(([^()]*)\)\s*$/) || [])[1] || "Data",
      providerPrice,
      sellingPrice: providerPrice,
      profit: 0,
      isActive: true,
    });
  }

  return plans;
};

const getDataPlans = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && cachedPlans && Date.now() < cacheExpiresAt) return cachedPlans;
  const response = await http.get(PLAN_IDS_URL, { responseType: "text" });
  const plans = parsePlanIdsHtml(response.data);
  if (!plans.length) throw new Error("CheapDataHub returned no available data plans");
  cachedPlans = plans;
  cacheExpiresAt = Date.now() + 5 * 60 * 1000;
  return plans;
};

const buildPurchasePayload = ({ bundleId, phone }) => ({
  bundle_id: Number(bundleId),
  phone_number: String(phone),
});

const buyData = async ({ bundleId, phone }) => {
  const apiKey = process.env.CHEAPDATAHUB_API_KEY;
  if (!apiKey) {
    const error = new Error("CheapDataHub API key is not configured on the server");
    error.code = "CHEAPDATAHUB_KEY_MISSING";
    throw error;
  }

  const payload = buildPurchasePayload({ bundleId, phone });
  if (!Number.isSafeInteger(payload.bundle_id) || payload.bundle_id <= 0) {
    throw new Error("Invalid CheapDataHub bundle ID");
  }

  const response = await http.post(`${API_BASE_URL}data/purchase/`, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  return response.data;
};

module.exports = {
  API_BASE_URL,
  PLAN_IDS_URL,
  parsePlanIdsHtml,
  getDataPlans,
  buildPurchasePayload,
  buyData,
};
