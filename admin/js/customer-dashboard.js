import { db } from "./firebase.js";

import {
    doc,
    updateDoc,
    getDocs,
    collection
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*=========================================
      GLOBAL JOBS ARRAY
=========================================*/

let jobs = [];

/*=========================================
      LOGIN GUARD
=========================================*/

const customerSession =
    localStorage.getItem("customerLogin");

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

const currentCustomerMobile =
    (localStorage.getItem("customerLogin") || "").trim();
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

const customer =
    JSON.parse(localStorage.getItem("customerData"));


/*=========================================
      FIND CUSTOMER
=========================================*/



/*=========================================
      LOGIN CHECK
=========================================*/

if(!customer){

    alert("Login Required");

    window.location.href =
        "customer-login.html";

}

loadDashboard();

async function loadDashboard() {

    const snapshot = await getDocs(collection(db, "jobs"));

    jobs = [];

    snapshot.forEach(doc => {
        jobs.push(doc.data());
    });

    const myJobs = jobs.filter(job =>
        job.customerId === customer.customerId
    );

    loadCustomerDashboard(myJobs);

}

/*=========================================
      START
=========================================*/

loadDashboard();

/*=========================================
      LOAD DASHBOARD
=========================================*/

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

        "Delivered"

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
        CUSTOMER LOGOUT
=========================================*/

const logoutBtn =
document.getElementById("logoutBtn");

if(logoutBtn){

    logoutBtn.addEventListener("click",(e)=>{

        e.preventDefault();

        if(confirm("Are you sure you want to logout?")){

            localStorage.removeItem("customerLogin");

            localStorage.removeItem("customerData");

            window.location.href =
            "customer-login.html";

        }

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
      MOBILE SIDEBAR
=========================================*/

const mobileMenuBtn =
document.getElementById("mobileMenuBtn");

const sidebar =
document.getElementById("sidebar");

const sidebarOverlay =
document.getElementById("sidebarOverlay");

if(mobileMenuBtn){

    mobileMenuBtn.onclick = ()=>{

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

/*=========================================
      Generate Strong Password
=========================================*/

function generateStrongPassword(){

    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const lower = "abcdefghijklmnopqrstuvwxyz";

    const number = "0123456789";

    const special = "@#$%&*!?";

    const all =
        upper +
        lower +
        number +
        special;

    let password = "";

    password +=
        upper[Math.floor(Math.random()*upper.length)];

    password +=
        lower[Math.floor(Math.random()*lower.length)];

    password +=
        number[Math.floor(Math.random()*number.length)];

    password +=
        special[Math.floor(Math.random()*special.length)];

    for(let i=0;i<8;i++){

        password +=
            all[Math.floor(Math.random()*all.length)];

    }

    return password
        .split("")
        .sort(()=>Math.random()-0.5)
        .join("");

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

    if(currentPassword !== customer.password){

        alert("Current Password is incorrect.");

        return;

    }

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

    if(newPassword === currentPassword){

        alert("New password must be different from current password.");

        return;

    }

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

customer.password = newPassword;

/*=========================
      Firestore Update
=========================*/

try{

    await updateDoc(

        doc(
            db,
            "customers",
            customer.customerId
        ),

        {
            password: newPassword
        }

    );

}
catch(error){

    console.error(error);

    alert("Failed to update password.");

    return;

}

/*=========================
      LocalStorage Update
=========================*/

localStorage.setItem(

    CUSTOMER_KEY,

    JSON.stringify(customers)

);

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

    alert("Password Updated Successfully.");

});

// File er ekdom seshe (ba viewRepair function er baire niche) ei line ti add korun:
window.viewRepair = viewRepair;

