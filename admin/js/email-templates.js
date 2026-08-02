import { adminWorkerRequest } from "./admin-worker-client.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const list = document.getElementById("templateList");
const subject = document.getElementById("subject");
const message = document.getElementById("message");
const preview = document.getElementById("preview");
const notice = document.getElementById("notice");
let key = "";

const show = (text, ok = true) => {
    notice.innerHTML = `<div class="alert alert-${ok ? "success" : "danger"}">${text}</div>`;
};

function render(html) {
    preview.srcdoc = html || "";
}

async function loadTemplates() {
    const data = await adminWorkerRequest("/admin/email-templates", { action: "list" });
    list.innerHTML = data.templates.map(template => `<button class="list-group-item list-group-item-action" data-key="${template.key}">${template.name}${template.hasOverride ? " *" : ""}</button>`).join("");
    list.querySelectorAll("button").forEach(button => { button.onclick = () => load(button.dataset.key); });
    if (data.templates[0]) await load(data.templates[0].key);
}

async function load(nextKey) {
    key = nextKey;
    const data = await adminWorkerRequest("/admin/email-templates", { action: "load", templateKey: key });
    subject.value = data.template.subject || "";
    message.value = data.template.message || "";
    render(data.template.html);
}

document.getElementById("save").onclick = async () => {
    await adminWorkerRequest("/admin/email-templates", { action: "save", templateKey: key, subject: subject.value, message: message.value });
    show("Template saved.");
    await load(key);
};

document.getElementById("reset").onclick = async () => {
    await adminWorkerRequest("/admin/email-templates", { action: "reset", templateKey: key });
    show("Built-in template restored.");
    await load(key);
};

document.getElementById("test").onclick = async () => {
    const email = prompt("Send test email to:");
    if (!email) return;
    await adminWorkerRequest("/admin/email-templates", { action: "send-test", templateKey: key, email });
    show("Test email sent.");
};

onAuthStateChanged(auth, user => {
    if (user) loadTemplates().catch(error => show(error.message, false));
    else show("Admin login is required.", false);
});
