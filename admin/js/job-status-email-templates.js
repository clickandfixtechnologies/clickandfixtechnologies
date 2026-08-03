const jobEmailFooter = "© {{current_year}} {{company_name}}. All rights reserved.";

const jobStatusEmailTemplates = Object.freeze([
    Object.freeze({
        key: "job_received",
        module: "js/job-status-email-templates.js",
        name: "Job Received",
        deliveryWorker: "job",
        defaultSubject: "We Have Received Your Device",
        defaults: Object.freeze({
            headerTitle: "Your device has been received",
            greeting: "Hello {{customer_name}},",
            body: "We have received your {{device_brand}} {{device_model}} for service.\n\nJob ID: {{job_id}}\nCurrent status: {{current_status}}\n\nWe will update you after the initial diagnosis.",
            buttonText: "Open Customer Portal",
            closing: "Thank you for choosing {{company_name}}.",
            footer: jobEmailFooter
        })
    }),
    Object.freeze({
        key: "diagnosis",
        module: "js/job-status-email-templates.js",
        name: "Diagnosis",
        deliveryWorker: "job",
        defaultSubject: "Diagnosis Update for Your Device",
        defaults: Object.freeze({
            headerTitle: "Diagnosis update",
            greeting: "Hello {{customer_name}},",
            body: "The diagnosis for your {{device_brand}} {{device_model}} is in progress.\n\nJob ID: {{job_id}}\nCurrent status: {{current_status}}\nEstimated time: {{estimated_time}}",
            buttonText: "Open Customer Portal",
            closing: "We will keep you informed as your repair progresses.",
            footer: jobEmailFooter
        })
    }),
    Object.freeze({
        key: "waiting_for_parts",
        module: "js/job-status-email-templates.js",
        name: "Waiting for Parts",
        deliveryWorker: "job",
        defaultSubject: "Parts Update for Your Device Repair",
        defaults: Object.freeze({
            headerTitle: "Waiting for parts",
            greeting: "Hello {{customer_name}},",
            body: "Your {{device_brand}} {{device_model}} repair is waiting for the required parts.\n\nJob ID: {{job_id}}\nCurrent status: {{current_status}}\nEstimated time: {{estimated_time}}",
            buttonText: "Open Customer Portal",
            closing: "We will notify you as soon as the required parts are available.",
            footer: jobEmailFooter
        })
    }),
    Object.freeze({
        key: "repair_in_progress",
        module: "js/job-status-email-templates.js",
        name: "Repair in Progress",
        deliveryWorker: "job",
        defaultSubject: "Your Device Repair Is in Progress",
        defaults: Object.freeze({
            headerTitle: "Repair in progress",
            greeting: "Hello {{customer_name}},",
            body: "Our technician is currently repairing your {{device_brand}} {{device_model}}.\n\nJob ID: {{job_id}}\nCurrent status: {{current_status}}\nEstimated time: {{estimated_time}}",
            buttonText: "Open Customer Portal",
            closing: "We will let you know as soon as your repair is complete.",
            footer: jobEmailFooter
        })
    }),
    Object.freeze({
        key: "ready",
        module: "js/job-status-email-templates.js",
        name: "Ready",
        deliveryWorker: "job",
        defaultSubject: "Your Device is Ready",
        defaults: Object.freeze({
            headerTitle: "Your device is ready",
            greeting: "Hello {{customer_name}},",
            body: "Good news.\n\nYour repair has been completed successfully.\n\nYour device is now ready.\n\nEstimated delivery:\n\nWithin 2–3 hours.",
            buttonText: "Open Customer Portal",
            closing: "Please contact us if you need any assistance with collection or delivery.",
            footer: jobEmailFooter
        })
    }),
    Object.freeze({
        key: "delivered",
        module: "js/job-status-email-templates.js",
        name: "Delivered",
        deliveryWorker: "job",
        defaultSubject: "Your Device Has Been Delivered",
        defaults: Object.freeze({
            headerTitle: "Your device has been delivered",
            greeting: "Hello {{customer_name}},",
            body: "Your repaired device has been delivered successfully.\n\nJob ID: {{job_id}}\nDevice: {{device_brand}} {{device_model}}\nDelivery Date: {{delivery_date}}\nDelivery Time: {{delivery_time}}",
            buttonText: "Open Customer Portal",
            closing: "For complete repair history and service report,\n\nplease log in to your Customer Portal.",
            footer: jobEmailFooter
        })
    })
]);

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderText(value, data) {
    const values = Object.fromEntries(
        Object.entries(data || {}).map(([key, item]) => [key.toLowerCase(), item])
    );

    return escapeHtml(value).replace(/{{\s*([^}]+)\s*}}/g, (token, key) => {
        const replacement = values[key.toLowerCase()];
        return replacement === undefined || replacement === null
            ? token
            : escapeHtml(replacement);
    }).replace(/\n/g, "<br>");
}

function createJobStatusEmailHtml(template, data = {}) {
    const defaults = template.defaults;
    const content = {
        headerTitle: data.headerTitle || defaults.headerTitle,
        greeting: data.greeting || defaults.greeting,
        body: data.body || defaults.body,
        buttonText: data.buttonText || defaults.buttonText,
        closing: data.closing || defaults.closing,
        footer: data.footer || defaults.footer
    };
    const companyName = renderText(data.company_name || data.companyName || "Click & Fix Technologies", data);
    const portalUrl = escapeHtml(data.portal_url || data.portalUrl || "https://clickandfix.site/admin/customer-dashboard.html");

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${renderText(data.subject || template.defaultSubject, data)}</title></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,.10);"><tr><td style="padding:30px 32px;background:linear-gradient(135deg,#0d6efd,#00a6e8);color:#ffffff;"><div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.82;margin-bottom:8px;">${companyName}</div><div style="font-size:28px;line-height:1.25;font-weight:700;">${renderText(content.headerTitle, data)}</div></td></tr><tr><td style="padding:32px 32px 22px;"><div style="font-size:17px;font-weight:700;color:#1e293b;margin-bottom:14px;">${renderText(content.greeting, data)}</div><div style="font-size:15px;line-height:1.7;color:#475569;">${renderText(content.body, data)}</div></td></tr><tr><td align="center" style="padding:0 32px 26px;"><a href="${portalUrl}" style="display:inline-block;padding:14px 26px;background:#0d6efd;border-radius:9px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${renderText(content.buttonText, data)}</a></td></tr><tr><td style="padding:0 32px 26px;"><div style="padding:15px 17px;background:#eff6ff;border-left:4px solid #0d6efd;border-radius:8px;font-size:13px;line-height:1.65;color:#1e3a8a;">${renderText(content.closing, data)}</div></td></tr><tr><td style="padding:20px 32px;background:#0f172a;text-align:center;font-size:12px;line-height:1.6;color:#cbd5e1;">${renderText(content.footer, data)}</td></tr></table></td></tr></table></body></html>`;
}

export { createJobStatusEmailHtml, jobStatusEmailTemplates };
