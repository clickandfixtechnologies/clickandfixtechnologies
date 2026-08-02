/*=========================================
      EMAIL VERIFICATION TEMPLATE
=========================================*/

function escapeHtml(value) {
    return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createEmailVerificationHtml(data = {}) {
    const message = escapeHtml(
        data.message ||
        "Please verify your email address to complete your Click & Fix Customer Portal setup."
    ).replace(/\n/g, "<br>");

    return `<!doctype html><html><body style="margin:0;padding:28px 12px;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155;"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;"><tr><td style="padding:30px;background:linear-gradient(135deg,#0d6efd,#00a6e8);color:#fff;"><div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">${escapeHtml(data.companyName)}</div><h1 style="font-size:26px;margin:10px 0 0;">Verify your email address</h1></td></tr><tr><td style="padding:32px;"><p>Hello ${escapeHtml(data.customerName)},</p><p>${message}</p><p style="text-align:center;margin:28px 0;"><a href="${escapeHtml(data.verificationUrl)}" style="display:inline-block;padding:14px 26px;background:#0d6efd;border-radius:9px;color:#fff;text-decoration:none;font-weight:bold;">Verify Email Address</a></p><p style="font-size:13px;color:#64748b;">This secure link expires in 24 hours. If you did not request this, you can ignore this email.</p></td></tr><tr><td style="padding:20px 32px;background:#0f172a;text-align:center;font-size:12px;color:#cbd5e1;">&copy; ${new Date().getFullYear()} ${escapeHtml(data.companyName)}. All rights reserved.</td></tr></table></td></tr></table></body></html>`;
}

export { createEmailVerificationHtml };
