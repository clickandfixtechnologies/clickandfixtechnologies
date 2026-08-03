import { createJobStatusEmailHtml, jobStatusEmailTemplates } from "./js/job-status-email-templates.js";

const ORIGIN = "https://clickandfix.site";
const JOB_TEMPLATE_PATH = "system/emailTemplates/templates";
const cors = {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors }
});

const statusTemplateKeys = Object.freeze({
    "Item Received": "job_received",
    "Diagnosis": "diagnosis",
    "Waiting Parts": "waiting_for_parts",
    "Repair In Progress": "repair_in_progress",
    "Ready": "ready",
    "Delivered": "delivered"
});

const editableFields = ["subject", "headerTitle", "greeting", "body", "buttonText", "closing", "footer"];

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

        const path = new URL(request.url).pathname;
        if (request.method !== "POST" || !["/send-job-status-email", "/send-test-job-email"].includes(path)) {
            return json({ success: false, error: "Not found." }, 404);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ success: false, error: "Invalid JSON request body." }, 400);
        }

        try {
            if (path === "/send-test-job-email") {
                if (!body.email || !body.templateKey) return json({ success: false, error: "Test email address and template are required." }, 400);

                const template = getJobTemplate(body.templateKey);
                if (!template) return json({ success: false, error: "Unknown job email template." }, 404);

                const resolved = await resolveJobTemplate(template, sampleJobValues(env), env, body);
                await sendBrevoEmail(body.email, "John Smith", resolved, env);

                return json({ success: true, message: "Test email sent successfully." });
            }

            if (!body.jobId || !body.status) return json({ success: false, error: "jobId and status are required." }, 400);

            const template = getJobTemplate(statusTemplateKeys[body.status]);
            if (!template) return json({ success: false, error: "No email template is configured for this job status." }, 400);

            const token = await getToken(env);
            const jobDocument = await firestoreQuery("jobs", "jobId", body.jobId, token, env);
            const job = jobDocument?.fields ? fields(jobDocument.fields) : null;
            if (!job) return json({ success: false, error: "Job not found." }, 404);

            const customerDocument = await firestoreQuery("customers", "customerId", job.customerId, token, env);
            const customer = customerDocument?.fields ? fields(customerDocument.fields) : null;
            if (!customer?.email) return json({ success: false, error: "Customer email not found." }, 404);

const deliveredEntry =
    (job.timeline || []).find(item => item.status === "Delivered");

const deliveryTime =
    deliveredEntry?.date?.split(", ")[1] || "";
            
            const values = {
                customer_name: customer.name || "Customer",
                job_id: job.jobId,
                device_name: job.device || "",
                device_brand: job.brand || "",
                device_model: job.model || "",
                current_status: body.status,
                estimated_time: job.estimatedTime || "",
                delivery_date: job.deliveredDate || "",
                delivery_time: deliveryTime,
                portal_url: env.CUSTOMER_PORTAL_URL || "https://clickandfix.site/admin/customer-login.html",
                company_name: env.APP_NAME || "Click & Fix Technologies",
                current_year: new Date().getFullYear()
            };

            const resolved = await resolveJobTemplate(template, values, env);
            await sendBrevoEmail(customer.email, customer.name || "Customer", resolved, env);

            return json({ success: true, message: "Job status email sent successfully." });
        } catch (error) {
            console.error("Job status email failed", error);
            return json({ success: false, error: error.message || "Unable to send email." }, 500);
        }
    }
};

function getJobTemplate(templateKey) {
    return jobStatusEmailTemplates.find(template => template.key === templateKey);
}

function sampleJobValues(env) {
    return {
        customer_name: "John Smith",
        job_id: "JOB-1008",
        device_name: "iPhone 13",
        device_brand: "Apple",
        device_model: "A2633",
        current_status: "Repair in Progress",
        estimated_time: "2–3 Hours",
        delivery_date: "12 August 2026",
        delivery_time: "5:30 PM",
        portal_url: "https://clickandfix.site/admin/customer-login.html",
        company_name: env.APP_NAME || "Click & Fix Technologies",
        current_year: new Date().getFullYear()
    };
}

async function resolveJobTemplate(template, values, env, requestOverride = {}) {
    const token = await getToken(env);
    const override = await getDocument(`${JOB_TEMPLATE_PATH}/${template.key}`, token, env);
    const selected = {};

    editableFields.forEach(field => {
        const requestValue = requestOverride[field];
        const storedValue = override?.fields?.[field]?.stringValue;
        selected[field] = typeof requestValue === "string" && requestValue.trim() !== ""
            ? requestValue
            : (storedValue ?? (field === "subject" ? template.defaultSubject : template.defaults[field]));
    });

    return {
        subject: replace(selected.subject, values),
        html: createJobStatusEmailHtml(template, {
            ...values,
            headerTitle: replace(selected.headerTitle, values),
            greeting: replace(selected.greeting, values),
            body: replace(selected.body, values),
            buttonText: replace(selected.buttonText, values),
            closing: replace(selected.closing, values),
            footer: replace(selected.footer, values)
        })
    };
}

async function sendBrevoEmail(email, name, resolved, env) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
            sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
            to: [{ email: String(email), name }],
            subject: resolved.subject,
            htmlContent: resolved.html
        })
    });

    if (!response.ok) throw new Error("Email delivery failed.");
}

function replace(text, values) {
    return String(text || "").replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => values[key.toLowerCase()] ?? match);
}

function fields(source) {
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [
        key,
        value.stringValue ?? value.integerValue ?? value.timestampValue ?? ""
    ]));
}

async function getToken(env) {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify({
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
    }));
    const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "");
    const key = await crypto.subtle.importKey(
        "pkcs8",
        Uint8Array.from(atob(pem), character => character.charCodeAt(0)),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const input = `${header}.${payload}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
    const assertion = `${input}.${base64UrlBytes(new Uint8Array(signature))}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error("Firestore authentication failed.");
    return result.access_token;
}

function base64Url(value) {
    return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(value) {
    return btoa(String.fromCharCode(...value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function firestoreQuery(collectionId, fieldPath, value, token, env) {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId }],
                where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: String(value) } } },
                limit: 1
            }
        })
    });
    if (!response.ok) throw new Error("Firestore query failed.");
    const result = await response.json();
    return result.find(item => item.document)?.document;
}

async function getDocument(path, token, env) {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Email template lookup failed.");
    return response.json();
}
