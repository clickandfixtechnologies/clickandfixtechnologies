import { adminWorkerRequest } from "./admin-worker-client.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const fields = ["subject", "headerTitle", "greeting", "body", "buttonText", "closing", "footer"];
const list = document.getElementById("templateList");
const preview = document.getElementById("preview");
const notice = document.getElementById("notice");
let key = "";
let deliveryWorker = "auth";
const JOB_EMAIL_WORKER_URL = "https://solitary-bush-2656job-email-worker.clicknfixtechnologies.workers.dev";

const show = (text, ok = true) => { notice.innerHTML = `<div class="alert alert-${ok ? "success" : "danger"}">${text}</div>`; };
const values = () => Object.fromEntries(fields.map(field => [field, document.getElementById(field).value]));
const fill = template => fields.forEach(field => { document.getElementById(field).value = template[field] || ""; });

async function loadTemplates() {
    const data = await adminWorkerRequest("/admin/email-templates", { action: "list" });

    console.log(data);
console.log(data.templates);

    list.innerHTML = data.templates.map(template => `<button class="list-group-item list-group-item-action" data-key="${template.key}" data-delivery-worker="${template.deliveryWorker || "auth"}">${template.name}${template.hasOverride ? " *" : ""}</button>`).join("");
    list.querySelectorAll("button").forEach(button => { button.onclick = () => load(button.dataset.key); });
    if (data.templates[0]) await load(data.templates[0].key);
}

async function load(nextKey) {
    key = nextKey;
    const data = await adminWorkerRequest("/admin/email-templates", { action: "load", templateKey: key });
    deliveryWorker = data.template.deliveryWorker || "auth";
    fill(data.template);
    preview.srcdoc = data.template.html || "";
}

document.getElementById("save").onclick = async () => {
    const payload = { action: "save", templateKey: key, ...values() };
    await adminWorkerRequest("/admin/email-templates", payload);
    show("Template saved.");
    await load(key);
    preview.srcdoc = preview.srcdoc;
};
document.getElementById("reset").onclick = async () => { await adminWorkerRequest("/admin/email-templates", { action: "reset", templateKey: key }); show("Built-in template restored."); await load(key); };
document.getElementById("test").onclick = async () => {
    const email = prompt("Send test email to:");
    if (!email) return;

    if (deliveryWorker === "job") {
        const response = await fetch(`${JOB_EMAIL_WORKER_URL}/send-test-job-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ templateKey: key, email, ...values() })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || "Test email could not be sent.");
    } else {
        await adminWorkerRequest("/admin/email-templates", { action: "send-test", templateKey: key, email, ...values() });
    }

    show("Test email sent.");
};

onAuthStateChanged(auth, user => { if (user) loadTemplates().catch(error => show(error.message, false)); else show("Admin login is required.", false); });
