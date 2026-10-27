window.normalizeNigeriaPhone = (input, allowLegacyTenDigit = false) => {
  let phone = String(input || "").trim().replace(/[\s()-]/g, "");

  if (phone.startsWith("+234")) {
    phone = `0${phone.slice(4)}`;
  } else if (phone.startsWith("234")) {
    phone = `0${phone.slice(3)}`;
  } else if (allowLegacyTenDigit && /^[789]\d{9}$/.test(phone)) {
    phone = `0${phone}`;
  }

  return /^0[789]\d{9}$/.test(phone) ? phone : null;
};
