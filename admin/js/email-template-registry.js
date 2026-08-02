/*
 * GENERATED EMAIL TEMPLATE MANIFEST
 *
 * This file is generated from the existing *-email-template.js modules and
 * consumed by application code as the sole template registry. Do not add
 * template entries manually in application logic.
 */

import { createWelcomeEmailHtml, welcomeEmailDefaults } from "./welcome-email-template.js";
import { createEmailVerificationHtml } from "./email-verification-template.js";
import { createPasswordResetEmailHtml } from "./password-reset-email-template.js";

const emailTemplateRegistry = Object.freeze([
    Object.freeze({
        key: "welcome",
        module: "js/welcome-email-template.js",
        name: "Customer Welcome Email",
        defaultSubject: welcomeEmailDefaults.subject,
        render: data => createWelcomeEmailHtml({ data })
    }),
    Object.freeze({
        key: "verification",
        module: "js/email-verification-template.js",
        name: "Customer Verification Email",
        defaultSubject: "Verify your Click & Fix email address",
        render: data => createEmailVerificationHtml(data)
    }),
    Object.freeze({
        key: "passwordReset",
        module: "js/password-reset-email-template.js",
        name: "Password Reset Email",
        defaultSubject: "Reset your Click & Fix password",
        render: data => createPasswordResetEmailHtml(data)
    })
]);

export { emailTemplateRegistry };
