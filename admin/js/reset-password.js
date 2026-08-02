import { workerRequest } from "./customer-session.js";
const form = document.getElementById("resetPasswordForm");
const errorBox = document.getElementById("resetError");
const successBox = document.getElementById("resetSuccess");
const params = new URLSearchParams(window.location.search);
form.addEventListener("submit", async event => {
    event.preventDefault(); errorBox.classList.add("d-none");
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (!params.get("customerId") || !params.get("token") || newPassword !== confirmPassword) { errorBox.textContent = "Invalid reset link or passwords do not match."; errorBox.classList.remove("d-none"); return; }
    try { await workerRequest("/reset-password", { customerId: params.get("customerId"), token: params.get("token"), newPassword }); form.classList.add("d-none"); successBox.textContent = "Password reset successfully. You can now sign in."; successBox.classList.remove("d-none"); setTimeout(() => window.location.href = "customer-login.html", 2000); }
    catch (error) { errorBox.textContent = error.message || "Password reset failed."; errorBox.classList.remove("d-none"); }
});
