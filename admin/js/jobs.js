/*=========================================
      Click & Fix CRM
      Jobs Module v1
=========================================*/

import { auth, db } from "./firebase.js";

import { adminWorkerRequest } from "./admin-worker-client.js";

import {
    doc,
    updateDoc,
    deleteDoc,
    collection,
    onSnapshot,
    runTransaction
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STORAGE_KEY = "cf_jobs";
const CUSTOMER_KEY = "cf_customers";
const CANCELLED_STATUS = "Cancelled";

let jobs = [];
let selectedCancelJobId = null;
let selectedDeleteJob = null;

const jobForm = document.getElementById("jobForm");
const saveJobBtn = document.getElementById("saveJob");
const updateJobBtn = document.getElementById("updateJob");
const jobIdInput = document.getElementById("jobId");
const newJobModal = document.getElementById("newJobModal");

/*=========================
    Generate Job ID
=========================*/

function generateJobId() {

    const today = new Date();

    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");

    const dateCode = `${y}${m}${d}`;

    const randomValues = new Uint32Array(1);

    if (window.crypto && window.crypto.getRandomValues) {

        window.crypto.getRandomValues(randomValues);

    }

    else {

        randomValues[0] = Math.floor(Math.random() * 0x100000000);

    }

    const randomCode = String(
        1000 + (randomValues[0] % 9000)
    );

    return `CF-${dateCode}-${randomCode}`;
}

async function createJobWithUniqueId(job, initialJobId) {

    let jobId = initialJobId || generateJobId();

    for (let attempt = 0; attempt < 25; attempt++) {

        const jobReference = doc(db, "jobs", jobId);

        try {

            await runTransaction(db, async transaction => {

                const existingJob = await transaction.get(jobReference);

                if (existingJob.exists()) {

                    throw new Error("JOB_ID_COLLISION");

                }

                transaction.set(jobReference, {
                    ...job,
                    jobId
                });

            });

            return {
                ...job,
                jobId
            };

        }

        catch (error) {

            if (error.message !== "JOB_ID_COLLISION") {

                throw error;

            }

            jobId = generateJobId();

        }

    }

    throw new Error("A unique Job ID could not be generated. Please try again.");

}
function loadCustomerDropdown(){

    const customers =
        JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || [];

    const customerSelect =
        document.getElementById("customer");

    customerSelect.innerHTML = `
        <option value="">
            Select Customer
        </option>
    `;

    customers.forEach(customer => {

        customerSelect.innerHTML += `
            <option value="${customer.customerId}">
                ${customer.customerId} - ${customer.name}
            </option>
        `;

    });

}
function fillCustomerDetails(){

    const customers =
        JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || [];

    const customerId =
        document.getElementById("customer").value;

    const customer =
        customers.find(c => c.customerId === customerId);

    if(!customer) return;

    document.getElementById("mobile").value =
        customer.mobile || "";

}

/*=========================
    Modal Open
=========================*/

newJobModal.addEventListener("show.bs.modal", () => {

    jobForm.reset();

    jobIdInput.value = generateJobId();

    loadCustomerDropdown();

});

document
.getElementById("customer")
.addEventListener("change", fillCustomerDetails);

/*=========================
    Save Job
=========================*/

saveJobBtn.addEventListener("click", async () => {

    if (!jobForm.reportValidity()) return;

    const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    const customers = JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || [];

    const selectedCustomer = customers.find(
        c => c.customerId === document.getElementById("customer").value
    );

    if (!selectedCustomer) {

        alert("Please select a valid customer.");

        return;

    }

    const now = new Date();

    const newJob = {

        customerId: selectedCustomer.customerId,

        customer: selectedCustomer.name,

        mobile: selectedCustomer.mobile,

        device: document.getElementById("device").value,

        brand: document.getElementById("brand").value,

        model: document.getElementById("model").value,

        problem: document.getElementById("problem").value,

        remarks: document.getElementById("remarks").value,

        status: "Item Received",

        receivedDate: now.toLocaleDateString("en-GB"),

        timeline: [

        {

            status: "Item Received",

            date: now.toLocaleString("en-GB")

        }

    ],

    warrantyProducts: []

};

try {

    const createdJob = await createJobWithUniqueId(
        newJob,
        jobIdInput.value
    );

    jobs.push(createdJob);

    /*=========================================
        Update Customer Job Count
    =========================================*/

    selectedCustomer.jobs = (selectedCustomer.jobs || 0) + 1;

    localStorage.setItem(
        CUSTOMER_KEY,
        JSON.stringify(customers)
    );

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(jobs)
    );

    console.log("Job Synced to Firestore");

}

catch (error) {

    console.error(error);

    alert(error.message || "Job could not be created.");

    return;

}

    bootstrap.Modal.getInstance(newJobModal).hide();

    loadJobs();

});

/*=========================
    Load Jobs
=========================*/

function loadJobs() {

    const tbody = document.querySelector(".jobs-table tbody");

    const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

const keyword =
    document.getElementById("searchInput").value.toLowerCase();

const status =
    document.getElementById("statusFilter").value;

const filteredJobs = jobs.filter(job => {

    const matchSearch =

        job.jobId.toLowerCase().includes(keyword) ||

        job.customer.toLowerCase().includes(keyword) ||

        job.mobile.toLowerCase().includes(keyword);

    const matchStatus =

    status === "" ||

    job.status === status;

    return matchSearch && matchStatus;

});
    tbody.innerHTML = "";

    if (filteredJobs.length === 0) {

        tbody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-5">
                No Jobs Found
            </td>
        </tr>
        `;

        updateStats([]);

        return;

    }

    filteredJobs.slice().reverse().forEach(job => {

        const cancellationEmailAlreadySent =
            job.status === CANCELLED_STATUS && job.cancellationEmailSentAt;

        const statusEmailControl = cancellationEmailAlreadySent
            ? `<span class="badge bg-success" title="Cancellation email sent"><i class="bi bi-check2"></i> Email sent</span>`
            : `<button
        type="button"
        class="btn btn-sm btn-outline-primary"
        onclick="openJobStatusEmailModal('${job.jobId}')"
        title="${job.status === CANCELLED_STATUS ? "Send cancellation email" : "Send status email"}"
        aria-label="${job.status === CANCELLED_STATUS ? "Send cancellation email" : "Send status email"}">

        <i class="bi bi-envelope-fill"></i>

        </button>`;

        const editControl = job.status === CANCELLED_STATUS
            ? ""
            : `<button
class="btn btn-sm btn-warning me-1"
onclick="editJob('${job.jobId}')">

<i class="bi bi-pencil-square"></i>

</button>`;

        tbody.innerHTML += `

        <tr>

            <td><strong>${job.jobId}</strong></td>

            <td>${job.customer}</td>

            <td>${job.brand} ${job.model}</td>

            <td>

    <div class="d-inline-flex align-items-center gap-1">
        ${getStatusBadge(job.status)}
        ${statusEmailControl}
    </div>

</td>

            <td>${job.receivedDate}</td>

            <td class="text-center">

<button
class="btn btn-sm btn-primary me-1"
onclick="viewJob('${job.jobId}')">

<i class="bi bi-eye"></i>

</button>


${editControl}

<button
class="btn btn-sm btn-danger"
onclick="deleteJob('${job.jobId}')">

<i class="bi bi-trash"></i>

</button>

</td>

        </tr>

        `;

    });

    updateStats(filteredJobs);

}

/*=========================
    DELETE JOB
=========================*/

function deleteJob(jobId) {

    const job = jobs.find(item => item.jobId === jobId);

    if (!job) return;

    selectedDeleteJob = jobId;

    document.getElementById("deleteJobId").textContent = job.jobId;
    document.getElementById("deleteCustomer").textContent = job.customer || "-";

    new bootstrap.Modal(
        document.getElementById("deleteJobModal")
    ).show();

}

document
.getElementById("confirmDeleteBtn")
.addEventListener("click", async () => {

    if (!selectedDeleteJob) return;

    const confirmButton = document.getElementById("confirmDeleteBtn");
    const jobId = selectedDeleteJob;

    confirmButton.disabled = true;

    try {

        await deleteDoc(doc(db, "jobs", jobId));

        selectedDeleteJob = null;

        bootstrap.Modal.getInstance(
            document.getElementById("deleteJobModal")
        ).hide();

        loadJobs();

    } catch (error) {

        console.error("Job deletion failed", error);
        alert("Job could not be deleted.");

    } finally {

        confirmButton.disabled = false;

    }

});

/*=========================
    Dashboard Cards
=========================*/

function updateStats(jobs) {

    document.getElementById("totalJobs").textContent = jobs.length;

    document.getElementById("pendingJobs").textContent =
        jobs.filter(j => j.status === "Item Received").length;

    document.getElementById("readyJobs").textContent =
        jobs.filter(j => j.status === "Ready").length;

    document.getElementById("deliveredJobs").textContent =
        jobs.filter(j => j.status === "Delivered").length;

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
            return `<span class="badge bg-dark">${status}</span>`;

        case CANCELLED_STATUS:
            return `<span class="badge bg-danger">${status}</span>`;

        default:
            return `<span class="badge bg-light text-dark">${status}</span>`;
    }

}

/*=========================================
        JOB STATUS EMAIL
=========================================*/

const JOB_EMAIL_WORKER_URL =
    "https://solitary-bush-2656job-email-worker.clicknfixtechnologies.workers.dev";

let selectedJobStatusEmail = null;

function openJobStatusEmailModal(jobId) {

    selectedJobStatusEmail = jobs.find(job => job.jobId === jobId);

    if (!selectedJobStatusEmail) return;

    if (
        selectedJobStatusEmail.status === CANCELLED_STATUS &&
        selectedJobStatusEmail.cancellationEmailSentAt
    ) {

        showJobEmailToast("The cancellation email has already been sent.", "success");

        return;

    }

    const errorAlert = document.getElementById("jobEmailError");
    errorAlert.textContent = "";
    errorAlert.classList.add("d-none");

    const customers = JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || [];

    const customer = customers.find(item =>
        item.customerId === selectedJobStatusEmail.customerId
    );

    document.getElementById("jobEmailCustomerName").textContent =
        selectedJobStatusEmail.customer || "Not available";

    document.getElementById("jobEmailCustomerEmail").textContent =
        customer?.email || "Not available";

    document.getElementById("jobEmailJobId").textContent =
        selectedJobStatusEmail.jobId;

    document.getElementById("jobEmailDevice").textContent =
        `${selectedJobStatusEmail.device || ""} ${selectedJobStatusEmail.brand || ""} ${selectedJobStatusEmail.model || ""}`.trim() || "Not available";

    document.getElementById("jobEmailStatus").textContent =
        selectedJobStatusEmail.status || "Not available";

    document.getElementById("jobStatusEmailModalLabel").innerHTML =
        selectedJobStatusEmail.status === CANCELLED_STATUS
            ? '<i class="bi bi-envelope-fill me-2"></i>Send Cancellation Email'
            : '<i class="bi bi-envelope-fill me-2"></i>Send Status Update';

    new bootstrap.Modal(
        document.getElementById("jobStatusEmailModal")
    ).show();

}

function showJobEmailToast(message, type) {

    const toastElement = document.getElementById("jobEmailToast");

    toastElement.classList.remove("bg-success", "bg-danger");
    toastElement.classList.add(type === "success" ? "bg-success" : "bg-danger");

    document.getElementById("jobEmailToastMessage").textContent = message;

    bootstrap.Toast.getOrCreateInstance(toastElement).show();

}

document.getElementById("sendJobStatusEmail").addEventListener("click", async () => {

    if (!selectedJobStatusEmail) return;

    const sendButton = document.getElementById("sendJobStatusEmail");
    const cancelButton = document.getElementById("cancelJobStatusEmail");
    const closeButton = document.getElementById("closeJobStatusEmail");

    sendButton.disabled = true;
    cancelButton.disabled = true;
    closeButton.disabled = true;
    sendButton.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
        Sending...
    `;

    try {

        const adminUser = auth.currentUser;

        if (!adminUser) {

            throw new Error("Admin login is required.");

        }

        const idToken = await adminUser.getIdToken(true);

        const response = await fetch(
            `${JOB_EMAIL_WORKER_URL}/send-job-status-email`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    jobId: selectedJobStatusEmail.jobId,
                    status: selectedJobStatusEmail.status
                })
            }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
            throw new Error(result.error || "Unable to send status email.");
        }

        if (selectedJobStatusEmail.status === CANCELLED_STATUS) {

            selectedJobStatusEmail.cancellationEmailSentAt = new Date().toISOString();

            jobs = jobs.map(job =>
                job.jobId === selectedJobStatusEmail.jobId
                    ? selectedJobStatusEmail
                    : job
            );

            localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));

            loadJobs();

        }

        bootstrap.Modal.getInstance(
            document.getElementById("jobStatusEmailModal")
        ).hide();

        showJobEmailToast(
            selectedJobStatusEmail.status === CANCELLED_STATUS
                ? "Cancellation email sent successfully."
                : "Status email sent successfully.",
            "success"
        );

    } catch (error) {

        console.error("Job status email failed", error);
        const errorAlert = document.getElementById("jobEmailError");
        errorAlert.textContent = error.message || "Failed to send status email.";
        errorAlert.classList.remove("d-none");

    } finally {

        sendButton.disabled = false;
        cancelButton.disabled = false;
        closeButton.disabled = false;
        sendButton.innerHTML = `
            <i class="bi bi-envelope-fill me-1"></i>
            Send Email
        `;

    }

});
/*=========================
    Start
=========================*/

/*=========================================
        VIEW JOB
=========================================*/

function viewJob(jobId){

    const jobs = JSON.parse(localStorage.getItem("cf_jobs")) || [];

    const job = jobs.find(j => j.jobId === jobId);

    if(!job) return;

    document.getElementById("vJobId").textContent = job.jobId;

    document.getElementById("vCustomer").textContent = job.customer;

    document.getElementById("vMobile").textContent = job.mobile;

    document.getElementById("vStatus").innerHTML = getStatusBadge(job.status);

    document.getElementById("openCancelJob").disabled =
        job.status === CANCELLED_STATUS;

    document.getElementById("openCancelJob").title =
        job.status === CANCELLED_STATUS
            ? "This job is already cancelled."
            : "Cancel this job while preserving its history.";

    if(job.invoice){

    document.getElementById("vInvoice").textContent =
    job.invoice;

}
else{

    document.getElementById("vInvoice").textContent =
    "Not Generated";

}



if(job.invoiceFile){

    document.getElementById("invoiceDownloadBox").innerHTML =

    `
    <a href="${job.invoiceFile}" 
       target="_blank"
       class="btn btn-sm btn-success">

       <i class="bi bi-file-earmark-pdf"></i>

       Download Invoice

    </a>
    `;

}
else{

    document.getElementById("invoiceDownloadBox").innerHTML =
    "";

}

    document.getElementById("vDevice").textContent =
    job.device;

    document.getElementById("vBrand").textContent =
    job.brand || "-";

    document.getElementById("vModel").textContent =
    job.model || "-";

    document.getElementById("vReceived").textContent =
    job.receivedDate || "-";

    document.getElementById("vProblem").textContent =
    job.problem || "No Problem Description";

    document.getElementById("vRemarks").textContent =
    job.remarks || "No Remarks";

    let timelineHTML = "";

if (job.timeline && job.timeline.length > 0) {

    job.timeline.forEach(item => {

        let icon = "⚪";

        switch (item.status) {

            case "Item Received":
                icon = "🟢";
                break;

            case "Diagnosis":
                icon = "🟡";
                break;

            case "Waiting Parts":
                icon = "🟠";
                break;

            case "Repair In Progress":
                icon = "🔵";
                break;

            case "Ready":
                icon = "🟢";
                break;

            case "Delivered":
                icon = "✅";
                break;

            case CANCELLED_STATUS:
                icon = "⛔";
                break;

        }

        timelineHTML += `

        <div class="border-start border-3 border-primary ps-3 mb-2">

            <div class="fw-bold">

                ${icon} ${item.status}

            </div>

            <small class="text-muted">

                ${item.date}

            </small>

        </div>

        `;

    });

} else {

    timelineHTML = "Timeline Not Available";

}

document.getElementById("timelineBox").innerHTML = timelineHTML;

    new bootstrap.Modal(
        document.getElementById("viewJobModal")
    ).show();

}

function openCancelJobModal() {

    const job = jobs.find(item => item.jobId === document.getElementById("vJobId").textContent);

    if (!job || job.status === CANCELLED_STATUS) return;

    selectedCancelJobId = job.jobId;

    document.getElementById("cancelJobId").textContent = job.jobId;
    document.getElementById("cancelJobCustomer").textContent = job.customer || "-";

    document
    .getElementById("viewJobModal")
    .addEventListener("hidden.bs.modal", () => {

        new bootstrap.Modal(
            document.getElementById("cancelJobModal")
        ).show();

    }, { once: true });

    bootstrap.Modal.getInstance(
        document.getElementById("viewJobModal")
    ).hide();

}

document
.getElementById("keepJob")
.addEventListener("click", () => {

    const jobId = selectedCancelJobId;

    selectedCancelJobId = null;

    if (!jobId) return;

    document
    .getElementById("cancelJobModal")
    .addEventListener("hidden.bs.modal", () => viewJob(jobId), { once: true });

});

document
.getElementById("confirmCancelJob")
.addEventListener("click", async () => {

    if (!selectedCancelJobId) return;

    const confirmButton = document.getElementById("confirmCancelJob");
    const keepButton = document.getElementById("keepJob");
    const jobId = selectedCancelJobId;

    confirmButton.disabled = true;
    keepButton.disabled = true;
    confirmButton.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
        Cancelling...
    `;

    try {

        const result = await adminWorkerRequest(
            `/admin/jobs/${encodeURIComponent(jobId)}/cancel`
        );

        jobs = jobs.map(job =>
            job.jobId === jobId
                ? { ...job, ...result.job }
                : job
        );

        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));

        selectedCancelJobId = null;

        loadJobs();

        document
        .getElementById("cancelJobModal")
        .addEventListener("hidden.bs.modal", () => viewJob(jobId), { once: true });

        bootstrap.Modal.getInstance(
            document.getElementById("cancelJobModal")
        ).hide();

        showJobEmailToast(
            "Job cancelled. Send the cancellation email from the envelope button.",
            "success"
        );

    }

    catch (error) {

        console.error(error);

        alert(error.message || "Job could not be cancelled.");

    }

    finally {

        confirmButton.disabled = false;
        keepButton.disabled = false;
        confirmButton.innerHTML = `
            <i class="bi bi-x-circle me-1"></i>
            Cancel Job
        `;

    }

});

function editJob(jobId){

    const jobs = JSON.parse(localStorage.getItem("cf_jobs")) || [];

    const job = jobs.find(j => j.jobId === jobId);

    if(!job) return;

    if (job.status === CANCELLED_STATUS) {

        alert("Cancelled jobs are kept as historical records and cannot be edited.");

        return;

    }

    document.getElementById("editJobId").value = job.jobId;

    document.getElementById("editCustomer").value = job.customer || "";

    document.getElementById("editMobile").value = job.mobile || "";

    document.getElementById("editDevice").value = job.device || "";

    document.getElementById("editBrand").value = job.brand || "";

    document.getElementById("editModel").value = job.model || "";

    document.getElementById("editInvoice").value = job.invoice || "";

    document.getElementById("editInvoiceFile").value = job.invoiceFile || "";

    document.getElementById("editServiceReport").value = job.serviceReport || "";

    document.getElementById("editStatus").value = job.status || "Item Received";

    document.getElementById("editProblem").value = job.problem || "";

    document.getElementById("editRemarks").value = job.remarks || "";

    /*=========================================
      LOAD WARRANTY PRODUCTS
=========================================*/

partCount = 0;

const container = document.getElementById("partsContainer");

container.innerHTML = `
<div class="text-muted">
    No Parts Added
</div>
`;

if(job.warrantyProducts && job.warrantyProducts.length){

    container.innerHTML = "";

    job.warrantyProducts.forEach(part=>{

        addPartRow(part);

    });

}

    new bootstrap.Modal(
        document.getElementById("editJobModal")
    ).show();

}

/*=========================================
        UPDATE JOB
=========================================*/

updateJobBtn.addEventListener("click", async () => {

    const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    const index = jobs.findIndex(
        j => j.jobId === document.getElementById("editJobId").value
    );

    if (index === -1) return;

    if (jobs[index].status === CANCELLED_STATUS) {

        alert("Cancelled jobs are kept as historical records and cannot be updated.");

        return;

    }

    jobs[index].customer = document.getElementById("editCustomer").value;
    jobs[index].mobile = document.getElementById("editMobile").value;
    jobs[index].device = document.getElementById("editDevice").value;
    jobs[index].brand = document.getElementById("editBrand").value;
    jobs[index].model = document.getElementById("editModel").value;
    jobs[index].invoice = document.getElementById("editInvoice").value;
    jobs[index].invoiceFile = document.getElementById("editInvoiceFile").value;
    jobs[index].serviceReport = document.getElementById("editServiceReport").value.trim();
    
    const newStatus = document.getElementById("editStatus").value;

    if (jobs[index].status !== newStatus) {

    if (!jobs[index].timeline) {

        jobs[index].timeline = [];

    }

    const now = new Date();

    /*=========================
        AVOID DUPLICATE TIMELINE
    =========================*/

    const lastStatus =
        jobs[index].timeline.at(-1);

    if (!lastStatus || lastStatus.status !== newStatus) {

        jobs[index].timeline.push({

            status: newStatus,

            date: now.toLocaleString("en-GB")

        });

    }

    jobs[index].status = newStatus;

    /*=========================
        AUTO DELIVERY DATE
    =========================*/

    if (newStatus === "Delivered") {

        jobs[index].deliveredDate =
            now.toLocaleDateString("en-GB");

    }

}

    jobs[index].problem =
        document.getElementById("editProblem").value;

    jobs[index].remarks =
        document.getElementById("editRemarks").value;

/*=========================================
        SAVE INSTALLED PARTS
=========================================*/

jobs[index].warrantyProducts = [];

document
.querySelectorAll("#partsContainer .border")
.forEach(part => {

    const purchaseDate =
        part.querySelector(".part-purchase").value;

    const warranty =
        part.querySelector(".part-warranty").value;

    let expiryDate = "";

    /*=========================
        AUTO EXPIRY CALCULATE
    =========================*/

    if (purchaseDate && warranty !== "Custom") {

        const d = new Date(purchaseDate);

        switch (warranty) {

            case "30 Days":
                d.setDate(d.getDate() + 30);
                break;

            case "90 Days":
                d.setDate(d.getDate() + 90);
                break;

            case "6 Months":
                d.setMonth(d.getMonth() + 6);
                break;

            case "1 Year":
                d.setFullYear(d.getFullYear() + 1);
                break;

            case "2 Years":
                d.setFullYear(d.getFullYear() + 2);
                break;

            case "3 Years":
                d.setFullYear(d.getFullYear() + 3);
                break;

            case "5 Years":
                d.setFullYear(d.getFullYear() + 5);
                break;

            case "Lifetime":
                d.setFullYear(d.getFullYear() + 100);
                break;

        }

        expiryDate =
            d.toISOString().split("T")[0];

    }

    else if (warranty === "Custom") {

        expiryDate =
            part.querySelector(".part-expiry").value;

    }

    const product = {

        productName:
            part.querySelector(".part-name").value.trim(),

        brandModel:
            part.querySelector(".part-brand").value.trim(),

        serialNumber:
            part.querySelector(".part-serial").value.trim(),

        purchaseDate:
            purchaseDate,

        warranty:
            warranty,

        expiryDate:
            expiryDate

    };

    if (product.productName !== "") {

        jobs[index].warrantyProducts.push(product);

    }

});

localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(jobs)
);

try {

    await updateDoc(

        doc(db, "jobs", jobs[index].jobId),

        jobs[index]

    );

    console.log("Job Updated");

}

catch (error) {

    console.error(error);

}

bootstrap.Modal.getInstance(
    document.getElementById("editJobModal")
).hide();

loadJobs();

});

/*=========================================
      INSTALLED PARTS SYSTEM
=========================================*/

let partCount = 0;

document.getElementById("addPartBtn").addEventListener("click", addPartRow);

function addPartRow(data = {}) {

    partCount++;

    const container =
        document.getElementById("partsContainer");

    if (partCount === 1) {

        container.innerHTML = "";

    }

    const row = document.createElement("div");

    row.className =
        "border rounded p-3 mb-3 bg-light";

    row.id =
        "partRow" + partCount;

    row.innerHTML = `

<div class="row g-3">

<div class="col-md-2">

<label class="form-label">

Part Name

</label>

<input
type="text"
class="form-control part-name"
value="${data.productName || ""}">

</div>

<div class="col-md-2">

<label class="form-label">

Brand / Model

</label>

<input
type="text"
class="form-control part-brand"
value="${data.brandModel || ""}">

</div>

<div class="col-md-2">

<label class="form-label">

Serial Number

</label>

<input
type="text"
class="form-control part-serial"
value="${data.serialNumber || ""}">

</div>

<div class="col-md-2">

<label class="form-label">

Purchase Date

</label>

<input
type="date"
class="form-control part-purchase"
value="${data.purchaseDate || ""}">

</div>

<div class="col-md-2">

<label class="form-label">

Warranty

</label>

<select
class="form-select part-warranty">

<option value="">Select</option>

<option value="30 Days" ${data.warranty=="30 Days"?"selected":""}>30 Days</option>

<option value="90 Days" ${data.warranty=="90 Days"?"selected":""}>90 Days</option>

<option value="6 Months" ${data.warranty=="6 Months"?"selected":""}>6 Months</option>

<option value="1 Year" ${data.warranty=="1 Year"?"selected":""}>1 Year</option>

<option value="2 Years" ${data.warranty=="2 Years"?"selected":""}>2 Years</option>

<option value="3 Years" ${data.warranty=="3 Years"?"selected":""}>3 Years</option>

<option value="5 Years" ${data.warranty=="5 Years"?"selected":""}>5 Years</option>

<option value="Lifetime" ${data.warranty=="Lifetime"?"selected":""}>Lifetime</option>

<option value="Custom" ${data.warranty=="Custom"?"selected":""}>Custom</option>

</select>

</div>

<div class="col-md-2 d-flex align-items-end">

<button
type="button"
class="btn btn-danger w-100"
onclick="removePartRow('${row.id}')">

<i class="bi bi-trash"></i>

</button>

</div>

<div class="col-md-12 customExpiryBox"
style="display:${data.warranty=="Custom"?"block":"none"};">

<label class="form-label">

Custom Expiry Date

</label>

<input
type="date"
class="form-control part-expiry"
value="${data.expiryDate || ""}">

</div>

</div>

`;

    container.appendChild(row);

    row.querySelector(".part-warranty")
    .addEventListener("change", function(){

        const customBox =
            row.querySelector(".customExpiryBox");

        if(this.value==="Custom"){

            customBox.style.display="block";

        }
        else{

            customBox.style.display="none";

            row.querySelector(".part-expiry").value="";

        }

    });

}

function removePartRow(id){

    document.getElementById(id).remove();

    const container =
        document.getElementById("partsContainer");

    if(container.children.length===0){

        container.innerHTML=`

<div class="text-muted">

No Parts Added

</div>

`;

        partCount = 0;

    }

}

/*=========================================
      WARRANTY PERIOD CALCULATOR
=========================================*/

function getWarrantyText(expiryDate){

    if(!expiryDate) return "-";

    const today = new Date();

    const expiry = new Date(expiryDate);

    const diff =
        expiry.getTime() - today.getTime();

    if(diff <= 0){

        return "Expired";

    }

    const days =
        Math.ceil(diff/(1000*60*60*24));

    if(days <= 90){

        return days + " Days";

    }

    const months =
        Math.floor(days/30);

    if(months < 12){

        return months + " Months";

    }

    const years =
        Math.floor(months/12);

    const remainMonths =
        months % 12;

    if(remainMonths===0){

        return years + " Years";

    }

    return years + " Years " + remainMonths + " Months";

}

/*=========================================
    Open Job From Customer Page
=========================================*/

const openJobId =
    localStorage.getItem("openJobId");

if(openJobId){

    setTimeout(()=>{

        viewJob(openJobId);

        localStorage.removeItem("openJobId");

    },300);

}

/*=========================
        PRINT JOB REPORT
=========================*/

function printJobReport(){


    const printContent = 
    document.getElementById("printArea").innerHTML;


    const originalContent =
    document.body.innerHTML;


    document.body.innerHTML = `

    <div id="printArea">

        ${printContent}

    </div>

    `;


    window.print();


    document.body.innerHTML = originalContent;


    location.reload();


}

/*=========================================
      AUTO OPEN NEW JOB MODAL
=========================================*/

document.addEventListener("DOMContentLoaded", () => {

    const params = new URLSearchParams(window.location.search);

    if (params.get("action") === "new") {

        loadCustomerDropdown();

        jobForm.reset();

        jobIdInput.value = generateJobId();

        const modal = new bootstrap.Modal(newJobModal);

        modal.show();

        history.replaceState({}, "", "jobs.html");

    }

});

/*=========================================
        SEARCH & FILTER
=========================================*/

document
.getElementById("searchInput")
.addEventListener("keyup", loadJobs);

document
.getElementById("statusFilter")
.addEventListener("change", loadJobs);

window.viewJob = viewJob;

window.editJob = editJob;

window.deleteJob = deleteJob;

window.openJobStatusEmailModal = openJobStatusEmailModal;

window.openCancelJobModal = openCancelJobModal;

window.printJobReport = printJobReport;

window.removePartRow = removePartRow;

/*=========================================
        LOAD JOBS FROM FIRESTORE
=========================================*/

onSnapshot(

    collection(db, "jobs"),

    (snapshot) => {

        jobs = [];

        snapshot.forEach((doc) => {

            jobs.push(doc.data());

        });

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify(jobs)

        );

        loadJobs();

        console.log("Jobs Loaded");

    }

);

