/*=========================================
      AUTO LOGIN CHECK
=========================================*/

if(localStorage.getItem("customerLogin")){

    window.location.replace(
        "customer-dashboard.html"
    );

}

/*=========================================
      CLICK & FIX CUSTOMER LOGIN
=========================================*/


import { db } from "./firebase.js";

import {

    getDocs,
    collection

}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



/*=========================================
        ELEMENTS
=========================================*/


const loginForm =
document.getElementById("loginForm");


const username =
document.getElementById("customerUsername");


const password =
document.getElementById("customerPassword");


const loginBtn =
document.getElementById("loginBtn");


const errorBox =
document.getElementById("loginError");



/*=========================================
        SHOW / HIDE PASSWORD
=========================================*/


const togglePassword =
document.getElementById("togglePassword");


togglePassword.addEventListener("click",()=>{


    if(password.type === "password"){


        password.type="text";


        togglePassword.innerHTML =
        `<i class="bi bi-eye-slash"></i>`;


    }

    else{


        password.type="password";


        togglePassword.innerHTML =
        `<i class="bi bi-eye"></i>`;


    }


});



/*=========================================
      CUSTOMER LOGIN (UPDATED & SECURE)
=========================================*/

loginForm.addEventListener("submit", async (e)=>{
    e.preventDefault();

    errorBox.classList.add("d-none");

    const mobile = username.value.trim();
    const pass = password.value.trim();

    if(mobile === "" || pass === ""){
        errorBox.innerHTML = "Please enter Mobile Number and Password.";
        errorBox.classList.remove("d-none");
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2"></span>
    Login...
    `;

    try{
        // Firebase থেকে ডেটা ফেচ করা হচ্ছে
        const snapshot = await getDocs(collection(db, "customers"));

        let foundCustomer = null;

        snapshot.forEach(doc => {
            const customer = doc.data();
            
            // ডেটাবেজ এবং ইনপুটের ডাটা স্ট্রিং-এ রূপান্তর করে এক্সট্রা স্পেস ক্লিন করা হচ্ছে
            const dbUsername = String(customer.username || customer.mobile || "").trim();
            const dbPassword = String(customer.password || "").trim();

            if(dbUsername === mobile && dbPassword === pass){
                foundCustomer = customer;
            }
        });

        if(!foundCustomer){
            throw new Error("Invalid Login");
        }

        // সফলভাবে লগইন হলে লোকাল স্টোরেজে ডেটা সেভ করা
        localStorage.setItem(
            "customerLogin",
            foundCustomer.mobile || foundCustomer.username
        );

        localStorage.setItem(
            "customerData",
            JSON.stringify(foundCustomer)
        );

        // ড্যাশবোর্ডে রিডাইরেক্ট
        window.location.href = "customer-dashboard.html";

    }
    catch(error){
        console.error("Login Error:", error);
        errorBox.innerHTML = "Invalid Mobile Number or Password.";
        errorBox.classList.remove("d-none");
        loginBtn.disabled = false;
        loginBtn.innerHTML = "Login";
    }
});

/*=========================================
      PASSWORD ASSISTANCE
=========================================*/

const forgotBtn =
document.getElementById("forgotPasswordBtn");

if(forgotBtn){

forgotBtn.addEventListener("click",(e)=>{

e.preventDefault();

new bootstrap.Modal(

document.getElementById("forgotPasswordModal")

).show();

});

}

/*=========================================
      PASSWORD REQUEST (AJAX)
=========================================*/

const forgotForm =
document.getElementById("forgotPasswordForm");

if(forgotForm){

forgotForm.addEventListener("submit", async (e)=>{

e.preventDefault();

/* Browser Info */

document.getElementById("browserInfo").value =
navigator.userAgent;

document.getElementById("platformInfo").value =
navigator.platform;

document.getElementById("languageInfo").value =
navigator.language;

const now = new Date();

document.getElementById("requestDate").value =
now.toLocaleDateString("en-GB");

document.getElementById("requestTime").value =
now.toLocaleTimeString("en-IN");

/* Loading */

const btn =
document.getElementById("forgotSubmitBtn");

const btnText =
document.getElementById("forgotBtnText");

btn.disabled = true;

btnText.innerHTML = `
<span class="spinner-border spinner-border-sm me-2"></span>
Sending Request...
`;

try{

const response = await fetch(

forgotForm.action,

{

method:"POST",

body:new FormData(forgotForm),

headers:{

Accept:"application/json"

}

}

);

if(response.ok){

    Swal.fire({

        icon: "success",

        title: "Request Submitted",

        text: "Your password request has been received successfully. Our support team will send your login password to your registered email after verification.",

        confirmButtonText: "OK",

        confirmButtonColor: "#0d6efd"

    });

    forgotForm.reset();

    bootstrap.Modal.getInstance(

        document.getElementById("forgotPasswordModal")

    ).hide();

}
else{

    Swal.fire({

        icon: "error",

        title: "Submission Failed",

        text: "Something went wrong. Please try again."

    });

}

}


catch(error){

Swal.fire({

    icon: "warning",

    title: "Network Error",

    text: "Please check your internet connection and try again."

});

}

/* Restore Button */

btn.disabled = false;

btnText.innerHTML = `
<i class="bi bi-send-fill me-2"></i>
Submit Password Request
`;

});

}

