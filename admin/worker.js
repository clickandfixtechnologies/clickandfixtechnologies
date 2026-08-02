import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createWelcomeEmailHtml, getWelcomeEmailConfig } from "./js/welcome-email-template.js";
import { createEmailVerificationHtml } from "./js/email-verification-template.js";
import { createPasswordResetEmailHtml } from "./js/password-reset-email-template.js";

const ORIGIN = "https://clickandfix.site";
const SESSION_SECONDS = 60 * 60 * 12;
const VERIFICATION_TOKEN_SECONDS = 60 * 60 * 24;
const RESET_TOKEN_SECONDS = 60 * 30;

let firestoreAccessToken = "";
let firestoreAccessTokenExpiresAt = 0;

function cors() {
    return {
        "Access-Control-Allow-Origin": ORIGIN,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Vary": "Origin"
    };
}

function json(body, status = 200, origin = "") {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=UTF-8", ...cors() }
    });
}

function base64Url(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let text = "";
    source.forEach(byte => { text += String.fromCharCode(byte); });
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64(value) {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function pemToBytes(pem) {
    const base64 = String(pem || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");

    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

async function getFirestoreRestAccessToken(env) {
    if (firestoreAccessToken && firestoreAccessTokenExpiresAt > Date.now() + 60000) {

        return firestoreAccessToken;

    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const payload = base64Url(new TextEncoder().encode(JSON.stringify({
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
    })));
    const signingInput = `${header}.${payload}`;
    const privateKey = await crypto.subtle.importKey(
        "pkcs8",
        pemToBytes(env.FIREBASE_PRIVATE_KEY),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        privateKey,
        new TextEncoder().encode(signingInput)
    );
    const assertion = `${signingInput}.${base64Url(signature)}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion
        })
    });

    if (!response.ok) {

        throw new Error(`Firestore REST authentication failed (${response.status}).`);

    }

    const token = await response.json();
    firestoreAccessToken = token.access_token;
    firestoreAccessTokenExpiresAt = Date.now() + (Number(token.expires_in || 3600) * 1000);

    return firestoreAccessToken;
}

async function usernameReservationExists(username, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const documentPath = encodeURIComponent(String(username));
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/system/customerUsernames/entries/${documentPath}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (response.status === 404) return false;
    if (response.ok) return true;

    throw new Error(`Firestore username lookup failed (${response.status}).`);
}

async function signJwt(payload, secret) {
    const encode = new TextEncoder();
    const header = base64Url(encode.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const content = base64Url(encode.encode(JSON.stringify(payload)));
    const key = await crypto.subtle.importKey("raw", encode.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encode.encode(`${header}.${content}`));
    return `${header}.${content}.${base64Url(signature)}`;
}

async function verifyJwt(token, secret) {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid session.");
    const encode = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encode.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, decodeBase64(parts[2]), encode.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw new Error("Invalid session.");
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64(parts[1])));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Session expired.");
    return payload;
}

async function passwordMatches(password, passwordHash) {
    const [algorithm, iterationText, saltText, hashText] = String(passwordHash || "").split("$");
    if (algorithm !== "pbkdf2_sha256") return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decodeBase64(saltText), iterations: Number(iterationText), hash: "SHA-256" }, key, 256);
    const expected = decodeBase64(hashText);
    const actual = new Uint8Array(bits);
    if (expected.length !== actual.length) return false;
    let different = 0;
    expected.forEach((byte, index) => { different |= byte ^ actual[index]; });
    return different === 0;
}

async function createPasswordHash(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
    const normalBase64 = bytes => btoa(String.fromCharCode(...bytes));
    return `pbkdf2_sha256$210000$${normalBase64(salt)}$${normalBase64(new Uint8Array(bits))}`;
}

function getDb(env) {
    if (!getApps().length) initializeApp({ credential: cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
    return getFirestore();
}

async function verifyTurnstile(token, request, env) {
    if (!token || !env.TURNSTILE_SECRET_KEY) return false;
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET_KEY);
    form.append("response", token);
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return Boolean((await response.json()).success);
}

function safeCustomer(data) {
    const { password, passwordHash, sessionVersion, emailVerificationTokenHash, emailVerificationExpiresAt, passwordResetTokenHash, passwordResetExpiresAt, ...customer } = data;
    return customer;
}

function randomToken() {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function hashToken(token) {
    return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

async function sendVerificationEmail(customerRef, customer, env) {
    if (!customer.email) throw new Error("Customer email address is missing.");
    const token = randomToken();
    const expiresAt = Date.now() + (VERIFICATION_TOKEN_SECONDS * 1000);
    await customerRef.update({
        emailVerified: false,
        emailVerificationTokenHash: await hashToken(token),
        emailVerificationExpiresAt: expiresAt
    });
    const verificationUrl = `${new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html").origin}${new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html").pathname}`;
    const workerUrl = new URL(env.WORKER_PUBLIC_URL || "https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev");
    const verifyLink = `${workerUrl.origin}/verify-email?customerId=${encodeURIComponent(customer.customerId)}&token=${encodeURIComponent(token)}`;
    const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ name: customer.name, email: customer.email }], subject: "Verify your Click & Fix email address", htmlContent: createEmailVerificationHtml({ companyName: env.APP_NAME || "Click & Fix Technologies", customerName: customer.name, verificationUrl: verifyLink, loginUrl: verificationUrl }) }) });
    if (!response.ok) throw new Error("Verification email delivery failed.");
}

function generateTemporaryPassword() {

    const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*!?";

    const values = crypto.getRandomValues(new Uint8Array(16));

    return Array.from(values, value =>
        characters[value % characters.length]
    ).join("");

}

async function writeAuditLog(db, eventType, adminUid, customerId, details = {}) {

    await db.collection("auditLogs").add({
        eventType,
        actorUid: adminUid,
        customerId,
        createdAt: FieldValue.serverTimestamp(),
        ...details
    });

}

async function sendWelcomeEmail(customer, temporaryPassword, emailConfig, env) {

    const config = getWelcomeEmailConfig(emailConfig || {});

    config.companyName = env.APP_NAME || config.companyName;
    config.companyWebsite = env.COMPANY_WEBSITE || config.companyWebsite;

    const response = await fetch(
        "https://api.brevo.com/v3/smtp/email",
        {
            method: "POST",
            headers: {
                "api-key": env.BREVO_API_KEY,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                sender: {
                    name: env.BREVO_SENDER_NAME,
                    email: env.BREVO_SENDER_EMAIL
                },
                to: [{ name: customer.name, email: customer.email }],
                subject: config.subject,
                htmlContent: createWelcomeEmailHtml({
                    config,
                    data: {
                        customerName: customer.name,
                        customerId: customer.customerId,
                        username: customer.username,
                        temporaryPassword,
                        companyName: config.companyName,
                        companyWebsite: config.companyWebsite,
                        loginUrl: env.LOGIN_URL ||
                        "https://clickandfix.site/admin/customer-login.html"
                    }
                })
            })
        }
    );

    if (!response.ok) {

        throw new Error("Welcome email delivery failed.");

    }

}

async function requireSession(request, env) {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const claims = await verifyJwt(token, env.JWT_SECRET);
    const ref = getDb(env).collection("customers").doc(claims.sub);
    const snap = await ref.get();
    if (!snap.exists || Number(snap.data().sessionVersion || 0) !== Number(claims.sv || 0)) throw new Error("Session expired.");
    return { claims, ref, customer: snap.data() };
}

async function requireAdmin(request, env) {

    const token =
    request.headers.get("Authorization")
    ?.replace(/^Bearer\s+/i, "") || "";

    if (!token) {

        const error = new Error("Admin authentication is required.");

        error.status = 401;

        throw error;

    }

    const adminApp = getApps().length
        ? getApps()[0]
        : initializeApp({
            credential: cert({
                projectId: env.FIREBASE_PROJECT_ID,
                clientEmail: env.FIREBASE_CLIENT_EMAIL,
                privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
            })
        });

    console.info("Admin authentication step: Firebase Admin token verification started.");

    const decodedToken = await getAuth(adminApp)
    .verifyIdToken(token, true);

    console.info("Admin authentication step: Firebase Admin token verification succeeded.");

    console.info("Admin authentication step: custom claim check started.");

    if (decodedToken.admin !== true) {

        const error = new Error("Admin access is required.");

        error.status = 403;

        throw error;

    }

    console.info("Admin authentication step: custom claim check succeeded.");

    return decodedToken;

}

export default { async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/verify-email") {
        const customerId = new URL(request.url).searchParams.get("customerId");
        const token = new URL(request.url).searchParams.get("token");
        const loginUrl = env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html";
        if (!customerId || !token) return Response.redirect(`${loginUrl}?verified=invalid`, 302);
        const query = await getDb(env).collection("customers").where("customerId", "==", customerId).limit(1).get();
        if (query.empty) return Response.redirect(`${loginUrl}?verified=invalid`, 302);
        const ref = query.docs[0].ref, customer = query.docs[0].data();
        if (customer.emailVerified || !customer.emailVerificationExpiresAt || customer.emailVerificationExpiresAt < Date.now() || customer.emailVerificationTokenHash !== await hashToken(token)) return Response.redirect(`${loginUrl}?verified=invalid`, 302);
        await ref.update({ emailVerified: true, emailVerificationTokenHash: FieldValue.delete(), emailVerificationExpiresAt: FieldValue.delete() });
        return Response.redirect(`${loginUrl}?verified=success`, 302);
    }
    if (request.method === "OPTIONS") {
        return origin === ORIGIN
            ? new Response(null, { status: 204, headers: cors() })
            : json({ success: false, error: "Origin is not allowed." }, 403, origin);
    }
    if (origin !== ORIGIN) return json({ success: false, error: "Origin is not allowed." }, 403, origin);
    if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json({ success: false, error: "Content-Type must be application/json." }, 415, origin);
    let body; try { body = await request.json(); } catch { return json({ success: false, error: "Invalid JSON request body." }, 400, origin); }
    let diagnosticStep = "request_routing";

    try {
        if (path === "/admin/session") {

            const admin = await requireAdmin(request, env);

            return json({
                success: true,
                admin: {
                    uid: admin.uid,
                    email: admin.email || ""
                }
            }, 200, origin);

        }

        const adminPasswordMatch = path.match(
            /^\/admin\/customers\/([^/]+)\/password$/
        );

        if (adminPasswordMatch) {

            const admin = await requireAdmin(request, env);
            const customerId = decodeURIComponent(adminPasswordMatch[1]);
            const newPassword = String(body.newPassword || "");

            if (
                !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(
                    newPassword
                )
            ) {

                return json({
                    success: false,
                    error: "New password does not meet the security requirements."
                }, 400, origin);

            }

            const db = getDb(env);
            const customerRef = db.collection("customers").doc(customerId);
            const customer = await customerRef.get();

            if (!customer.exists) {

                return json({
                    success: false,
                    error: "Customer not found."
                }, 404, origin);

            }

            await customerRef.update({
                passwordHash: await createPasswordHash(newPassword),
                passwordUpdatedAt: FieldValue.serverTimestamp(),
                sessionVersion: FieldValue.increment(1)
            });

            await writeAuditLog(
                db,
                "customer_password_reset",
                admin.uid,
                customerId
            );

            return json({
                success: true,
                message: "Customer password updated successfully."
            }, 200, origin);

        }

        if (path === "/admin/customers") {

            diagnosticStep = "firebase_admin_token_verification_or_custom_claim_check";
            const admin = await requireAdmin(request, env);
            const { name, mobile, email, address = "", emailConfig } = body;

            if (
                typeof name !== "string" || !name.trim() ||
                !/^\d{10}$/.test(String(mobile || "")) ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))
            ) {

                return json({
                    success: false,
                    error: "Name, a valid 10 digit mobile number, and email are required."
                }, 400, origin);

            }

            const normalizedMobile = String(mobile).trim();
            diagnosticStep = "duplicate_username_lookup";
            const duplicateExists = await usernameReservationExists(normalizedMobile, env);

            if (duplicateExists) {

                return json({
                    success: false,
                    error: "A customer with this mobile number already exists."
                }, 409, origin);

            }

            diagnosticStep = "firestore_initialization";
            const db = getDb(env);

            diagnosticStep = "temporary_password_generation";
            const temporaryPassword = generateTemporaryPassword();
            diagnosticStep = "pbkdf2_hash_generation";
            const passwordHash = await createPasswordHash(temporaryPassword);
            const year = new Date().getFullYear();
            const counterRef = db.collection("system")
            .doc("customerCounters")
            .collection("years")
            .doc(String(year));
            const usernameRef = db.collection("system")
            .doc("customerUsernames")
            .collection("entries")
            .doc(normalizedMobile);

            const customer = await db.runTransaction(async transaction => {

                diagnosticStep = "customer_counter_read";
                const counter = await transaction.get(counterRef);
                const nextNumber = Number(counter.data()?.nextNumber || 1);
                const customerId =
                `CF${year}-${String(nextNumber).padStart(3, "0")}`;
                const customerRef = db.collection("customers").doc(customerId);

                const customerData = {
                    customerId,
                    name: name.trim(),
                    mobile: normalizedMobile,
                    username: normalizedMobile,
                    email: String(email).trim(),
                    address: String(address).trim(),
                    jobs: 0,
                    joinDate: new Date().toLocaleDateString("en-GB"),
                    passwordHash,
                    sessionVersion: 0,
                    emailVerified: false,
                    createdAt: FieldValue.serverTimestamp(),
                    createdBy: admin.uid,
                    passwordUpdatedAt: FieldValue.serverTimestamp()
                };

                diagnosticStep = "customer_document_write";
                transaction.create(customerRef, customerData);
                diagnosticStep = "username_reservation_write";
                transaction.create(usernameRef, {
                    customerId,
                    createdAt: FieldValue.serverTimestamp()
                });
                diagnosticStep = "customer_counter_creation_or_update";
                transaction.set(counterRef, {
                    nextNumber: nextNumber + 1,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                return { customerRef, customerData };

            });

            let welcomeEmailSent = false;
            let verificationEmailSent = false;

            try {

                diagnosticStep = "welcome_email";
                await sendWelcomeEmail(
                    customer.customerData,
                    temporaryPassword,
                    emailConfig,
                    env
                );

                welcomeEmailSent = true;

            }
            catch (error) {

                console.error("Welcome email delivery failed.", {
                    name: error?.name,
                    message: error?.message,
                    stack: error?.stack
                });

            }

            try {

                diagnosticStep = "verification_email";
                await sendVerificationEmail(
                    customer.customerRef,
                    customer.customerData,
                    env
                );

                verificationEmailSent = true;

            }
            catch (error) {

                console.error("Verification email delivery failed.", {
                    name: error?.name,
                    message: error?.message,
                    stack: error?.stack
                });

            }

            diagnosticStep = "audit_log_customer_created";
            await writeAuditLog(
                db,
                "customer_created",
                admin.uid,
                customer.customerData.customerId,
                { welcomeEmailSent, verificationEmailSent }
            );

            diagnosticStep = "audit_log_welcome_email";
            await writeAuditLog(
                db,
                welcomeEmailSent
                    ? "welcome_email_sent"
                    : "email_delivery_failed",
                admin.uid,
                customer.customerData.customerId,
                { emailType: "welcome" }
            );

            diagnosticStep = "audit_log_verification_email";
            await writeAuditLog(
                db,
                verificationEmailSent
                    ? "verification_email_sent"
                    : "email_delivery_failed",
                admin.uid,
                customer.customerData.customerId,
                { emailType: "verification" }
            );

            return json({
                success: true,
                customerId: customer.customerData.customerId,
                username: customer.customerData.username,
                message: "Customer created successfully."
            }, 201, origin);

        }

        if (path === "/forgot-password") {
            if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return json({ success: true, message: "If an account exists, a reset link has been sent." }, 200, origin);
            const query = await getDb(env).collection("customers").where("email", "==", String(body.email).trim()).limit(1).get();
            if (!query.empty && env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.BREVO_SENDER_NAME) {
                const ref = query.docs[0].ref, customer = query.docs[0].data(), token = randomToken();
                await ref.update({ passwordResetTokenHash: await hashToken(token), passwordResetExpiresAt: Date.now() + (RESET_TOKEN_SECONDS * 1000) });
                const base = new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html");
                const resetUrl = `${base.origin}/admin/reset-password.html?customerId=${encodeURIComponent(customer.customerId)}&token=${encodeURIComponent(token)}`;
                await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ name: customer.name, email: customer.email }], subject: "Reset your Click & Fix password", htmlContent: createPasswordResetEmailHtml({ companyName: env.APP_NAME, customerName: customer.name, resetUrl }) }) });
            }
            return json({ success: true, message: "If an account exists, a reset link has been sent." }, 200, origin);
        }
        if (path === "/reset-password") {
            if (!body.customerId || !body.token || !body.newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(body.newPassword)) return json({ success: false, error: "Invalid reset request or password." }, 400, origin);
            const query = await getDb(env).collection("customers").where("customerId", "==", String(body.customerId)).limit(1).get();
            if (query.empty) return json({ success: false, error: "This reset link is invalid or expired." }, 400, origin);
            const ref = query.docs[0].ref, customer = query.docs[0].data();
            if (!customer.passwordResetExpiresAt || customer.passwordResetExpiresAt < Date.now() || customer.passwordResetTokenHash !== await hashToken(body.token)) return json({ success: false, error: "This reset link is invalid or expired." }, 400, origin);
            await ref.update({ passwordHash: await createPasswordHash(body.newPassword), passwordResetTokenHash: FieldValue.delete(), passwordResetExpiresAt: FieldValue.delete(), sessionVersion: FieldValue.increment(1) });
            return json({ success: true, message: "Password reset successfully." }, 200, origin);
        }
        if (path === "/login") {
            if (!await verifyTurnstile(body.turnstileToken, request, env)) return json({ success: false, error: "Verification failed." }, 401, origin);
            if (!body.username || !body.password) return json({ success: false, error: "Username and password are required." }, 400, origin);
            const query = await getDb(env).collection("customers").where("username", "==", String(body.username).trim()).limit(1).get();
            if (query.empty) return json({ success: false, error: "Invalid username or password." }, 401, origin);
            const doc = query.docs[0], customer = doc.data();
            if (!customer.passwordHash || !await passwordMatches(body.password, customer.passwordHash)) return json({ success: false, error: "Invalid username or password." }, 401, origin);
            const session = await signJwt({ sub: doc.id, sv: Number(customer.sessionVersion || 0), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, env.JWT_SECRET);
            return json({ success: true, session }, 200, origin);
        }
        const session = await requireSession(request, env);
        if (path === "/resend-verification-email") {
            if (session.customer.emailVerified) return json({ success: true, message: "Email is already verified." }, 200, origin);
            await sendVerificationEmail(session.ref, session.customer, env);
            return json({ success: true, message: "Verification email sent successfully." }, 200, origin);
        }
        if (path === "/session") return json({ success: true, customer: safeCustomer(session.customer) }, 200, origin);
        if (path === "/customer-dashboard") {
            const jobs = await getDb(env).collection("jobs").where("customerId", "==", session.customer.customerId).get();
            return json({ success: true, customer: safeCustomer(session.customer), jobs: jobs.docs.map(job => job.data()) }, 200, origin);
        }
        if (path === "/change-password") {
            if (!body.currentPassword || !body.newPassword) return json({ success: false, error: "Current and new passwords are required." }, 400, origin);
            if (!await passwordMatches(body.currentPassword, session.customer.passwordHash)) return json({ success: false, error: "Current password is incorrect." }, 401, origin);
            if (body.currentPassword === body.newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(body.newPassword)) return json({ success: false, error: "New password does not meet the security requirements." }, 400, origin);
            const nextSessionVersion = Number(session.customer.sessionVersion || 0) + 1;
            await session.ref.update({ passwordHash: await createPasswordHash(body.newPassword), sessionVersion: nextSessionVersion });
            const nextSession = await signJwt({ sub: session.ref.id, sv: nextSessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, env.JWT_SECRET);
            return json({ success: true, message: "Password updated successfully.", session: nextSession }, 200, origin);
        }
        if (path === "/logout") { await session.ref.update({ sessionVersion: FieldValue.increment(1) }); return json({ success: true }, 200, origin); }
        return json({ success: false, error: "Endpoint not found." }, 404, origin);
    } catch (error) {
        console.error("Worker request failed.", {
            path,
            method: request.method,
            diagnosticStep,
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });

        return json({
            success: false,
            error: error.status === 401 || error.status === 403
                ? error.message
                : "Request could not be completed."
        }, error.status || 500, origin);
    }
} };
