const axios = require("axios");
const FormData = require("form-data");

const GSUBZ_BASE_URL =
  process.env.GSUBZ_BASE_URL || "https://api.gsubz.com/api";

const gsubzApi = axios.create({
  baseURL: GSUBZ_BASE_URL,
  timeout: 30000,
});

const getAuthHeaders = () => ({
  Authorization: `Bearer ${process.env.GSUBZ_API_TOKEN}`,
});

// Get data plans
const getDataPlans = async (service) => {
  if (!service) {
    throw new Error("GSUBZ service is required");
  }

  const response = await gsubzApi.get("/plans", {
    params: {
      service,
    },
    headers: getAuthHeaders(),
  });

  return response.data;
};

// Buy data
const buyData = async ({
  serviceID,
  plan,
  phone,
  requestID,
}) => {
  if (!serviceID) {
    throw new Error("GSUBZ serviceID is required");
  }

  if (!plan) {
    throw new Error("GSUBZ plan is required");
  }

  if (!phone) {
    throw new Error("Customer phone is required");
  }

  const form = new FormData();

  form.append("serviceID", serviceID);
  form.append("plan", String(plan));
  form.append("api", process.env.GSUBZ_API_TOKEN);
  form.append("amount", "");
  form.append("phone", phone);

  if (requestID) {
    form.append("requestID", requestID);
  }

  const response = await gsubzApi.post("/pay/", form, {
    headers: {
      ...form.getHeaders(),
      ...getAuthHeaders(),
    },
  });

  return response.data;
};

// Buy airtime
const buyAirtime = async ({
  serviceID,
  amount,
  phone,
  requestID,
  email,
}) => {
  if (!serviceID) {
    throw new Error("GSUBZ airtime serviceID is required");
  }

  if (amount === undefined || amount === null || amount === "") {
    throw new Error("Airtime amount is required");
  }

  const airtimeAmount = Number(amount);

  if (!Number.isFinite(airtimeAmount) || airtimeAmount <= 0) {
    throw new Error("Invalid airtime amount");
  }

  if (!phone) {
    throw new Error("Customer phone is required");
  }

  const form = new FormData();

  form.append("serviceID", serviceID);
  form.append("amount", String(airtimeAmount));
  form.append("phone", phone);
  form.append("api", process.env.GSUBZ_API_TOKEN);

  if (requestID) {
    form.append("requestID", requestID);
  }

  if (email) {
    form.append("email", email);
  }

  const response = await gsubzApi.post("/pay/", form, {
    headers: {
      ...form.getHeaders(),
      ...getAuthHeaders(),
    },
  });

  return response.data;
};

// Buy electricity
const buyElectricity = async ({
  serviceID,
  amount,
  customerID,
  phone,
  requestID,
  plan,
}) => {
  if (!serviceID) {
    throw new Error("GSUBZ electricity serviceID is required");
  }

  if (amount === undefined || amount === null || amount === "") {
    throw new Error("Electricity amount is required");
  }

  const electricityAmount = Number(amount);

  if (!Number.isFinite(electricityAmount) || electricityAmount <= 0) {
    throw new Error("Invalid electricity amount");
  }

  if (!customerID) {
    throw new Error("Meter/customer ID is required");
  }

  if (!phone) {
    throw new Error("Customer phone is required");
  }

  const form = new FormData();

  form.append("serviceID", serviceID);
  form.append("amount", String(electricityAmount));
  form.append("customerID", String(customerID));
  form.append("phone", phone);
  form.append("api", process.env.GSUBZ_API_TOKEN);

  if (requestID) {
    form.append("requestID", requestID);
  }

  if (plan) {
    form.append("plan", plan);
  }

  const response = await gsubzApi.post("/pay/", form, {
    headers: {
      ...form.getHeaders(),
      ...getAuthHeaders(),
    },
  });

  return response.data;
};
// Buy TV subscription
const buyTV = async ({
  serviceID,
  plan,
  amount,
  customerID,
  phone,
  requestID,
  email,
}) => {
  if (!serviceID) {
    throw new Error("GSUBZ TV serviceID is required");
  }

  if (!plan) {
    throw new Error("TV plan is required");
  }

  if (amount === undefined || amount === null || amount === "") {
    throw new Error("TV amount is required");
  }

  const tvAmount = Number(amount);

  if (!Number.isFinite(tvAmount) || tvAmount <= 0) {
    throw new Error("Invalid TV amount");
  }

  if (!customerID) {
    throw new Error("SmartCard/IUC number is required");
  }

  if (!phone) {
    throw new Error("Customer phone is required");
  }

  const form = new FormData();

  form.append("serviceID", serviceID);
  form.append("plan", String(plan));
  form.append("amount", String(tvAmount));
  form.append("customerID", String(customerID));
  form.append("phone", phone);
  form.append("api", process.env.GSUBZ_API_TOKEN);

  if (requestID) {
    form.append("requestID", requestID);
  }

  if (email) {
    form.append("email", email);
  }

  const response = await gsubzApi.post("/pay/", form, {
    headers: {
      ...form.getHeaders(),
      ...getAuthHeaders(),
    },
  });

  return response.data;
};
module.exports = {
  getDataPlans,
  buyData,
  buyAirtime,
  buyElectricity,
};
