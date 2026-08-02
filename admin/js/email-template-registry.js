/*
 * GENERATED EMAIL TEMPLATE MANIFEST
 *
 * This file is generated from the existing *-email-template.js modules and
 * consumed by application code as the sole template registry. Do not add
 * template entries manually in application logic.
 */

import { createWelcomeEmailHtml, welcomeEmailDefaults, welcomeEmailStructuredDefaults } from "./welcome-email-template.js";
import { createEmailVerificationHtml, emailVerificationDefaultMessage, emailVerificationStructuredDefaults } from "./email-verification-template.js";
import { createPasswordResetEmailHtml, passwordResetDefaultMessage, passwordResetStructuredDefaults } from "./password-reset-email-template.js";

const emailTemplateRegistry = Object.freeze([
    Object.freeze({
        key: "welcome",
        module: "js/welcome-email-template.js",
        name: "Customer Welcome Email",
        defaultSubject: welcomeEmailDefaults.subject,
        defaultMessage: welcomeEmailDefaults.bodyText,
        defaults: welcomeEmailStructuredDefaults,
        render: data => createWelcomeEmailHtml({ data })
    }),
    Object.freeze({
        key: "verification",
        module: "js/email-verification-template.js",
        name: "Customer Verification Email",
        defaultSubject: "Verify your Click & Fix email address",
        defaultMessage: emailVerificationDefaultMessage,
        defaults: emailVerificationStructuredDefaults,
        render: data => createEmailVerificationHtml(data)
    }),
    Object.freeze({
        key: "passwordReset",
        module: "js/password-reset-email-template.js",
        name: "Password Reset Email",
        defaultSubject: "Reset your Click & Fix password",
        defaultMessage: passwordResetDefaultMessage,
        defaults: passwordResetStructuredDefaults,
        render: data => createPasswordResetEmailHtml(data)
    })
]);

export { emailTemplateRegistry };
