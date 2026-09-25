const API_BASE = "/api";

const signupForm = document.getElementById("signupForm");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const referralInput = document.getElementById("referralCode");
const signupBtn = document.getElementById("signupBtn");
const message = document.getElementById("message");

function eyeOpen() {
  return `
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="2.5"/>
  `;
}

function eyeClosed() {
  return `
    <path d="M3 3l18 18"/>
    <path d="M10.6 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.7"/>
    <path d="M6.2 6.2C3.5 8.2 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1"/>
  `;
}

function setupEyeButton(buttonId, input, eyeId) {
  const button = document.getElementById(buttonId);
  const eye = document.getElementById(eyeId);

  if (!button || !input || !eye) return;

  button.addEventListener("click", () => {
    const hidden = input.type === "password";

    input.type = hidden ? "text" : "password";

    eye.innerHTML = hidden
      ? eyeClosed()
      : eyeOpen();

    button.setAttribute(
      "aria-label",
      hidden ? "Hide password" : "Show password"
    );
  });
}

setupEyeButton(
  "togglePassword",
  passwordInput,
  "passwordEye"
);

setupEyeButton(
  "toggleConfirmPassword",
  confirmPasswordInput,
  "confirmPasswordEye"
);

function showMessage(text, type = "error") {
  if (!message) return;

  message.textContent = text;
  message.className = `message ${type}`;
  message.style.display = "block";
}

if (signupForm) {
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const referralCode = referralInput.value.trim();

    if (!name) {
      showMessage("Please enter your full name.");
      nameInput.focus();
      return;
    }

    if (!phone) {
      showMessage("Please enter your phone number.");
      phoneInput.focus();
      return;
    }

    if (password.length < 6) {
      showMessage("Password must contain at least 6 characters.");
      passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Passwords do not match.");
      confirmPasswordInput.focus();
      return;
    }

    signupBtn.disabled = true;
    signupBtn.innerHTML =
      '<span class="spinner"></span>Creating account...';

    message.style.display = "none";

    try {
      const requestBody = {
        name,
        phone,
        password
      };

      if (email) {
        requestBody.email = email;
      }

      if (referralCode) {
        requestBody.referralCode =
          referralCode.toUpperCase();
      }

      const response = await fetch(
        `${API_BASE}/auth/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create account."
        );
      }

      if (data.token) {
        localStorage.setItem(
          "mamu_token",
          data.token
        );
      }

      if (data.user) {
        localStorage.setItem(
          "mamu_user",
          JSON.stringify(data.user)
        );
      }

      showMessage(
        "Account created successfully. Opening your account...",
        "success"
      );

      setTimeout(() => {
        window.location.href = "./index.html";
      }, 500);

    } catch (error) {
      console.error("Signup error:", error);

      showMessage(
        error.message ||
        "Unable to create account. Please try again."
      );

      signupBtn.disabled = false;
      signupBtn.textContent = "Create account";
    }
  });
}
