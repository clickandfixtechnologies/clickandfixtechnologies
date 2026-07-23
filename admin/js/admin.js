/*=========================================
        FIREBASE ADMIN LOGIN
=========================================*/

import { auth } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/*=========================================
        AUTO REDIRECT
=========================================*/

onAuthStateChanged(auth, (user) => {

    if (user) {

        window.location.href = "dashboard.html";

    }

});

const password = 
document.getElementById("password");


const togglePassword =
document.getElementById("togglePassword");


const loginForm =
document.getElementById("loginForm");


const loginBtn =
document.getElementById("loginBtn");


const errorBox =
document.getElementById("loginError");



/*=========================================
        SHOW / HIDE PASSWORD
=========================================*/


togglePassword.addEventListener("click",()=>{


    if(password.type === "password"){


        password.type="text";


        togglePassword.innerHTML =
        '<i class="bi bi-eye-slash"></i>';


    }

    else{


        password.type="password";


        togglePassword.innerHTML =
        '<i class="bi bi-eye"></i>';


    }


});



/*=========================================
        FIREBASE LOGIN
=========================================*/


loginForm.addEventListener("submit",(e)=>{


    e.preventDefault();



    errorBox.classList.add("d-none");



    const email =
    document.getElementById("email")
    .value
    .trim();



    const pass =
    password.value.trim();



    if(email === "" || pass === ""){


        errorBox.innerHTML =
        "Please enter Email and Password.";


        errorBox.classList.remove("d-none");


        return;


    }



    loginBtn.disabled=true;



    loginBtn.innerHTML =

    `
    <span class="spinner-border spinner-border-sm me-2"></span>
    Signing In...
    `;



    signInWithEmailAndPassword(
        auth,
        email,
        pass
    )


    .then((userCredential)=>{


        console.log(
            "Login Successful:",
            userCredential.user.email
        );



        window.location.href =
        "dashboard.html";


    })


    .catch((error)=>{

    console.error("Login Failed:", error);

    let message = "Login Failed.";

    switch(error.code){

        case "auth/invalid-email":
            message = "Invalid Email Address.";
            break;

        case "auth/invalid-credential":
            message = "Invalid Email or Password.";
            break;

        case "auth/too-many-requests":
            message = "Too many attempts. Try again later.";
            break;

        case "auth/network-request-failed":
            message = "No Internet Connection.";
            break;

    }

    errorBox.innerHTML = message;

    errorBox.classList.remove("d-none");

    loginBtn.disabled = false;

    loginBtn.innerHTML = "Login";

});



});
