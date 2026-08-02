/*=========================================
      WELCOME EMAIL TEMPLATE
=========================================*/

const welcomeEmailDefaults = {
    subject: "Welcome to Click & Fix Customer Portal",
    headerTitle: "Welcome to Click & Fix",
    greeting: "Hello {{customerName}},",
    bodyText: "Your customer portal account is ready. Use the secure login details below to view repair updates, service history, and warranty information.",
    message: "",
    loginButtonText: "Open Customer Portal",
    closingText: "For your security, please change your temporary password immediately after your first login.",
    footerText: "Thank you for choosing Click & Fix Technologies.",
    companyName: "Click & Fix Technologies",
    companyWebsite: "https://clickandfix.site",
    supportEmail: "clicknfixtechnologies@gmail.com",
    supportPhone: "+91 70988 89990",
    advertisementTitle: "Need a repair or service?",
    advertisementText: "Our technicians are ready to help with reliable device repair and support.",
    showAdvertisement: true
};

const welcomeEmailStructuredDefaults = {
    headerTitle: welcomeEmailDefaults.headerTitle,
    greeting: welcomeEmailDefaults.greeting,
    body: welcomeEmailDefaults.bodyText,
    buttonText: welcomeEmailDefaults.loginButtonText,
    closing: welcomeEmailDefaults.closingText,
    footer: welcomeEmailDefaults.footerText
};

welcomeEmailStructuredDefaults.body = welcomeEmailDefaults.bodyText;

const welcomeEmailPlaceholders = [
    "{{companyName}}",
    "{{customerName}}",
    "{{customerId}}",
    "{{username}}",
    "{{temporaryPassword}}",
    "{{loginUrl}}",
    "{{companyWebsite}}",
    "{{supportEmail}}",
    "{{supportPhone}}",
    "{{currentYear}}"
];

function getWelcomeEmailConfig(config = {}) {

    const normalizedConfig = {};

    Object.keys(welcomeEmailDefaults).forEach(key => {

        if (typeof welcomeEmailDefaults[key] === "boolean") {

            normalizedConfig[key] =
            typeof config[key] === "boolean"
                ? config[key]
                : welcomeEmailDefaults[key];

            return;

        }

        normalizedConfig[key] =
        typeof config[key] === "string" && config[key].trim() !== ""
            ? config[key].trim()
            : welcomeEmailDefaults[key];

    });

    return normalizedConfig;

}

function escapeHtml(value) {

    return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

function formatText(value) {

    return escapeHtml(value).replace(/\n/g, "<br>");

}

function createWelcomeEmailHtml(options = {}) {

    const config = getWelcomeEmailConfig(options.config || {});

    const data = {
        companyName: config.companyName,
        customerName: "{{customerName}}",
        customerId: "{{customerId}}",
        username: "{{username}}",
        temporaryPassword: "{{temporaryPassword}}",
        loginUrl: "https://clickandfix.site/admin/customer-login.html",
        companyWebsite: config.companyWebsite,
        supportEmail: config.supportEmail,
        supportPhone: config.supportPhone,
        currentYear: new Date().getFullYear(),
        ...(options.data || {})
    };

    const replaceTokens = value => String(value || "").replace(
        /{{(companyName|customerName|customerId|username|temporaryPassword|loginUrl|companyWebsite|supportEmail|supportPhone|currentYear)}}/g,
        (token, key) => escapeHtml(data[key] || token)
    );

    const headerTitle = replaceTokens(options.data?.headerTitle || config.headerTitle);
    const greeting = replaceTokens(options.data?.greeting || config.greeting);
    const bodyText = replaceTokens(options.data?.body || options.data?.message || config.message || config.bodyText).replace(/\n/g, "<br>");
    const closingText = replaceTokens(options.data?.closing || config.closingText).replace(/\n/g, "<br>");
    const footerText = replaceTokens(options.data?.footer || config.footerText).replace(/\n/g, "<br>");
    const loginButtonText = replaceTokens(options.data?.buttonText || config.loginButtonText);
    const companyName = escapeHtml(data.companyName);
    const loginUrl = escapeHtml(data.loginUrl);
    const companyWebsite = escapeHtml(data.companyWebsite);
    const supportEmail = escapeHtml(data.supportEmail);
    const supportPhone = escapeHtml(data.supportPhone);

    const advertisement = config.showAdvertisement
        ? `
        <tr>
            <td style="padding:0 32px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;">
                    <tr>
                        <td style="padding:20px 22px;">
                            <div style="font-size:16px;font-weight:700;color:#1e3a8a;margin-bottom:6px;">${replaceTokens(config.advertisementTitle)}</div>
                            <div style="font-size:14px;line-height:1.65;color:#475569;">${replaceTokens(config.advertisementText)}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>`
        : "";

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(config.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,.10);">
                    <tr>
                        <td style="padding:30px 32px;background:linear-gradient(135deg,#0d6efd,#00a6e8);color:#ffffff;">
                            <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.82;margin-bottom:8px;">${companyName}</div>
                            <div style="font-size:28px;line-height:1.25;font-weight:700;">${headerTitle}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 32px 22px;">
                            <div style="font-size:17px;font-weight:700;color:#1e293b;margin-bottom:14px;">${greeting}</div>
                            <div style="font-size:15px;line-height:1.7;color:#475569;">${bodyText}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 32px 26px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dbeafe;border-radius:14px;overflow:hidden;">
                                <tr><td colspan="2" style="padding:14px 18px;background:#eff6ff;font-size:15px;font-weight:700;color:#1e3a8a;">Your Customer Portal Details</td></tr>
                                <tr><td style="padding:13px 18px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:42%;">Customer ID</td><td style="padding:13px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#1e293b;">${escapeHtml(data.customerId)}</td></tr>
                                <tr><td style="padding:13px 18px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">Username</td><td style="padding:13px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#1e293b;">${escapeHtml(data.username)}</td></tr>
                                <tr><td style="padding:13px 18px;font-size:13px;color:#64748b;">Temporary Password</td><td style="padding:13px 18px;font-size:14px;font-weight:700;color:#0d6efd;letter-spacing:.5px;">${escapeHtml(data.temporaryPassword)}</td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:0 32px 26px;">
                            <a href="${loginUrl}" style="display:inline-block;padding:14px 26px;background:#0d6efd;border-radius:9px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${loginButtonText}</a>
                            <div style="font-size:12px;line-height:1.6;color:#64748b;margin-top:12px;word-break:break-all;">${loginUrl}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 32px 26px;">
                            <div style="padding:15px 17px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;font-size:13px;line-height:1.65;color:#78350f;">${closingText}<br><br>Email verification will be available from your Customer Portal soon.</div>
                        </td>
                    </tr>
                    ${advertisement}
                    <tr>
                        <td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b;">
                            <div style="font-weight:700;color:#334155;margin-bottom:4px;">Need help?</div>
                            <div>Email: <a href="mailto:${supportEmail}" style="color:#0d6efd;text-decoration:none;">${supportEmail}</a> &nbsp;|&nbsp; Phone: ${supportPhone}</div>
                            <div>Website: <a href="${companyWebsite}" style="color:#0d6efd;text-decoration:none;">${companyWebsite}</a></div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px 32px;background:#0f172a;text-align:center;font-size:12px;line-height:1.6;color:#cbd5e1;">
                            <div>${footerText}</div>
                            <div style="margin-top:4px;">© ${escapeHtml(data.currentYear)} ${companyName}. All rights reserved.</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

}

export {
    createWelcomeEmailHtml,
    getWelcomeEmailConfig,
    welcomeEmailDefaults,
    welcomeEmailStructuredDefaults,
    welcomeEmailPlaceholders
};
