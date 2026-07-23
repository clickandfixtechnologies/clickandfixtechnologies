import { db, firebaseConfig } from "./firebase.js";

import {
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    collection,
    onSnapshot
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*=========================================
      Click & Fix CRM
      Customers Module v1
=========================================*/

/*=========================================
      CUSTOMER LOGIN CREATION
=========================================*/

function createCustomerLogin(customer){

    const password =
        "CF@" +
        Math.floor(
            100000 + Math.random() * 900000
        );

    return{

        username: customer.mobile,

        password: password

    };

}

/*=========================================
      Strong Password Generator
=========================================*/

function generateStrongPassword() {

    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const number = "0123456789";
    const special = "@#$%&*!?";

    const all =
        upper +
        lower +
        number +
        special;

    let password = "CF@";

    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += number[Math.floor(Math.random() * number.length)];
    password += special[Math.floor(Math.random() * special.length)];

    while (password.length < 12) {

        password +=
            all[Math.floor(Math.random() * all.length)];

    }

    return password;

}

/*=========================================
      Validate Password
=========================================*/

function isStrongPassword(password){

    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(password);

}

const STORAGE_KEY = "cf_customers";

let customers = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

let editCustomerId = null;
let deleteCustomerId = null;
let loginCustomerId = null;

/*=========================================
      Bootstrap Modals
=========================================*/

const newCustomerModal = new bootstrap.Modal(
    document.getElementById("newCustomerModal")
);

const editCustomerModal = new bootstrap.Modal(
    document.getElementById("editCustomerModal")
);

const viewCustomerModal = new bootstrap.Modal(
    document.getElementById("viewCustomerModal")
);

const customerLoginModal = new bootstrap.Modal(
    document.getElementById("customerLoginModal")
);

const deleteCustomerModal = new bootstrap.Modal(
    document.getElementById("deleteCustomerModal")
);

/*=========================================
      Save Local Storage
=========================================*/

function saveCustomers() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(customers)
    );

}

/*=========================================
      Generate Customer ID
=========================================*/

function generateCustomerId() {

    const year = new Date().getFullYear();

    const yearCustomers = customers.filter(customer =>
        customer.customerId.startsWith(`CF${year}-`)
    );

    const nextNumber = yearCustomers.length + 1;

    return `CF${year}-${String(nextNumber).padStart(3, "0")}`;

}

/*=========================================
      Open Add Customer Modal
=========================================*/

const addBtn = document.querySelector(
    '[data-bs-target="#newCustomerModal"]'
);

addBtn.addEventListener("click", () => {

    document.getElementById("customerForm").reset();

    document.getElementById("customerId").value =
        generateCustomerId();

});

/*=========================================
      Format Date
=========================================*/

function getTodayDate() {

    return new Date().toLocaleDateString("en-GB");

}
/*=========================================
      Render Customer Table
=========================================*/

function renderCustomers(list = customers) {

    const tbody =
        document.getElementById("customerTable");

    tbody.innerHTML = "";

    if (list.length === 0) {

        tbody.innerHTML = `

        <tr>

            <td colspan="7"
                class="text-center py-5">

                No Customers Found

            </td>

        </tr>

        `;

        updateStats();

        return;

    }

    list.forEach(customer => {

        tbody.innerHTML += `

<tr>

<td>${customer.customerId}</td>

<td>${customer.name}</td>

<td>${customer.mobile}</td>

<td>${customer.email || "-"}</td>

<td>${customer.address || "-"}</td>

<td>${customer.jobs || 0}</td>

<td class="text-center">

    <div class="action-buttons">

        <button
            class="action-btn btn-view"
            onclick="viewCustomer('${customer.customerId}')">

            <i class="bi bi-eye"></i>

        </button>

        <button
            class="action-btn btn-edit"
            onclick="editCustomer('${customer.customerId}')">

            <i class="bi bi-pencil"></i>

        </button>
        
        <button
    class="action-btn btn-login"
    onclick="openCustomerLogin('${customer.customerId}')">

    <i class="bi bi-key-fill"></i>

        </button>

        <button
            class="action-btn btn-delete"
            onclick="deleteCustomer('${customer.customerId}')">

            <i class="bi bi-trash"></i>

        </button>

    </div>

</td>

</tr>

`;

    });

    updateStats();

}
/*=========================================
      Statistics
=========================================*/

function updateStats() {

    document.getElementById("totalCustomers").textContent =
        customers.length;

    document.getElementById("activeCustomers").textContent =
        customers.length;

    const currentYear =
        new Date().getFullYear();

    const newCustomers = customers.filter(customer =>
        customer.customerId.startsWith(`CF${currentYear}-`)
    );

    document.getElementById("newCustomers").textContent =
        newCustomers.length;

    const totalJobs = customers.reduce((sum, customer) =>
        sum + (customer.jobs || 0), 0);

    document.getElementById("customerJobs").textContent =
        totalJobs;

}
/*=========================================
      LOAD FROM FIRESTORE
=========================================*/

async function loadCustomers() {

    try {

        const querySnapshot =
            await getDocs(
                collection(db, "customers")
            );

        customers = [];

        querySnapshot.forEach(doc => {

            customers.push(doc.data());

        });

        saveCustomers();

        renderCustomers();

        

    }

    catch (error) {

        console.error(error);

        renderCustomers();

    }

}

loadCustomers();

/*=========================================
      Save Customer
=========================================*/

document.getElementById("saveCustomer").addEventListener("click", async () => {

    const name = document.getElementById("customerName").value.trim();
    const mobile = document.getElementById("customerMobile").value.trim();
    const email = document.getElementById("customerEmail").value.trim();
    const address = document.getElementById("customerAddress").value.trim();

    if (name === "" || mobile === "") {

        alert("Customer Name and Mobile are required.");

        return;

    }

    if (mobile.length !== 10 || isNaN(mobile)) {

        alert("Enter a valid 10 digit mobile number.");

        return;

    }

    const customer = {

        customerId: generateCustomerId(),

        name,

        mobile,

        email,

        address,

        jobs: 0,

        joinDate: getTodayDate()

    };

    /*=========================================
      CREATE CUSTOMER LOGIN
=========================================*/

const loginData =
createCustomerLogin(customer);


if(loginData){

    customer.username =
    loginData.username;

    customer.password =
    loginData.password;

}

    customers.push(customer);

    saveCustomers();

    renderCustomers();

   try {

    await setDoc(

        doc(db, "customers", customer.customerId),

        customer

    );

    

    alert(

`Customer Login Created Successfully

Username :
${customer.username}

Password :
${customer.password}`

    );

}

catch (error) {

    console.error(error);

}

newCustomerModal.hide();

});

/*=========================================
      Generate Customer Password
=========================================*/

document
.getElementById("generateCustomerPassword")
.addEventListener("click", () => {

    document.getElementById(
        "loginNewPassword"
    ).value = generateStrongPassword();

});

/*=========================================
      Toggle Customer Password
=========================================*/

document
.getElementById("toggleCustomerPassword")
.addEventListener("click", () => {

    const input =
        document.getElementById(
            "loginCurrentPassword"
        );

    const icon =
        document.querySelector(
            "#toggleCustomerPassword i"
        );

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

});

/*=========================================
      Reset Customer Password
=========================================*/

document
.getElementById("resetCustomerPassword")
.addEventListener("click", async () => {

    const newPassword =
        document.getElementById(
            "loginNewPassword"
        ).value.trim();

    if(newPassword === ""){

        alert(
            "Please generate or enter a password."
        );

        return;

    }

    if(!isStrongPassword(newPassword)){

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

    const customer =
        customers.find(c =>
            c.customerId === loginCustomerId
        );

    if(!customer) return;

    customer.password = newPassword;

    saveCustomers();

    try{

        await updateDoc(

            doc(
                db,
                "customers",
                customer.customerId
            ),

            {
                password:newPassword
            }

        );

    }

    catch(error){

        console.error(error);

        alert(
            "Firestore update failed."
        );

        return;

    }

    document.getElementById(
        "loginCurrentPassword"
    ).value = newPassword;

    document.getElementById(
        "loginNewPassword"
    ).value = "";

    alert(
        "Password Reset Successfully."
    );

});

/*=========================================
      Search Customer
=========================================*/

document.getElementById("searchCustomer")
.addEventListener("keyup", function () {

    const keyword = this.value.toLowerCase();

    const filtered = customers.filter(customer =>

        customer.customerId.toLowerCase().includes(keyword) ||

        customer.name.toLowerCase().includes(keyword) ||

        customer.mobile.toLowerCase().includes(keyword)

    );

    renderCustomers(filtered);

});

/*=========================================
      View Customer
=========================================*/

function viewCustomer(customerId) {

    const customer = customers.find(c =>
        c.customerId === customerId
    );

    if (!customer) return;

    document.getElementById("vCustomerId").textContent =
        customer.customerId;

    document.getElementById("vCustomerName").textContent =
        customer.name;

    document.getElementById("vCustomerMobile").textContent =
        customer.mobile;

    document.getElementById("vCustomerEmail").textContent =
        customer.email || "-";

    document.getElementById("vCustomerAddress").textContent =
        customer.address || "-";

    document.getElementById("vCustomerJobs").textContent =
        customer.jobs || 0;

    /*=========================================
            Repair History
    =========================================*/

    const jobs =
        JSON.parse(localStorage.getItem("cf_jobs")) || [];

    const customerJobs =
        jobs.filter(job =>
            job.customerId === customer.customerId
        );

    const historyBody =
        document.getElementById("customerJobHistoryBody");

    historyBody.innerHTML = "";

    if(customerJobs.length === 0){

        historyBody.innerHTML = `
        <tr>
            <td colspan="6"
            class="text-center py-4 text-muted">
                No Repair History
            </td>
        </tr>
        `;

    }
    else{

        customerJobs
        .slice()
        .reverse()
        .forEach(job=>{

            historyBody.innerHTML += `

            <tr>

                <td>

                    <a href="#"
onclick="openCustomerJob('${job.jobId}'); return false;">

                        ${job.jobId}

                    </a>

                </td>

                <td>${job.device}</td>

                <td>${job.brand || "-"}</td>

                <td>${job.model || "-"}</td>

                <td>${job.status}</td>

                <td>${job.receivedDate}</td>

            </tr>

            `;

        });

    }

    /*=========================================
            Warranty History
=========================================*/

const warrantyBox =
    document.getElementById("customerWarrantyHistory");

warrantyBox.innerHTML = "";

let totalWarranty = 0;

customerJobs.forEach(job => {

    if (job.warrantyProducts &&
        job.warrantyProducts.length > 0) {

        job.warrantyProducts.forEach(item => {

            totalWarranty++;

            const today = new Date();

            const expiry =
                item.expiryDate
                ? new Date(item.expiryDate)
                : null;

            const active =
                expiry && expiry >= today;

            /* Remaining */

            let remaining = "-";

            if (expiry) {

                const diff =
                    expiry.getTime() - today.getTime();

                if (diff <= 0) {

                    remaining = "Expired";

                }

                else {

                    const days =
                        Math.ceil(diff / (1000 * 60 * 60 * 24));

                    if (days < 30) {

                        remaining =
                            days + " Days";

                    }

                    else {

                        const months =
                            Math.floor(days / 30);

                        if (months < 12) {

                            remaining =
                                months + " Months";

                        }

                        else {

                            const years =
                                Math.floor(months / 12);

                            const remainMonths =
                                months % 12;

                            remaining =
                                years + " Years";

                            if (remainMonths > 0) {

                                remaining +=
                                    " " + remainMonths + " Months";

                            }

                        }

                    }

                }

            }

            warrantyBox.innerHTML += `

            <div class="border rounded p-3 mb-3 bg-white">

                <div class="fw-bold fs-6">

                    ${item.productName}

                </div>

                <div>

                    <small class="text-muted">

                        ${item.brandModel || "-"}

                    </small>

                </div>

                <hr class="my-2">

                <div>

                    <strong>Purchase :</strong>

                    ${item.purchaseDate || "-"}

                </div>

                <div>

                    <strong>Warranty :</strong>

                    ${item.warranty || "-"}

                </div>

                <div>

                    <strong>Expires :</strong>

                    ${item.expiryDate || "-"}

                </div>

                <div>

                    <strong>Remaining :</strong>

                    ${remaining}

                </div>

                <div>

                    <strong>Job :</strong>

                    ${job.jobId}

                </div>

                <div class="mt-3">

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

            </div>

            `;

        });

    }

});

if (totalWarranty === 0) {

    warrantyBox.innerHTML = `

    <div class="text-center py-3 text-muted">

        No Warranty Found

    </div>

    `;

}

viewCustomerModal.show();

}

/*=========================================
      Edit Customer
=========================================*/

function editCustomer(customerId) {

    const customer = customers.find(c =>
        c.customerId === customerId
    );

    if (!customer) return;

    editCustomerId = customerId;

    document.getElementById("editCustomerName").value =
        customer.name;

    document.getElementById("editCustomerMobile").value =
        customer.mobile;

    document.getElementById("editCustomerEmail").value =
        customer.email;

    document.getElementById("editCustomerAddress").value =
        customer.address;

    document.getElementById("editCustomerJobs").value =
        customer.jobs;

    editCustomerModal.show();

}

/*=========================================
      Update Customer
=========================================*/

document.getElementById("updateCustomer")
.addEventListener("click", async () => {

    const customer = customers.find(c =>
        c.customerId === editCustomerId
    );

    if (!customer) return;

    customer.name =
        document.getElementById("editCustomerName").value.trim();

    customer.mobile =
        document.getElementById("editCustomerMobile").value.trim();

    customer.email =
        document.getElementById("editCustomerEmail").value.trim();

    customer.address =
        document.getElementById("editCustomerAddress").value.trim();

    saveCustomers();

try {

    await setDoc(

        doc(db, "customers", customer.customerId),

        customer

    );

    

}

catch(error){

    console.error(error);

}

renderCustomers();

editCustomerModal.hide();

});

/*=========================================
      Customer Login
=========================================*/

function openCustomerLogin(customerId) {

    const customer = customers.find(c =>
        c.customerId === customerId
    );

    if (!customer) return;

    loginCustomerId = customerId;

    document.getElementById("loginUsername").value =
        customer.username || customer.mobile;

    document.getElementById("loginCurrentPassword").value =
        customer.password || "";

    document.getElementById("loginNewPassword").value = "";

    const passwordInput =
    document.getElementById("loginCurrentPassword");

passwordInput.type = "password";

document
.querySelector("#toggleCustomerPassword i")
.className = "bi bi-eye";

    customerLoginModal.show();

}

/*=========================================
      Delete Customer
=========================================*/

function deleteCustomer(customerId) {

    const customer = customers.find(c =>
        c.customerId === customerId
    );

    if (!customer) return;

    deleteCustomerId = customerId;

    document.getElementById("deleteCustomerId").textContent =
        customer.customerId;

    document.getElementById("deleteCustomerName").textContent =
        customer.name;

    deleteCustomerModal.show();

}

/*=========================================
      Confirm Delete
=========================================*/

document.getElementById("confirmDeleteCustomer")
.addEventListener("click", async () => {

    try {

    await deleteDoc(

        doc(db, "customers", deleteCustomerId)

    );

    

}
catch(error){

    console.error(error);

}

customers = customers.filter(customer =>
    customer.customerId !== deleteCustomerId
);

saveCustomers();

renderCustomers();

deleteCustomerModal.hide();

});

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

        default:
            return `<span class="badge bg-light text-dark">${status}</span>`;
    }

}

/*=========================================
      Open Job From Customer History
=========================================*/

function openCustomerJob(jobId){

    localStorage.setItem(
        "openJobId",
        jobId
    );

    window.location.href =
        "jobs.html";

}

/*=========================================
      AUTO OPEN ADD CUSTOMER MODAL
=========================================*/

document.addEventListener("DOMContentLoaded", () => {

    const params = new URLSearchParams(window.location.search);

    if (params.get("action") === "add") {

        document.getElementById("customerForm").reset();

        document.getElementById("customerId").value =
            generateCustomerId();

        newCustomerModal.show();

        history.replaceState({}, "", "customers.html");

    }

});

/*=========================================
    Open Customer From Dashboard
=========================================*/

const openCustomerId =
    localStorage.getItem("openCustomerId");

if (openCustomerId) {

    setTimeout(() => {

        viewCustomer(openCustomerId);

        localStorage.removeItem("openCustomerId");

    }, 300);

}

window.viewCustomer = viewCustomer;

window.editCustomer = editCustomer;

window.openCustomerLogin = openCustomerLogin;

window.deleteCustomer = deleteCustomer;

window.openCustomerJob = openCustomerJob;



