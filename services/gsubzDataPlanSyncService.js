const DataPlan = require("../models/DataPlan");
const { getDataPlans } = require("./gsubzService");

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
        const planName = String(item.displayName || "").trim();

        const providerPrice = Number(item.api_price);
        const sellingPrice = Number(item.price);

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
