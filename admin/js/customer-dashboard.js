import {
    clearCustomerSession,
    getCustomerSession,
    isSessionAuthenticationFailure,
    saveCustomerSession,
    startSessionExpiryTimer,
    validateCustomerSession,
    workerRequest
}
from "./customer-session.js";

import {
    generateTemporaryPassword
}
from "./password-security.js";

/*=========================================
      GLOBAL JOBS ARRAY
=========================================*/

let jobs = [];
let customerOffers = [];
let activeOfferIndex = 0;

/*=========================================
      LOGIN GUARD
=========================================*/

const customerSession =
    getCustomerSession();

if(!customerSession){

    window.location.replace(
        "customer-login.html"
    );

    throw new Error("Customer Not Logged In");

}

/*=========================================
      Click & Fix Technologies
      Customer Dashboard v1
=========================================*/

/*=========================================
      STORAGE KEYS
=========================================*/

const CUSTOMER_KEY = "cf_customers";



/*=========================================
      CUSTOMER SESSION
=========================================*/

/*
Temporary Login

Later Replace With Firebase Auth
*/

const currentCustomerMobile = customerSession;
/*=========================================
      SESSION PROTECTION
=========================================*/

if(currentCustomerMobile === ""){

    window.location.href =
        "customer-login.html";

}
/*=========================================
      LOAD DATA
=========================================*/

/*=========================================
      CUSTOMER DATA
=========================================*/

let customer = null;


/*=========================================
      FIND CUSTOMER
=========================================*/



/*=========================================
      LOGIN CHECK
=========================================*/

loadDashboard();

function showDashboardLoadError(error) {
    const banner = document.getElementById("statusBanner");
    const message = "We could not load your dashboard right now. Your session is still active. Please try again shortly.";

    if (banner) {
        banner.textContent = message;
        banner.closest(".alert")?.classList.replace("alert-primary", "alert-warning");
    }

    console.error("[Customer Dashboard] Dashboard API failure.", {
        path: error?.path || "/customer-dashboard",
        status: error?.status || 0,
        code: error?.code || "",
        message: error?.message || ""
    });
}

async function loadDashboard() {
    let sessionCustomer;

    try {
        console.info("[Customer Dashboard] Starting session validation.");
        sessionCustomer = await validateCustomerSession();
    } catch (error) {
        showDashboardLoadError(error);
        return;
    }

    if (!sessionCustomer) {
        console.info("[Customer Dashboard] Session is invalid; redirecting to login.");
        window.location.replace("customer-login.html");
        return;
    }

    try {
        console.info("[Customer Dashboard] Session validation succeeded.");
        const result = await workerRequest("/customer-dashboard");
        customer = result.customer;
        jobs = result.jobs || [];
        loadCustomerDashboard(jobs);
        console.info("[Customer Dashboard] Dashboard data loaded.");
    } catch (error) {
        if (isSessionAuthenticationFailure(error)) {
            clearCustomerSession();
            window.location.replace("customer-login.html");
            return;
        }

        showDashboardLoadError(error);
        return;
    }

    try {
        await loadCustomerOffers();
        console.info("[Customer Dashboard] Customer offers loaded.");
    } catch (error) {
        if (isSessionAuthenticationFailure(error)) {
            clearCustomerSession();
            window.location.replace("customer-login.html");
            return;
        }

        renderCustomerOffersErrorState(error);
    }
}

/*=========================================
      LOAD DASHBOARD
=========================================*/

/*=========================================
        CUSTOMER OFFERS
=========================================*/

function offerEscape(value = "") {
    return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function offerMoney(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value || 0));
}

function offerDate(value) {
    if (!value || Number.isNaN(Date.parse(value))) return "-";
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(new Date(value));
}

function offerAssignmentState(assignment) {
    const labels = {
        ASSIGNED: '<span class="badge bg-primary">Available</span>',
        VIEWED: '<span class="badge bg-primary">Available</span>',
        CLAIMED: '<span class="badge bg-warning text-dark">Claim Submitted</span>',
        APPROVED: '<span class="badge bg-success">Approved</span>',
        REDEEMED: '<span class="badge bg-primary">Redeemed</span>'
    };
    return labels[assignment.status] || '<span class="badge bg-secondary">Unavailable</span>';
}

function offerCodeDetails(assignment) {
    if (assignment.status === "REDEEMED") {
        return `<small class="text-muted d-block">Offer Code: <code>${offerEscape(assignment.offerCode || "-")}</code></small><small class="text-muted">Redeemed on ${offerDate(assignment.redeemedAt)}</small>`;
    }

    if (assignment.status === "APPROVED" && assignment.offerCode) {
        return `<small class="text-success d-block mb-2">🎉 Offer Approved</small><div class="d-flex align-items-center gap-2 flex-wrap"><code>${offerEscape(assignment.offerCode)}</code><button type="button" class="btn btn-outline-primary btn-sm" data-copy-offer-code="${offerEscape(assignment.offerCode)}"><i class="bi bi-copy me-1"></i>Copy Code</button></div>`;
    }

    return '<small class="text-muted">Your claim is being processed.</small>';
}

async function loadCustomerOffers() {
    const result = await workerRequest("/offers", { action: "list" });
    customerOffers = result.offers || [];
    renderCustomerOffers();

    const availableOffers = customerOffers.filter(assignment =>
        ["ASSIGNED", "VIEWED"].includes(assignment.status)
    );
    const popupKey = `customerOffersPopupShown:${getCustomerSession()}`;

    if (availableOffers.length && !sessionStorage.getItem(popupKey)) {
        sessionStorage.setItem(popupKey, "true");
        const firstIndex = customerOffers.findIndex(assignment => assignment.assignmentId === availableOffers[0].assignmentId);
        window.setTimeout(() => openOfferCenter(Math.max(0, firstIndex)), 350);
    }
}

function renderCustomerOffersErrorState(error) {
    const list = document.getElementById("customerOffersList");
    const badge = document.getElementById("offerBadgeCount");

    if (badge) badge.textContent = "0";
    if (list) {
        list.innerHTML = '<div class="col-12 text-center py-4 text-muted">Offers are temporarily unavailable. Please try again shortly.</div>';
    }

    console.error("[Customer Dashboard] Offers API failure.", {
        path: error?.path || "/offers",
        status: error?.status || 0,
        code: error?.code || "",
        message: error?.message || ""
    });
}

function renderCustomerOffers() {
    const list = document.getElementById("customerOffersList");
    const badge = document.getElementById("offerBadgeCount");

    badge.textContent = customerOffers.length;

    if (!customerOffers.length) {
        list.innerHTML = '<div class="col-12 text-center py-4 text-muted">No active offers are available right now.</div>';
        return;
    }

    list.innerHTML = customerOffers.map(assignment => {
        const offer = assignment.offer || {};
        const available = ["ASSIGNED", "VIEWED"].includes(assignment.status);
        return `
            <div class="col-md-6 col-xl-4">
                <article class="customer-offer-card">
                    <div class="d-flex justify-content-between align-items-start gap-2"><h6 class="mb-2">${offerEscape(offer.title)}</h6>${offerAssignmentState(assignment)}</div>
                    <p class="offer-description mb-3">${offerEscape(offer.description || offer.productOrService || "Exclusive customer offer")}</p>
                    <div class="mb-1"><span class="offer-original-price">${Number(offer.originalPrice || 0) > 0 ? offerMoney(offer.originalPrice) : ""}</span></div>
                    <div class="offer-price mb-3">${Number(offer.offerPrice || 0) > 0 ? offerMoney(offer.offerPrice) : "Special price available"}</div>
                    <small class="d-block text-muted mb-3"><i class="bi bi-clock me-1"></i>Valid until ${offerDate(offer.expiryDate)}</small>
                    ${available ? `<button class="btn btn-warning btn-sm me-2" data-offer-action="open" data-assignment-id="${offerEscape(assignment.assignmentId)}"><i class="bi bi-gift me-1"></i>View Offer</button><button class="btn btn-outline-light btn-sm" data-offer-action="claim" data-assignment-id="${offerEscape(assignment.assignmentId)}">Grab This Offer</button>` : offerCodeDetails(assignment)}
                </article>
            </div>`;
    }).join("");
}

async function trackOfferView(assignment) {
    if (!assignment || assignment.viewedAt || !["ASSIGNED", "VIEWED"].includes(assignment.status)) return;

    try {
        const result = await workerRequest("/offers", {
            action: "view",
            assignmentId: assignment.assignmentId
        });
        const index = customerOffers.findIndex(item => item.assignmentId === assignment.assignmentId);
        if (index >= 0) customerOffers[index] = { ...customerOffers[index], ...result.assignment };
    } catch (error) {
        console.error("Offer view tracking failed", error);
    }
}

function offerCenterHtml(assignment) {
    const offer = assignment.offer || {};
    const available = ["ASSIGNED", "VIEWED"].includes(assignment.status);
    const discount = Number(offer.originalPrice || 0) - Number(offer.offerPrice || 0);

    return `
        <div class="offer-center-content">
            <div class="text-center mb-4"><div class="display-5 mb-2">🎁</div><h3>${offerEscape(offer.title)}</h3><p class="text-muted mb-0">${offerEscape(offer.productOrService || "Exclusive offer for you")}</p></div>
            <div class="row g-3 mb-3">
                <div class="col-sm-4"><div class="offer-highlight"><small>Regular Price</small><strong class="text-decoration-line-through">${Number(offer.originalPrice || 0) > 0 ? offerMoney(offer.originalPrice) : "-"}</strong></div></div>
                <div class="col-sm-4"><div class="offer-highlight"><small>Special Price</small><strong class="text-warning">${Number(offer.offerPrice || 0) > 0 ? offerMoney(offer.offerPrice) : "Available"}</strong></div></div>
                <div class="col-sm-4"><div class="offer-highlight"><small>You Save</small><strong>${discount > 0 ? offerMoney(discount) : offerEscape(offer.discountValue || "-")}</strong></div></div>
            </div>
            <p class="mb-3" style="white-space:pre-wrap">${offerEscape(offer.description || "")}</p>
            <div class="offer-highlight mb-3"><small>Valid Until</small><strong>${offerDate(offer.expiryDate)}</strong></div>
            ${offer.termsAndConditions ? `<details class="mb-3"><summary>Terms &amp; Conditions</summary><p class="text-muted mt-2 mb-0" style="white-space:pre-wrap">${offerEscape(offer.termsAndConditions)}</p></details>` : ""}
            <div class="text-center">${available ? `<button class="btn btn-warning px-4" data-center-claim="${offerEscape(assignment.assignmentId)}"><i class="bi bi-hand-index-thumb-fill me-1"></i>Grab This Offer</button>` : assignment.status === "CLAIMED" ? '<span class="badge bg-warning text-dark px-3 py-2">🟡 Claim Submitted</span>' : assignment.status === "REDEEMED" ? `<span class="badge bg-primary px-3 py-2">🔵 Redeemed${assignment.offerCode ? ` · ${offerEscape(assignment.offerCode)}` : ""}</span><small class="d-block text-muted mt-2">Redeemed on ${offerDate(assignment.redeemedAt)}</small>` : `<span class="badge bg-success px-3 py-2">🟢 Approved${assignment.offerCode ? ` · ${offerEscape(assignment.offerCode)}` : ""}</span>${assignment.offerCode ? `<button type="button" class="btn btn-outline-primary btn-sm ms-2" data-copy-offer-code="${offerEscape(assignment.offerCode)}"><i class="bi bi-copy me-1"></i>Copy Code</button>` : ""}`}</div>
        </div>`;
}

async function openOfferCenter(index) {
    if (!customerOffers.length) return;
    activeOfferIndex = (index + customerOffers.length) % customerOffers.length;
    const assignment = customerOffers[activeOfferIndex];
    document.getElementById("offerCenterPosition").textContent = `Offer ${activeOfferIndex + 1} of ${customerOffers.length}`;
    document.getElementById("offerCenterContent").innerHTML = offerCenterHtml(assignment);
    document.getElementById("previousOfferButton").disabled = customerOffers.length < 2;
    document.getElementById("nextOfferButton").disabled = customerOffers.length < 2;
    bootstrap.Modal.getOrCreateInstance(document.getElementById("offerCenterModal")).show();
    await trackOfferView(assignment);
    renderCustomerOffers();
}

function openOfferClaim(assignmentId) {
    const assignment = customerOffers.find(item => item.assignmentId === assignmentId);
    if (!assignment || !["ASSIGNED", "VIEWED"].includes(assignment.status)) return;
    document.getElementById("claimAssignmentId").value = assignmentId;
    document.getElementById("claimCustomerName").textContent = customer.name || "-";
    document.getElementById("claimCustomerId").textContent = customer.customerId || "-";
    document.getElementById("claimOfferName").textContent = assignment.offer?.title || "-";
    document.getElementById("claimPreferredContact").value = "";
    document.getElementById("claimAdditionalNote").value = "";
    bootstrap.Modal.getOrCreateInstance(document.getElementById("offerCenterModal")).hide();
    bootstrap.Modal.getOrCreateInstance(document.getElementById("offerClaimModal")).show();
}

document.getElementById("customerOffersList").addEventListener("click", event => {
    const copyButton = event.target.closest("[data-copy-offer-code]");
    if (copyButton) {
        copyOfferCode(copyButton.dataset.copyOfferCode, copyButton);
        return;
    }
    const button = event.target.closest("[data-offer-action]");
    if (!button) return;
    const assignmentId = button.dataset.assignmentId;
    if (button.dataset.offerAction === "open") openOfferCenter(customerOffers.findIndex(item => item.assignmentId === assignmentId));
    if (button.dataset.offerAction === "claim") openOfferClaim(assignmentId);
});

document.getElementById("offerCenterContent").addEventListener("click", event => {
    const copyButton = event.target.closest("[data-copy-offer-code]");
    if (copyButton) {
        copyOfferCode(copyButton.dataset.copyOfferCode, copyButton);
        return;
    }
    const button = event.target.closest("[data-center-claim]");
    if (button) openOfferClaim(button.dataset.centerClaim);
});

async function copyOfferCode(code, button) {
    if (!code) return;

    try {
        await navigator.clipboard.writeText(code);
        const original = button.innerHTML;
        button.innerHTML = '<i class="bi bi-check2 me-1"></i>Copied';
        window.setTimeout(() => { button.innerHTML = original; }, 1600);
    } catch (error) {
        console.error("Offer code copy failed", error);
        Swal.fire({ icon: "error", title: "Could not copy code", text: "Please copy the offer code manually.", background: "#0f172a", color: "#ffffff", confirmButtonColor: "#7c3aed" });
    }
}

document.getElementById("previousOfferButton").addEventListener("click", () => openOfferCenter(activeOfferIndex - 1));
document.getElementById("nextOfferButton").addEventListener("click", () => openOfferCenter(activeOfferIndex + 1));

document.getElementById("offerClaimForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("confirmOfferClaim");
    const assignmentId = document.getElementById("claimAssignmentId").value;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Submitting...';

    try {
        const result = await workerRequest("/offers", {
            action: "claim",
            assignmentId,
            preferredContact: document.getElementById("claimPreferredContact").value,
            additionalNote: document.getElementById("claimAdditionalNote").value.trim()
        });
        const index = customerOffers.findIndex(item => item.assignmentId === assignmentId);
        if (index >= 0) customerOffers[index] = { ...customerOffers[index], ...result.assignment };
        renderCustomerOffers();
        bootstrap.Modal.getInstance(document.getElementById("offerClaimModal")).hide();
        Swal.fire({ icon: "success", title: "Offer Claimed Successfully", text: "Your claim has been submitted. We will process your offer shortly.", background: "#0f172a", color: "#ffffff", confirmButtonColor: "#7c3aed" });
    } catch (error) {
        Swal.fire({ icon: "error", title: "Claim could not be submitted", text: error.message || "Please try again.", background: "#0f172a", color: "#ffffff", confirmButtonColor: "#7c3aed" });
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Confirm Claim';
    }
});



function loadCustomerDashboard(myJobs){

    /*=========================
        Welcome
    =========================*/

    document.getElementById("customerName").textContent =
        customer.name || "Customer";

    /*=========================
        Profile
    =========================*/

    document.getElementById("profileCardCustomerId").textContent =
customer.customerId || "-";

document.getElementById("customerNameProfile").textContent =
customer.name || "-";

document.getElementById("profileCardCustomerMobile").textContent =
customer.mobile || "-";

document.getElementById("profileCardCustomerEmail").textContent =
customer.email || "-";

document.getElementById("profileCardCustomerAddress").textContent =
customer.address || "-";

document.getElementById("profileCardCustomerStatus").innerHTML =
`<span class="badge bg-success">Active</span>`;


  /*=========================
    Account Status
=========================*/

document.getElementById("profileCardCustomerStatus").innerHTML = `
<span class="badge bg-success">
    Active
</span>
`;

document.getElementById("profile2CustomerStatus").innerHTML = `
<span class="badge bg-success">
    Active
</span>
`;

function renderEmailVerification() {

    const verified = customer.emailVerified === true;
    const content = verified
        ? `<span class="badge bg-success">Verified</span>`
        : `<span class="badge bg-warning text-dark me-2">Not Verified</span><button class="btn btn-sm btn-outline-success me-1 verifyEmailAction">Verify Email</button><button class="btn btn-sm btn-outline-primary resendVerificationEmail">Resend Verification Email</button>`;

    document.getElementById("profile2EmailVerification").innerHTML = content;
    document.getElementById("profileCardEmailVerification").innerHTML = content;

    document.querySelectorAll(
        ".verifyEmailAction, .resendVerificationEmail"
    ).forEach(button => {
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                await workerRequest("/resend-verification-email");
                alert("Verification Email Sent Successfully. Please check your inbox.");
            }
            catch(error) {
                alert(error.message || "Verification Email could not be sent.");
            }
            finally {
                button.disabled = false;
            }
        });
    });

}

startSessionExpiryTimer(() => {
    window.location.replace("customer-login.html");
});

renderEmailVerification();

   /*=========================
    TOP PROFILE
=========================*/

document.getElementById("profile2CustomerId").textContent =
    customer.customerId || "-";

document.getElementById("profile2CustomerMobile").textContent =
    customer.mobile || "-";

document.getElementById("profile2CustomerEmail").textContent =
    customer.email || "-";

document.getElementById("profile2CustomerAddress").textContent =
    customer.address || "-";

document.getElementById("profile2CustomerStatus").innerHTML = `

<span class="badge bg-success">

    Active

</span>

`;

  /*=========================
    Customer Jobs
=========================*/



/*=========================
    Customer Since
=========================*/

if(myJobs.length){

    const firstJob =
        myJobs
        .slice()
        .sort((a,b)=>{

            return new Date(a.receivedDate) -
                   new Date(b.receivedDate);

        })[0];

    document.getElementById("customerSince").textContent =
        firstJob.receivedDate;

}
else{

    document.getElementById("customerSince").textContent =
        "-";

}

document.getElementById("profileTotalRepairs").textContent =
    myJobs.length;

/*=========================
    Statistics
=========================*/

updateDashboardCards(myJobs);
updateStatusBanner(myJobs);
/*=========================
    Repair History
=========================*/

loadRepairHistory(myJobs);

}

/*=========================================
      DASHBOARD CARDS
=========================================*/

function updateDashboardCards(myJobs){

    let totalJobs = myJobs.length;

    let pendingJobs = 0;

    let completedJobs = 0;

    let activeWarranty = 0;

    let expiredWarranty = 0;

    let expiringSoon = 0;

    const today = new Date();

    myJobs.forEach(job=>{

        /*=========================
              Repair Status
        =========================*/

        if(job.status==="Delivered"){

            completedJobs++;

        }
        else{

            pendingJobs++;

        }

        /*=========================
              Warranty Count
        =========================*/

        if(job.warrantyProducts){

            job.warrantyProducts.forEach(item=>{

                if(!item.expiryDate) return;

                const expiry =
                    new Date(item.expiryDate);

                const diffDays =
                    Math.ceil(
                        (expiry-today)/(1000*60*60*24)
                    );

                if(diffDays >= 0){

                    activeWarranty++;

                }
                else{

                    expiredWarranty++;

                }

                if(diffDays>=0 && diffDays<=30){

                    expiringSoon++;

                }

            });

        }

    });


    /*=========================
      Dashboard Cards
=========================*/

document.getElementById("totalRepairJobs").textContent =
    totalJobs;

document.getElementById("pendingRepairJobs").textContent =
    pendingJobs;

document.getElementById("completedRepairJobs").textContent =
    completedJobs;

document.getElementById("activeWarranty").textContent =
    activeWarranty;

document.getElementById("expiredWarranty").textContent =
    expiredWarranty;

document.getElementById("expiringWarranty").textContent =
    expiringSoon;

/*=========================
      Profile Statistics
=========================*/

document.getElementById("profileWarranty").textContent =
    activeWarranty;

document.getElementById("profileTotalRepairs").textContent =
    totalJobs;

}

/*=========================================
      LOAD REPAIR HISTORY
=========================================*/

function loadRepairHistory(myJobs){

    const tbody =
        document.getElementById("repairTableBody");

    tbody.innerHTML = "";

    if(myJobs.length===0){

        tbody.innerHTML = `

        <tr>

            <td colspan="6"
            class="text-center py-5 text-muted">

                No Repair Jobs Found

            </td>

        </tr>

        `;

        return;

    }

    myJobs
    .slice()
    .reverse()
    .forEach(job=>{

        tbody.innerHTML += `

<tr>

<td>

<strong>

${job.jobId}

</strong>

</td>

<td>

${job.device || "-"}

</td>

<td>

${job.brand || "-"}

${job.model || ""}

</td>

<td>

${getStatusBadge(job.status)}

</td>

<td>

${job.receivedDate || "-"}

</td>

<td class="text-center align-middle">

<div class="d-flex justify-content-center">

<button
class="btn btn-sm btn-primary"
onclick="viewRepair('${job.jobId}')"
title="View Repair Details">

<i class="bi bi-eye"></i>

</button>

</div>

</td>

</tr>

`;

    });

}

/*=========================================
        STATUS BADGE
=========================================*/

function getStatusBadge(status){

    switch(status){

        case "Item Received":

            return `<span class="badge bg-warning text-dark">${status}</span>`;

        case "Diagnosis":

            return `<span class="badge bg-info">${status}</span>`;

        case "Waiting Parts":

            return `<span class="badge bg-secondary">${status}</span>`;

        case "Repair In Progress":

            return `<span class="badge bg-primary">${status}</span>`;

        case "Ready":

            return `<span class="badge bg-success">${status}</span>`;

        case "Delivered":

            return `<span class="badge bg-success">${status}</span>`;

        case "Cancelled":

            return `<span class="badge bg-danger">${status}</span>`;

        default:

            return `<span class="badge bg-light text-dark">${status}</span>`;

    }

}

/*=========================================
      VIEW REPAIR DETAILS
=========================================*/

function viewRepair(jobId){

    const job =
        jobs.find(j => j.jobId === jobId);

    if(!job) return;

    /*=========================
        BASIC DETAILS
    =========================*/

    document.getElementById("mJobId").textContent =
        job.jobId || "-";

    document.getElementById("mStatus").innerHTML =
        getStatusBadge(job.status);

    document.getElementById("mReceived").textContent =
        job.receivedDate || "-";

    document.getElementById("mDelivered").textContent =
        job.deliveredDate || "-";

    /*=========================
        DEVICE DETAILS
    =========================*/

    document.getElementById("mDevice").textContent =
        job.device || "-";

    document.getElementById("mBrandModel").textContent =
        `${job.brand || "-"} ${job.model || ""}`;


    /*=========================
        PROBLEM
    =========================*/

    document.getElementById("mProblem").textContent =
        job.problem || "-";

    /*=========================
        REMARKS
    =========================*/

    document.getElementById("mRemarks").textContent =
        job.remarks || "-";

    /*=========================
        INVOICE
    =========================*/

    const invoiceBtn =
        document.getElementById("invoiceDownloadBtn");

    if(job.invoiceFile){

        invoiceBtn.classList.remove("d-none");

        invoiceBtn.href =
            job.invoiceFile;

    }
    else{

        invoiceBtn.classList.add("d-none");

    }

    /*=========================
        PRINT BUTTON
    =========================*/

    /*=========================
    VIEW SERVICE REPORT
=========================*/

const reportBtn =
    document.getElementById("printServiceBtn");

if(job.serviceReport){

    reportBtn.classList.remove("d-none");

    reportBtn.innerHTML = `
        <i class="bi bi-file-earmark-pdf"></i>
        View Service Report
    `;

    reportBtn.onclick = () => {

        window.open(
            job.serviceReport,
            "_blank"
        );

    };

}
else{

    reportBtn.classList.add("d-none");

}

    /*=========================
        NEXT PART
    =========================*/

    loadRepairTimeline(job);

    loadWarrantyCards(job);

    new bootstrap.Modal(

        document.getElementById(
            "repairDetailsModal"
        )

    ).show();

}

function printRepairReport(jobId){

    localStorage.setItem(

        "printJobId",

        jobId

    );

    window.open(

        "print-job.html",

        "_blank"

    );

}

/*=========================================
      LOAD REPAIR TIMELINE
=========================================*/

function loadRepairTimeline(job){

    const timeline =
        document.getElementById("repairTimeline");

    timeline.innerHTML = "";

    const steps = [

        "Item Received",

        "Diagnosis",

        "Waiting Parts",

        "Repair In Progress",

        "Ready",

        "Delivered",

        "Cancelled"

    ];

    steps.forEach((step,index)=>{

        const item =
            job.timeline
            ? job.timeline.find(t => t.status === step)
            : null;

        const completed = !!item;

        timeline.innerHTML += `

        <div class="d-flex align-items-start mb-3">

            <div class="me-3">

                ${
                completed

                ?

                `<span class="badge bg-success rounded-pill">

                    <i class="bi bi-check-lg"></i>

                </span>`

                :

                `<span class="badge bg-secondary rounded-pill">

                    ${index + 1}

                </span>`

                }

            </div>

            <div>

                <strong>

                    ${step}

                </strong>

                <div class="small text-muted mt-1">

                    ${
                    item
                    ?
                    item.date
                    :
                    "-"

                    }

                </div>

            </div>

        </div>

        `;

    });

}
/*=========================================
      LOAD WARRANTY DETAILS
=========================================*/

function loadWarrantyCards(job){

    const box =
        document.getElementById("repairWarranty");

    box.innerHTML = "";

    if(
        !job.warrantyProducts ||

        job.warrantyProducts.length===0
    ){

        box.innerHTML = `

        <div class="text-center text-muted py-4">

            No Warranty Available

        </div>

        `;

        return;

    }

    const today =
        new Date();

    job.warrantyProducts.forEach(item=>{

        const expiry =
            new Date(item.expiryDate);

        const diff =
            Math.ceil(
                (expiry-today)/(1000*60*60*24)
            );

        const active =
            diff >= 0;

        box.innerHTML += `

<div class="border rounded p-3 mb-3">

<h5>

${item.productName}

</h5>

<p class="mb-1">

<strong>

Brand / Model :

</strong>

${item.brandModel}

</p>

<p class="mb-1">

<strong>

Warranty :

</strong>

${item.warranty}

</p>

<p class="mb-1">

<strong>

Expiry :

</strong>

${item.expiryDate}

</p>

<p class="mb-2">

<strong>

Remaining :

</strong>

${
active

?

`${diff} Days`

:

`Expired`
}

</p>

${
active

?

`<span class="badge bg-success">

Active

</span>`

:

`<span class="badge bg-danger">

Expired

</span>`
}

</div>

`;

    });

}

/*=========================================
        CUSTOMER LOGOUT (SweetAlert Integration)
=========================================*/

const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

    logoutBtn.addEventListener("click",(e)=>{

        e.preventDefault();

        Swal.fire({
            title: 'Are you sure?',
            text: "You want to logout from your account?",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#7c3aed',
            cancelButtonColor: '#f87171',
            confirmButtonText: 'Yes, Logout!',
            background: '#0f172a',
            color: '#ffffff'
        }).then((result) => {
            if (result.isConfirmed) {
                workerRequest("/logout")
                .catch(console.error)
                .finally(()=>{
                    clearCustomerSession();
                    window.location.href = "customer-login.html";
                });
            }
        });

    });

}

/*=========================================
      Open Change Password Modal
=========================================*/

document
.getElementById("changePasswordBtn")
.addEventListener("click", (e) => {

    e.preventDefault();

    new bootstrap.Modal(

        document.getElementById(
            "changePasswordModal"
        )

    ).show();

});

/*=========================================
      LIVE DATE & TIME
=========================================*/

function updateDateTime(){

    const now = new Date();

    document.getElementById("currentDate").textContent =
        now.toLocaleDateString("en-GB",{

            weekday:"long",

            day:"2-digit",

            month:"short",

            year:"numeric"

        });

    document.getElementById("currentTime").textContent =
        now.toLocaleTimeString("en-IN",{

            hour:"2-digit",

            minute:"2-digit",

            second:"2-digit"

        });

}

updateDateTime();

setInterval(updateDateTime,1000);

/*=========================================
      STATUS BANNER
=========================================*/

function updateStatusBanner(myJobs){

    const banner =
        document.getElementById("statusBanner");

    if(myJobs.length===0){

        banner.textContent =
        "Welcome to your Customer Dashboard";

        return;

    }

    const latestJob =
        myJobs[myJobs.length-1];

    banner.textContent =
        `Latest Repair Status : ${latestJob.status}`;

}

/*=========================================
      MOBILE SIDEBAR & SCROLL ANIMATION
=========================================*/

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");

if(mobileMenuBtn){
    mobileMenuBtn.onclick = (e)=>{
        e.stopPropagation();
        sidebar.classList.add("show");
        sidebarOverlay.classList.add("show");
    };
}

if(sidebarOverlay){
    sidebarOverlay.onclick = ()=>{
        sidebar.classList.remove("show");
        sidebarOverlay.classList.remove("show");
    };
}

// Scroll fade-out effect for the mobile menu button
window.addEventListener("scroll", function() {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    if (mobileMenuBtn) {
        if (scrollTop > 50) {
            mobileMenuBtn.style.opacity = "0";
            mobileMenuBtn.style.transform = "scale(0.8)";
            mobileMenuBtn.style.visibility = "hidden";
            mobileMenuBtn.style.transition = "all 0.3s ease";
        } else {
            mobileMenuBtn.style.opacity = "1";
            mobileMenuBtn.style.transform = "scale(1)";
            mobileMenuBtn.style.visibility = "visible";
        }
    }
}, false);

/*=========================================
      Generate Strong Password
=========================================*/

function generateStrongPassword(){
    return generateTemporaryPassword();

}

/*=========================================
      Generate Dashboard Password
=========================================*/

document
.getElementById("generateDashboardPassword")
.addEventListener("click", ()=>{

    const password =
        generateStrongPassword();

    document.getElementById("newPassword").value =
        password;

    document.getElementById("confirmPassword").value =
        password;

});

/*=========================================
      Toggle Password Visibility
=========================================*/

function togglePassword(inputId, buttonId){

    const input = document.getElementById(inputId);

    const icon = document
        .getElementById(buttonId)
        .querySelector("i");

    if(input.type === "password"){

        input.type = "text";

        icon.classList.remove("bi-eye");

        icon.classList.add("bi-eye-slash");

    }

    else{

        input.type = "password";

        icon.classList.remove("bi-eye-slash");

        icon.classList.add("bi-eye");

    }

}

document
.getElementById("toggleCurrentPassword")
.addEventListener("click", ()=>{

    togglePassword(
        "currentPassword",
        "toggleCurrentPassword"
    );

});

document
.getElementById("toggleNewPassword")
.addEventListener("click", ()=>{

    togglePassword(
        "newPassword",
        "toggleNewPassword"
    );

});

document
.getElementById("toggleConfirmPassword")
.addEventListener("click", ()=>{

    togglePassword(
        "confirmPassword",
        "toggleConfirmPassword"
    );

});

/*=========================================
      Update Dashboard Password
=========================================*/

document
.getElementById("updateDashboardPassword")
.addEventListener("click", async () => {

    const currentPassword =
        document.getElementById("currentPassword").value.trim();

    const newPassword =
        document.getElementById("newPassword").value.trim();

    const confirmPassword =
        document.getElementById("confirmPassword").value.trim();

    /*=========================
          Empty Validation
    =========================*/

    if(currentPassword === ""){

        alert("Enter Current Password.");

        return;

    }

    if(newPassword === ""){

        alert("Enter New Password.");

        return;

    }

    if(confirmPassword === ""){

        alert("Confirm Your Password.");

        return;

    }

    /*=========================
          Current Password Check
    =========================*/

    /*=========================
          Confirm Password Match
    =========================*/

    if(newPassword !== confirmPassword){

        alert("Passwords do not match.");

        return;

    }

    /*=========================
          Same Password Check
    =========================*/

    /*=========================
          Strong Password Check
    =========================*/

    const strongRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/;

    if(!strongRegex.test(newPassword)){

        alert(
`Password must contain

• Minimum 8 Characters
• One Uppercase Letter
• One Lowercase Letter
• One Number
• One Special Character`
        );

        return;

    }

    /*=========================
      Update Password
=========================*/

try{
    const result = await workerRequest("/change-password", {
        currentPassword,
        newPassword
    });

    saveCustomerSession(result.session);
}
catch(error){
    alert(error.message || "Failed to update password.");
    return;
}

    /*=========================
          Clear Fields
    =========================*/

    document.getElementById("currentPassword").value = "";

    document.getElementById("newPassword").value = "";

    document.getElementById("confirmPassword").value = "";

    /*=========================
          Close Modal
    =========================*/

    bootstrap.Modal
        .getInstance(
            document.getElementById("changePasswordModal")
        )
        .hide();

    Swal.fire({
    icon: "success",
    title: "Password Updated",
    text: "Your password has been updated successfully.",
    confirmButtonColor: "#7c3aed",
    background: "#0f172a",
    color: "#ffffff"
});

});

// File er ekdom seshe (ba viewRepair function er baire niche) ei line ti add korun:
window.viewRepair = viewRepair;

