"use strict";

/*=========================================
        Click & Fix Technologies
        Payment Portal
=========================================*/

const UPI_ID = "Q73318287@ybl";

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

const rawAmount = params.get("amount") || "";

const amount = rawAmount
    .replace(/[₹,\s]/g, "")
    .trim();

const formattedAmount = amount
    ? Number(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
    : "";



document.getElementById("customerName").textContent =
    customer;

document.getElementById("invoiceNo").textContent =
    invoice;

document.getElementById("amountDue").textContent =
    formattedAmount
        ? `₹${formattedAmount}`
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

    const url = new URL("upi://pay");

    // Merchant UPI ID
    url.searchParams.set(
        "pa",
        UPI_ID
    );

    // Business Name
    url.searchParams.set(
        "pn",
        BUSINESS_NAME
    );

    // Amount
    if(amount){

        url.searchParams.set(
            "am",
            amount
        );

    }

    // Unique Transaction Reference
    const transactionRef =
        `CF-${invoice !== "--" ? invoice : Date.now()}`;

    url.searchParams.set(
        "tr",
        transactionRef
    );

    // Invoice / Transaction Note
    if(invoice !== "--"){

        url.searchParams.set(
            "tn",
            `Invoice ${invoice}`
        );

    }

    // Currency
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
.addEventListener("click", () => {

    const upiLink = createUpiLink();

    if (isMobile()) {

        const a = document.createElement("a");

        a.href = upiLink;

        a.style.display = "none";

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        setTimeout(() => {

    window.location.href = RAZORPAY_LINK;

    }, 120000);

    } else {

        window.open(RAZORPAY_LINK, "_blank");

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