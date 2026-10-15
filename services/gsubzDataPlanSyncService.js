const DataPlan = require("../models/DataPlan");
const { getDataPlans } = require("./gsubzService");

const MTN_SME_PRICE_OVERRIDES = [
  { sizeGb: 0.5, days: 7, price: 350 },
  { sizeGb: 1.5, days: 2, price: 650 },
  { sizeGb: 3, days: 30, price: 1500 },
  { sizeGb: 5, days: 30, price: 2000 },
  { sizeGb: 15, days: 7, price: 4500 },
  { sizeGb: 11, days: 7, price: 3700 },
  { sizeGb: 12.5, days: 14, price: 5000 },
];

function getSellingPrice(serviceId, planName, providerPrice, listedPrice) {
  if (serviceId !== "mtn_sme") return listedPrice;
  const text = String(planName || "").toLowerCase().replace(/,/g, "");
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(gb|g)\b/) || (() => {
    const mb = text.match(/(\d+(?:\.\d+)?)\s*mb\b/);
    return mb ? [mb[0], String(Number(mb[1]) / 1000), "gb"] : null;
  })();
  const daysMatch = text.match(/(\d+)\s*(?:days?|d)\b/);
  if (!sizeMatch || !daysMatch) return listedPrice;
  const sizeGb = Number(sizeMatch[1]);
  const days = Number(daysMatch[1]);
  const override = MTN_SME_PRICE_OVERRIDES.find((item) => item.sizeGb === sizeGb && item.days === days);
  return override ? override.price : listedPrice;
}

const GSUBZ_SERVICES = [
  { id: "mtn_sme", network: 1, networkName: "MTN" },
  { id: "mtn_gifting", network: 1, networkName: "MTN" },
  { id: "mtn_fibrex", network: 1, networkName: "MTN" },
  { id: "airtel_gifting", network: 4, networkName: "AIRTEL" },
  { id: "airtel_sme", network: 4, networkName: "AIRTEL" },
  { id: "glo_data", network: 2, networkName: "GLO" },
  { id: "glo_sme", network: 2, networkName: "GLO" },
  { id: "etisalat_data", network: 3, networkName: "9MOBILE" },
];

const syncGSUBZDataPlans = async () => {
  let total = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const service of GSUBZ_SERVICES) {
    try {
      const data = await getDataPlans(service.id);

      if (!data || !Array.isArray(data.plans)) {
        console.log(
          `⚠️ ${service.id}: no plans array returned`
        );
        continue;
      }

      for (const item of data.plans) {
        const providerPlanId = String(item.value || "").trim();
        const providerPlanName = String(item.displayName || "").trim();
        const planName = service.id === "mtn_sme"
          ? providerPlanName.replace(/\s*\(Promo:\s*N359\/GB\)/i, "").trim()
          : providerPlanName;

        const providerPrice = Number(item.api_price);
        const listedPrice = Number(item.price);
        const sellingPrice = getSellingPrice(service.id, providerPlanName, providerPrice, listedPrice);

        if (
          !providerPlanId ||
          !planName ||
          !Number.isFinite(providerPrice) ||
          !Number.isFinite(sellingPrice)
        ) {
          skipped++;
          continue;
        }

        const profit = Math.max(
          0,
          sellingPrice - providerPrice
        );

        const filter = {
          providerPlanId,
          planType: service.id,
        };

        const existingPlan = await DataPlan.findOne(filter);

        const update = {
          providerPlanId,
          network: service.network,
          networkName: service.networkName,
          planType: service.id,
          plan: planName,
          validity: planName,
          providerPrice,
          sellingPrice,
          profit,
          isActive: true,
        };

        if (existingPlan) {
          await DataPlan.updateOne(
            { _id: existingPlan._id },
            { $set: update }
          );

          updated++;
        } else {
          await DataPlan.create(update);

          created++;
        }

        total++;
      }

      console.log(
        `✅ ${service.id}: ${data.plans.length} plans processed`
      );
    } catch (error) {
      console.error(
        `❌ ${service.id}:`,
        error.response?.data || error.message
      );
    }
  }

  const currentServiceIds = GSUBZ_SERVICES.map((service) => service.id);
  await DataPlan.updateMany(
    { planType: { $nin: currentServiceIds }, isActive: true },
    { $set: { isActive: false } }
  );

  return {
    total,
    created,
    updated,
    skipped,
  };
};

module.exports = {
  syncGSUBZDataPlans,
};
