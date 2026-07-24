import { db } from "./firebase.js";

import {
    collection,
    getDocs
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*==============================
    LIVE DATE & TIME
==============================*/

function updateDateTime(){

    const now = new Date();

    document.getElementById("currentDate").innerHTML =
        now.toLocaleDateString("en-IN",{

            day:"2-digit",
            month:"long",
            year:"numeric"

        });

    document.getElementById("currentTime").innerHTML =
        now.toLocaleTimeString("en-IN",{

            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit"

        });

}

updateDateTime();

setInterval(updateDateTime,1000);

async function syncDashboardData(){

    /* Customers */

    const customerSnapshot =
        await getDocs(collection(db,"customers"));

    const customers = [];

    customerSnapshot.forEach(doc=>{

        customers.push(doc.data());

    });

    localStorage.setItem(
        "cf_customers",
        JSON.stringify(customers)
    );

    /* Jobs */

    const jobSnapshot =
        await getDocs(collection(db,"jobs"));

    const jobs = [];

    jobSnapshot.forEach(doc=>{

        jobs.push(doc.data());

    });

    localStorage.setItem(
        "cf_jobs",
        JSON.stringify(jobs)
    );

}

/*=========================================
        DASHBOARD LIVE STATS
=========================================*/

function loadDashboardStats(){

    const customers =
        JSON.parse(localStorage.getItem("cf_customers")) || [];

    const jobs =
        JSON.parse(localStorage.getItem("cf_jobs")) || [];

    document.getElementById("totalCustomers").textContent =
        customers.length;

    const today =
        new Date().toLocaleDateString("en-GB");

    document.getElementById("todayJobs").textContent =

        jobs.filter(j =>
            j.receivedDate === today
        ).length;

    document.getElementById("pendingJobs").textContent =

        jobs.filter(j =>
            j.status !== "Delivered"
        ).length;

    document.getElementById("completedJobs").textContent =

        jobs.filter(j =>
            j.status === "Delivered"
        ).length;

    /*document.getElementById("activeWarranty").textContent =

        jobs.filter(j =>
            j.warrantyStatus === "Active"
        ).length;*/

}



/*=========================================
      RECENT CUSTOMERS
=========================================*/

function loadRecentCustomers() {

    const customers =
        JSON.parse(localStorage.getItem("cf_customers")) || [];

    const tbody =
        document.getElementById("recentCustomersTable");

    if (!tbody) return;

    if (customers.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted py-4">
                    No customer found.
                </td>
            </tr>
        `;

        return;

    }

    const latest = [...customers].reverse().slice(0,5);

    tbody.innerHTML = latest.map(customer => `

        <tr>

            <td>${customer.customerId}</td>

            <td>${customer.name}</td>

            <td>${customer.mobile}</td>

            <td>

                <span class="badge bg-success">

                    Active

                </span>

            </td>

        </tr>

    `).join("");

}



/*=========================================
        RECENT JOBS
=========================================*/

function loadRecentJobs(){

    const jobs =
        JSON.parse(localStorage.getItem("cf_jobs")) || [];

    const tbody =
        document.getElementById("recentJobsTable");

    if(!tbody) return;

    if(jobs.length===0){

        tbody.innerHTML=`

        <tr>

            <td colspan="4"
                class="text-center text-muted py-4">

                No jobs found.

            </td>

        </tr>

        `;

        return;

    }

    const latest =
        [...jobs].reverse().slice(0,5);

    tbody.innerHTML =
        latest.map(job=>`

        <tr>

            <td>${job.jobId}</td>

            <td>${job.customer}</td>

            <td>

                <span class="badge bg-primary">

                    ${job.status}

                </span>

            </td>

            <td>${job.device}</td>

        </tr>

    `).join("");

}



/*=========================================
      DASHBOARD SEARCH
=========================================*/

const dashboardSearch =
document.getElementById("dashboardSearch");

const searchResults =
document.getElementById("searchResults");

if(dashboardSearch){

dashboardSearch.addEventListener("keyup",function(){

    const keyword =
    this.value.toLowerCase().trim();

    if(keyword===""){

        searchResults.style.display="none";

        searchResults.innerHTML="";

        return;

    }

    const customers =
    JSON.parse(localStorage.getItem("cf_customers")) || [];

    const jobs =
    JSON.parse(localStorage.getItem("cf_jobs")) || [];

    let html="";

    customers.forEach(customer=>{

        if(

            customer.name.toLowerCase().includes(keyword) ||

            customer.customerId.toLowerCase().includes(keyword) ||

            customer.mobile.includes(keyword)

        ){

            html += `

<div
class="search-item"
data-type="customer"
data-id="${customer.customerId}">

    <div class="search-title">
        👤 ${customer.name}
    </div>

    <div class="search-sub">
        ${customer.customerId}
    </div>

</div>

`;

        }

    });

    jobs.forEach(job=>{

        if(

            job.jobId.toLowerCase().includes(keyword) ||

            job.customer.toLowerCase().includes(keyword) ||

            job.mobile.includes(keyword)

        ){

            html += `

<div
class="search-item"
data-type="job"
data-id="${job.jobId}">

    <div class="search-title">
        🔧 ${job.jobId}
    </div>

    <div class="search-sub">
        ${job.customer}
    </div>

</div>

`;

        }

    });

    if(html===""){

        html=`

        <div class="search-item">

            No Result Found

        </div>

        `;

      }

    searchResults.innerHTML = html;

    searchResults.style.display = "block";

    document
    .querySelectorAll(".search-item")
    .forEach(item => {

        item.addEventListener("click", () => {

            const type =
                item.dataset.type;

            const id =
                item.dataset.id;

            if (type === "customer") {

                localStorage.setItem(
                    "openCustomerId",
                    id
                );

                window.location =
                    "customers.html";

            }

            if (type === "job") {

                localStorage.setItem(
                    "openJobId",
                    id
                );

                window.location =
                    "jobs.html";

            }

        });

    });

});

}

/*=========================================
      MOBILE SIDEBAR
=========================================*/

const menuToggle =
document.getElementById("menuToggle");

const sidebar =
document.querySelector(".sidebar");

const overlay =
document.getElementById("sidebarOverlay");

if(menuToggle){

    menuToggle.addEventListener("click",()=>{

        sidebar.classList.add("show");

        overlay.classList.add("show");

    });

}

if(overlay){

    overlay.addEventListener("click",()=>{

        sidebar.classList.remove("show");

        overlay.classList.remove("show");

    });

}

/*=========================================
      AUTO CLOSE SIDEBAR
=========================================*/

document
.querySelectorAll(".sidebar a")
.forEach(link=>{

    link.addEventListener("click",()=>{

        if(window.innerWidth <= 768){

            sidebar.classList.remove("show");

            overlay.classList.remove("show");

        }

    });

});

/*=========================================
      RESIZE FIX
=========================================*/

window.addEventListener("resize",()=>{

    if(window.innerWidth > 768){

        sidebar.classList.remove("show");

        overlay.classList.remove("show");

    }

});

(async () => {

    await syncDashboardData();

    loadDashboardStats();

    loadRecentCustomers();

    loadRecentJobs();

})();

