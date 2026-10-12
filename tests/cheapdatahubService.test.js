const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePlanIdsHtml,
  buildPurchasePayload,
  buyData,
} = require("../services/cheapdatahubService");
const Transaction = require("../models/Transaction");

const samplePage = `
  <table id="planIdTable"><thead><tr><th>Network</th></tr></thead><tbody>
    <tr><td>AIRTEL</td><td>Data</td><td>1GB Gifting (7 days)</td><td><code>bundle_id</code></td><td><code>15</code></td><td>800.0</td></tr>
    <tr><td>MTN</td><td>Data</td><td>(Unavailable) 3GB plan</td><td><code>bundle_id</code></td><td><code>83</code></td><td>750.0</td></tr>
    <tr><td>MTN</td><td>Airtime</td><td>mtn Airtime</td><td><code>provider_id</code></td><td><code>1</code></td><td>—</td></tr>
  </tbody></table>`;

test("catalog parser uses CheapDataHub bundle IDs and listed price only", () => {
  const plans = parsePlanIdsHtml(samplePage);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].providerPlanId, "15");
  assert.equal(plans[0].sellingPrice, 800);
  assert.equal(plans[0].networkName, "AIRTEL");
  assert.match(plans[0]._id, /^cheapdatahub-15$/);
});

test("catalog parser fails closed if the documented plan table is missing", () => {
  assert.throws(() => parsePlanIdsHtml("<html>changed layout</html>"), /format was not recognized/);
});

test("purchase payload follows documented field names", () => {
  assert.deepEqual(buildPurchasePayload({ bundleId: "15", phone: "08012345678" }), {
    bundle_id: 15,
    phone_number: "08012345678",
  });
});

test("purchase is blocked without a backend API key before any HTTP call", async () => {
  const previous = process.env.CHEAPDATAHUB_API_KEY;
  delete process.env.CHEAPDATAHUB_API_KEY;
  await assert.rejects(buyData({ bundleId: "15", phone: "08012345678" }), {
    code: "CHEAPDATAHUB_KEY_MISSING",
  });
  if (previous !== undefined) process.env.CHEAPDATAHUB_API_KEY = previous;
});

test("MAMU transaction reference remains uniquely indexed for request deduplication", () => {
  const referenceIndex = Transaction.schema.indexes().find(([keys, options]) =>
    keys.reference === 1 && options.unique === true
  );
  assert.ok(referenceIndex);
});
