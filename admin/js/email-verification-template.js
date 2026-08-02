/*=========================================
      EMAIL VERIFICATION TEMPLATE
=========================================*/

function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const emailVerificationDefaultMessage = "Please verify your email address to complete your Click & Fix Customer Portal setup.";
const emailVerificationStructuredDefaults = { headerTitle: "Verify your email address", greeting: "Hello {{customerName}},", body: emailVerificationDefaultMessage, buttonText: "Verify Email Address", closing: "This secure link expires in 24 hours. If you did not request this, you can ignore this email.", footer: "© {{currentYear}} {{companyName}}. All rights reserved." };
emailVerificationStructuredDefaults.body = emailVerificationDefaultMessage;

function createEmailVerificationHtml(data = {}) {
    const headerTitle = escapeHtml(data.headerTitle || "Verify your email address");
    const greeting = escapeHtml(data.greeting || `Hello ${data.customerName || "Customer"},`);
    const body = escapeHtml(data.body || data.message || emailVerificationDefaultMessage).replace(/\n/g, "<br>");
    const buttonText = escapeHtml(data.buttonText || "Verify Email Address");
    const closing = escapeHtml(data.closing || "This secure link expires in 24 hours. If you did not request this, you can ignore this email.").replace(/\n/g, "<br>");
    const footer = escapeHtml(data.footer || `© ${new Date().getFullYear()} ${data.companyName || "Click & Fix Technologies"}. All rights reserved.`);
    return `<!doctype html><html><body style="margin:0;padding:28px 12px;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155;"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="padding:30px;background:linear-gradient(135deg,#0d6efd,#00a6e8);color:#fff;"><div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">${escapeHtml(data.companyName)}</div><h1 style="font-size:26px;margin:10px 0 0;">${headerTitle}</h1></td></tr><tr><td style="padding:32px;"><p>${greeting}</p><p>${body}</p><p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(data.verificationUrl)}" style="display:inline-block;padding:14px 26px;background:#0d6efd;border-radius:9px;color:#fff;text-decoration:none;font-weight:bold;">${buttonText}</a></p><p style="font-size:13px;color:#64748b;">${closing}</p></td></tr><tr><td style="padding:20px 32px;background:#0f172a;text-align:center;font-size:12px;color:#cbd5e1;">${footer}</td></tr></table></td></tr></table></body></html>`;
}

export { createEmailVerificationHtml, emailVerificationDefaultMessage, emailVerificationStructuredDefaults };
