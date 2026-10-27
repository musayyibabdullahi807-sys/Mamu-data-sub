const normalizeNigeriaPhone = (input, { allowLegacyTenDigit = false } = {}) => {
  let phone = String(input || "").trim().replace(/[\s()-]/g, "");

  if (phone.startsWith("+234")) {
    phone = `0${phone.slice(4)}`;
  } else if (phone.startsWith("234")) {
    phone = `0${phone.slice(3)}`;
  } else if (allowLegacyTenDigit && /^[789]\d{9}$/.test(phone)) {
    // Older MAMU signups used the visible +234 prefix and stored only 10 digits.
    phone = `0${phone}`;
  }

  return /^0[789]\d{9}$/.test(phone) ? phone : null;
};

const getNigeriaPhoneCandidates = (nationalPhone) => {
  const subscriberNumber = nationalPhone.slice(1);
  return [
    nationalPhone,
    subscriberNumber,
    `+234${subscriberNumber}`,
    `234${subscriberNumber}`,
  ];
};

module.exports = { normalizeNigeriaPhone, getNigeriaPhoneCandidates };
