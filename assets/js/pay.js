"use strict";

/*=========================================
        Click & Fix Technologies
        Payment Portal
=========================================*/

const UPI_ID = "clicknfix@axl";

const BUSINESS_NAME =
    "Click & Fix Technologies";

const RAZORPAY_LINK =
    "https://razorpay.me/@clicknfixtechnologies";


/*=========================================
        URL Parameters
=========================================*/

const params =
    new URLSearchParams(window.location.search);

const customer =
    params.get("customer") || "Valued Customer";

const invoice =
    params.get("invoice") || "--";

const amount =
    params.get("amount") || "";



document.getElementById("customerName").textContent =
    customer;

document.getElementById("invoiceNo").textContent =
    invoice;

document.getElementById("amountDue").textContent =
    amount
        ? `₹${Number(amount).toLocaleString("en-IN")}`
        : "Custom Amount";



/*=========================================
        Copy UPI ID
=========================================*/

document
.getElementById("copyUpi")
.addEventListener("click", async () => {

    try{

        await navigator.clipboard.writeText(UPI_ID);

        const button =
            document.getElementById("copyUpi");

        button.textContent = "Copied ✓";

        setTimeout(()=>{

            button.textContent = "Copy";

        },2000);

    }

    catch{

        alert("Unable to copy UPI ID.");

    }

});



/*=========================================
        Create UPI Link
=========================================*/

function createUpiLink(){

    const url =
        new URL("upi://pay");

    url.searchParams.set(
        "pa",
        UPI_ID
    );

    url.searchParams.set(
        "pn",
        BUSINESS_NAME
    );

    if(amount){

        url.searchParams.set(
            "am",
            amount
        );

    }

    if(invoice !== "--"){

        url.searchParams.set(
            "tn",
            `Invoice ${invoice}`
        );

    }

    url.searchParams.set(
        "cu",
        "INR"
    );

    return url.toString();

}



/*=========================================
        Mobile Detect
=========================================*/

function isMobile(){

    return /Android|iPhone|iPad|iPod/i
        .test(
            navigator.userAgent
        );

}



/*=========================================
        Pay Now
=========================================*/

document
.getElementById("payNowButton")
.addEventListener("click",()=>{

    if(isMobile()){

        window.location.href =
            createUpiLink();

        setTimeout(()=>{

            window.location.href =
                RAZORPAY_LINK;

        },2000);

    }

    else{

        window.open(

            RAZORPAY_LINK,

            "_blank"

        );

    }

});



/*=========================================
        Enter Key Support
=========================================*/

document.addEventListener(

    "keydown",

    event=>{

        if(event.key==="Enter"){

            event.preventDefault();

            document
            .getElementById("payNowButton")
            .click();

        }

    }

);



/*=========================================
        Console
=========================================*/

console.log(

    "Click & Fix Payment Portal Loaded"

);