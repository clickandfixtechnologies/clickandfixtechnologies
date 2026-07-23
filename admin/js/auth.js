/*=========================================
        FIREBASE AUTH PROTECTION
=========================================*/

import { auth } from "./firebase.js";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";



/*=========================================
        CHECK LOGIN SESSION
=========================================*/


function protectPage(){


    onAuthStateChanged(auth, (user) => {

    if (!user) {

        window.location.href = "index.html";

    } else {

        console.log("Logged in as:", user.email);

    }

});


}



/*=========================================
        LOGOUT SYSTEM
=========================================*/


const logoutBtn =
document.getElementById("logoutBtn");


if(logoutBtn){


    logoutBtn.addEventListener("click",(e)=>{


        e.preventDefault();


        signOut(auth)
        .then(()=>{


            window.location.href="index.html";


        })


        .catch((error)=>{


            console.error("Logout Failed:", error);


        });


    });


}



/*=========================================
        RUN PROTECTION
=========================================*/


protectPage();


