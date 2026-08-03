import {
    getCustomerSession,
    saveCustomerSession,
    validateCustomerSession,
    workerRequest
}
from "./customer-session.js";

if(getCustomerSession()){
    validateCustomerSession()
    .then(customer => {
        if(customer){
            window.location.replace("customer-dashboard.html");
        }
    });
}

const loginForm = document.getElementById("loginForm");
const username = document.getElementById("customerUsername");
const password = document.getElementById("customerPassword");
const loginBtn = document.getElementById("loginBtn");
const errorBox = document.getElementById("loginError");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click",()=>{
    password.type = password.type === "password" ? "text" : "password";
    togglePassword.innerHTML = password.type === "password"
        ? `<i class="bi bi-eye"></i>`
        : `<i class="bi bi-eye-slash"></i>`;
});

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.classList.add("d-none");
    if(!username.value.trim() || !password.value.trim()){
        errorBox.textContent = "Please enter Mobile Number and Password.";
        errorBox.classList.remove("d-none");
        return;
    }
    const turnstileToken = window.turnstile?.getResponse();
    if(!turnstileToken){
        errorBox.textContent = "Please complete the security verification.";
        errorBox.classList.remove("d-none");
        return;
    }
    loginBtn.disabled = true;
    loginBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Login...`;
    try{
        const result = await workerRequest("/login", {
            username: username.value.trim(),
            password: password.value,
            turnstileToken
        });
        saveCustomerSession(result.session);
        password.value = "";
        window.location.href = "customer-dashboard.html";
    }
    catch(error){
        errorBox.textContent = "Invalid Mobile Number or Password.";
        errorBox.classList.remove("d-none");
        window.turnstile?.reset();
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
    }
});

const forgotForm = document.getElementById("forgotPasswordForm");
forgotForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = forgotForm.querySelector('input[name="Email"]').value.trim();
    const button = document.getElementById("forgotSubmitBtn");
    button.disabled = true;
    try { 
        await workerRequest("/forgot-password", { email }); 
        
        Swal.fire({
            icon: 'success',
            title: 'Email Sent!',
            text: 'Password reset email sent successfully.\nPlease check your inbox (and spam folder).',
            confirmButtonColor: '#0d6efd'
        });

        forgotForm.reset(); 
        bootstrap.Modal.getInstance(document.getElementById("forgotPasswordModal")).hide(); 
    }
    catch (error) { 
        Swal.fire({
            icon: 'error',
            title: 'Request Failed',
            text: 'Unable to process the request. Please try again.',
            confirmButtonColor: '#0d6efd'
        });
    }
    finally { 
        button.disabled = false; 
    }
});