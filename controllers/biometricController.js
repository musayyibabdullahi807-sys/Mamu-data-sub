const bcrypt = require("bcryptjs");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const User = require("../models/User");

function relyingParty(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "").split(",")[0].trim();
  const requestOrigin = `${protocol}://${host}`;
  const origin = process.env.WEBAUTHN_ORIGIN || requestOrigin;
  const rpID = process.env.WEBAUTHN_RP_ID || new URL(origin).hostname;
  return { origin, rpID };
}

function credentialRecord(passkey) {
  return {
    id: passkey.credentialID,
    publicKey: Buffer.from(passkey.publicKey, "base64url"),
    counter: passkey.counter,
    transports: passkey.transports || [],
  };
}

async function registrationOptions(req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const { pin } = req.body || {};
    if (!user.transactionPinHash) return res.status(400).json({ success: false, message: "Create your transaction PIN before enabling biometric unlock." });
    if (!/^\d{4}$/.test(String(pin || "")) || !(await bcrypt.compare(String(pin), user.transactionPinHash))) {
      return res.status(401).json({ success: false, message: "Enter your correct transaction PIN to enable biometric unlock." });
    }
    const { rpID } = relyingParty(req);
    const options = await generateRegistrationOptions({
      rpName: "MAMU DATA SUB",
      rpID,
      userID: new Uint8Array(Buffer.from(String(user._id))),
      userName: user.username || user.phone,
      userDisplayName: user.name,
      attestationType: "none",
      excludeCredentials: (user.passkeys || []).map((key) => ({ id: key.credentialID, transports: key.transports })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    user.passkeyChallenge = options.challenge;
    user.passkeyChallengeType = "registration";
    await user.save();
    return res.json({ success: true, options });
  } catch (error) {
    console.error("Passkey registration options error:", error.message);
    return res.status(500).json({ success: false, message: "Could not start biometric setup." });
  }
}

async function verifyRegistration(req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.passkeyChallenge || user.passkeyChallengeType !== "registration") return res.status(400).json({ success: false, message: "Biometric setup expired. Start again." });
    const { origin, rpID } = relyingParty(req);
    const verification = await verifyRegistrationResponse({
      response: req.body.credential,
      expectedChallenge: user.passkeyChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    user.passkeyChallenge = null;
    user.passkeyChallengeType = null;
    if (!verification.verified || !verification.registrationInfo) {
      await user.save();
      return res.status(400).json({ success: false, message: "Biometric setup could not be verified." });
    }
    const info = verification.registrationInfo;
    const credential = info.credential;
    const credentialID = Buffer.from(credential.id).toString("base64url");
    if (!(user.passkeys || []).some((item) => item.credentialID === credentialID)) {
      user.passkeys.push({
        credentialID,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: req.body.credential.response?.transports || [],
      });
    }
    await user.save();
    return res.json({ success: true, message: "Biometric unlock is ready on this device." });
  } catch (error) {
    console.error("Passkey registration verification error:", error.message);
    return res.status(400).json({ success: false, message: "Biometric setup failed. Please try again." });
  }
}

async function authenticationOptions(req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (!user.passkeys?.length) return res.status(404).json({ success: false, message: "No biometric passkey is registered." });
    const { rpID } = relyingParty(req);
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.passkeys.map((key) => ({ id: key.credentialID, transports: key.transports })),
      userVerification: "required",
    });
    user.passkeyChallenge = options.challenge;
    user.passkeyChallengeType = "authentication";
    await user.save();
    return res.json({ success: true, options });
  } catch (error) {
    console.error("Passkey authentication options error:", error.message);
    return res.status(500).json({ success: false, message: "Could not start biometric unlock." });
  }
}

async function verifyAuthentication(req, res) {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.passkeyChallenge || user.passkeyChallengeType !== "authentication") return res.status(400).json({ success: false, message: "Biometric request expired. Try again." });
    const credentialID = req.body.credential?.id;
    const passkey = (user.passkeys || []).find((key) => key.credentialID === credentialID);
    if (!passkey) return res.status(401).json({ success: false, message: "This device is not registered for biometric unlock." });
    const { origin, rpID } = relyingParty(req);
    const verification = await verifyAuthenticationResponse({
      response: req.body.credential,
      expectedChallenge: user.passkeyChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: credentialRecord(passkey),
      requireUserVerification: true,
    });
    user.passkeyChallenge = null;
    user.passkeyChallengeType = null;
    if (!verification.verified) {
      await user.save();
      return res.status(401).json({ success: false, message: "Biometric check failed." });
    }
    passkey.counter = verification.authenticationInfo.newCounter;
    await user.save();
    return res.json({ success: true, message: "Biometric unlock verified." });
  } catch (error) {
    console.error("Passkey authentication verification error:", error.message);
    return res.status(400).json({ success: false, message: "Biometric unlock failed. Use your PIN and try again." });
  }
}

async function passkeyStatus(req, res) {
  const user = await User.findById(req.user._id).select("passkeys");
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  return res.json({ success: true, enabled: Boolean(user.passkeys?.length) });
}

module.exports = { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication, passkeyStatus };
