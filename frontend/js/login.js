const API_BASE = "/api";

const loginForm = document.getElementById("loginForm");
const phoneInput = document.getElementById("phone");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

// If already logged in, go to dashboard
const existingToken = localStorage.getItem("mamu_token");

if (existingToken) {
  window.location.href = "./index.html";
}

// Show / hide password
if (togglePassword) {
  togglePassword.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";

    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.textContent = isPassword ? "🙈" : "👁️";
  });
}

// Show message
function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message ${type}`;
  message.style.display = "block";
}

// Login
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = phoneInput.value.trim();
  const password = passwordInput.value;

  if (!phone) {
    showMessage("Please enter your phone number.");
    phoneInput.focus();
    return;
  }

  if (!password) {
    showMessage("Please enter your password.");
    passwordInput.focus();
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";
  message.style.display = "none";

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        phone,
        password
      })
    });

    const data = await response.json();

    console.log("Login response:", data);

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Login failed."
      );
    }

    // Save JWT
    localStorage.setItem(
      "mamu_token",
      data.token
    );

    // Save user
    if (data.user) {
      localStorage.setItem(
        "mamu_user",
        JSON.stringify(data.user)
      );
    }

    showMessage(
      "Login successful. Opening your account...",
      "success"
    );

    setTimeout(() => {
      window.location.href = "./index.html";
    }, 500);

  } catch (error) {
    console.error("Login error:", error);

    showMessage(
      error.message ||
      "Unable to login. Please try again."
    );

    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});
