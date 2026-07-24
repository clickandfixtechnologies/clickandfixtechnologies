import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    doc,
    writeBatch
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/*=========================================
        DATABASE STATUS
=========================================*/

async function checkDatabaseStatus(){

    const status =
        document.getElementById("databaseStatus");

    if(!status) return;

    try{

        await getDocs(collection(db,"customers"));

        status.innerHTML =
            "🟢 Connected";

        status.style.color =
            "#16a34a";

    }

    catch(error){

        status.innerHTML =
            "🔴 Disconnected";

        status.style.color =
            "#dc2626";

        console.error(error);

    }

}

checkDatabaseStatus();

/*=========================================
        LAST BACKUP
=========================================*/

function loadLastBackup(){

    const backup =
        localStorage.getItem("lastBackup");

    const lastBackup =
        document.getElementById("lastBackup");

    if(!lastBackup) return;

    if(backup){

        lastBackup.textContent = backup;

    }

    else{

        lastBackup.textContent =
            "No Backup Yet";

    }

}

loadLastBackup();

/*=========================================
        BUTTONS
=========================================*/

document
.getElementById("backupBtn")
?.addEventListener(

    "click",

    backupDatabase

);

/*=========================================
        OPEN RESTORE MODAL
=========================================*/

const restoreModal =

    new bootstrap.Modal(

        document.getElementById("restoreModal")

    );

document

.getElementById("restoreBtn")

.addEventListener("click",()=>{

    restoreModal.show();

});

document
.getElementById("customerExcelBtn")
?.addEventListener(

    "click",

    downloadCustomersExcel

);

document
.getElementById("jobExcelBtn")
?.addEventListener(

    "click",

    downloadJobsExcel

);

/*=========================================
      CONTINUE RESTORE
=========================================*/

document

.getElementById("confirmRestoreBtn")

.addEventListener("click",()=>{

    restoreModal.hide();

    document

    .getElementById("restoreFile")

    .click();

});

/*=========================================
        BACKUP DATABASE
=========================================*/

async function backupDatabase(){

    try{

        /*==============================
            LOAD CUSTOMERS
        ==============================*/

        const customerSnapshot =
            await getDocs(
                collection(db,"customers")
            );

        const customers = [];

        customerSnapshot.forEach(doc=>{

            customers.push({

                id:doc.id,

                ...doc.data()

            });

        });

        /*==============================
                LOAD JOBS
        ==============================*/

        const jobSnapshot =
            await getDocs(
                collection(db,"jobs")
            );

        const jobs = [];

        jobSnapshot.forEach(doc=>{

            jobs.push({

                id:doc.id,

                ...doc.data()

            });

        });

        /*==============================
            CREATE BACKUP OBJECT
        ==============================*/

        const backupData={

            app:"Click & Fix CRM",

            version:"1.0",

            database:"Firebase Firestore",

            backupDate:new Date().toLocaleString("en-IN"),

            totalCustomers:customers.length,

            totalJobs:jobs.length,

            customers,

            jobs

        };

        /*==============================
            DOWNLOAD JSON
        ==============================*/

        const blob = new Blob(

            [

                JSON.stringify(

                    backupData,

                    null,

                    4

                )

            ],

            {

                type:"application/json"

            }

        );

        const url =

            URL.createObjectURL(blob);

        const a =

            document.createElement("a");

        a.href = url;

        a.download =

`ClickFix_Backup_${new Date().toISOString().slice(0,10)}.json`;

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        /*==============================
            SAVE LAST BACKUP
        ==============================*/

        const backupTime =

            new Date().toLocaleString("en-IN");

        localStorage.setItem(

            "lastBackup",

            backupTime

        );

        loadLastBackup();

        /*==============================
                SUCCESS
        ==============================*/

        alert(

`Backup Completed Successfully.

Customers : ${customers.length}

Jobs : ${jobs.length}`

        );

    }

    catch(error){

        console.error(error);

        alert(

            "Backup Failed."

        );

    }

}

/*=========================================
        RESTORE FILE
=========================================*/

document

.getElementById("restoreFile")

.addEventListener("change",function(){

    const file = this.files[0];

    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(e){

        try{

            const backup = JSON.parse(e.target.result);

            /* Validation */

            if(

    !Array.isArray(backup.customers) ||

    !Array.isArray(backup.jobs)

){

    alert("Invalid Backup File.");

    return;

}

            console.log(

                "Backup File OK",

                backup

            );

            /* Next Step */

            restoreDatabase(

                backup

            );

        }

        catch(error){

            alert(

                "Backup File Corrupted."

            );

        }

    };

    reader.readAsText(file);

});

async function restoreDatabase(backup){

    try{

        /*==============================
    AUTO BACKUP BEFORE RESTORE
==============================*/

const autoBackup = {

    backupDate: new Date().toLocaleString("en-IN"),

    customers:
        JSON.parse(
            localStorage.getItem("cf_customers")
        ) || [],

    jobs:
        JSON.parse(
            localStorage.getItem("cf_jobs")
        ) || []

};

const autoBlob = new Blob(

    [JSON.stringify(autoBackup,null,2)],

    {
        type:"application/json"
    }

);

const autoUrl =
    URL.createObjectURL(autoBlob);

const autoLink =
    document.createElement("a");

autoLink.href = autoUrl;

autoLink.download =
`Auto_Backup_${new Date().toISOString().slice(0,10)}.json`;

autoLink.click();

URL.revokeObjectURL(autoUrl);

        /*==============================
            RESTORE CUSTOMERS
        ==============================*/

        let batch = writeBatch(db);

        backup.customers.forEach(customer=>{

            const ref = doc(

                db,

                "customers",

                customer.id

            );

            batch.set(ref,customer);

        });

        await batch.commit();

        /*==============================
            RESTORE JOBS
        ==============================*/

        batch = writeBatch(db);

        backup.jobs.forEach(job=>{

            const ref = doc(

                db,

                "jobs",

                job.id

            );

            batch.set(ref,job);

        });

        await batch.commit();

localStorage.setItem(

    "cf_customers",

    JSON.stringify(

        backup.customers

    )

);

localStorage.setItem(

    "cf_jobs",

    JSON.stringify(

        backup.jobs

    )

);

localStorage.setItem(
    "lastBackup",
    new Date().toLocaleString("en-IN")
);

loadLastBackup();

        alert("Database Restored Successfully.");
alert("Database Restored Successfully.");

location.reload();

    }

    catch(error){

        console.error(error);

        alert("Restore Failed.");

    }

}
    


/*=========================================
      DOWNLOAD CUSTOMERS (EXCEL)
=========================================*/

async function downloadCustomersExcel(){

    try{

        const snapshot =

            await getDocs(

                collection(db,"customers")

            );

        const customers = [];

        snapshot.forEach(doc=>{

    customers.push({

        id: doc.id,

        ...doc.data()

    });

});

        if(customers.length===0){

            alert(

                "No Customers Found."

            );

            return;

        }

        const headers=[

            "Customer ID",

            "Name",

            "Mobile",

            "Email",

            "Address"

        ];

        let csv =

            headers.join(",")

            + "\n";

        customers.forEach(customer=>{

            csv += [

                customer.customerId || "",

                `"${customer.name || ""}"`,

                customer.mobile || "",

                customer.email || "",

                `"${customer.address || ""}"`

            ].join(",")

            + "\n";

        });

        const blob = new Blob(

            [csv],

            {

                type:

                "text/csv;charset=utf-8;"

            }

        );

        const url =

            URL.createObjectURL(blob);

        const a =

            document.createElement("a");

        a.href = url;

        a.download =

            `Customers_${Date.now()}.csv`;

        a.click();

        URL.revokeObjectURL(url);

    }

    catch(error){

        console.error(error);

        alert(

            "Customer Export Failed."

        );

    }

}

/*=========================================
      DOWNLOAD JOBS (EXCEL)
=========================================*/

async function downloadJobsExcel(){

    try{

        const snapshot =
            await getDocs(
                collection(db,"jobs")
            );

        const jobs = [];

        snapshot.forEach(doc=>{

    jobs.push({

        id: doc.id,

        ...doc.data()

    });

});
        if(jobs.length===0){

            alert("No Jobs Found.");

            return;

        }

        const headers=[

            "Job ID",

            "Customer",

            "Mobile",

            "Device",

            "Brand",

            "Model",

            "Problem",

            "Status",

            "Received Date"

        ];

        let csv =

            headers.join(",")

            + "\n";

        jobs.forEach(job=>{

            csv += [

                job.jobId || "",

                `"${job.customer || ""}"`,

                job.mobile || "",

                `"${job.device || ""}"`,

                `"${job.brand || ""}"`,

                `"${job.model || ""}"`,

                `"${job.problem || ""}"`,

                job.status || "",

                job.receivedDate || ""

            ].join(",")

            + "\n";

        });

        const blob = new Blob(

            [csv],

            {

                type:"text/csv;charset=utf-8;"

            }

        );

        const url =
            URL.createObjectURL(blob);

        const a =
            document.createElement("a");

        a.href = url;

        a.download =
            `Jobs_${Date.now()}.csv`;

        a.click();

        URL.revokeObjectURL(url);

    }

    catch(error){

        console.error(error);

        alert("Jobs Export Failed.");

    }

}