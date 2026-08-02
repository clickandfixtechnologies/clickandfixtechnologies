function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const passwordResetDefaultMessage = "We received a request to reset your Customer Portal password.";
const passwordResetStructuredDefaults = { headerTitle: "Reset your password", greeting: "Hello {{customerName}},", body: passwordResetDefaultMessage, buttonText: "Reset Password", closing: "This secure link expires in 30 minutes. If you did not request this, ignore this email.", footer: "" };
passwordResetStructuredDefaults.body = passwordResetDefaultMessage;

function createPasswordResetEmailHtml(data = {}) {
    const headerTitle = escapeHtml(data.headerTitle || "Reset your password");
    const greeting = escapeHtml(data.greeting || `Hello ${data.customerName || "Customer"},`);
    const body = escapeHtml(data.body || data.message || passwordResetDefaultMessage).replace(/\n/g, "<br>");
    const buttonText = escapeHtml(data.buttonText || "Reset Password");
    const closing = escapeHtml(data.closing || "This secure link expires in 30 minutes. If you did not request this, ignore this email.").replace(/\n/g, "<br>");
    const footer = escapeHtml(data.footer || "");
    return `<!doctype html><html><body style="margin:0;padding:28px 12px;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155;"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="padding:30px;background:linear-gradient(135deg,#0d6efd,#00a6e8);color:#fff;"><div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">${escapeHtml(data.companyName || "Click & Fix Technologies")}</div><h1 style="font-size:26px;margin:10px 0 0;">${headerTitle}</h1></td></tr><tr><td style="padding:32px;"><p>${greeting}</p><p>${body}</p><p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(data.resetUrl)}" style="display:inline-block;padding:14px 26px;background:#0d6efd;border-radius:9px;color:#fff;text-decoration:none;font-weight:bold;">${buttonText}</a></p><p style="font-size:13px;color:#64748b;">${closing}</p>${footer ? `<p style="font-size:13px;color:#64748b;">${footer}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
}

export { createPasswordResetEmailHtml, passwordResetDefaultMessage, passwordResetStructuredDefaults };
