import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createWelcomeEmailHtml, getWelcomeEmailConfig } from "./js/welcome-email-template.js";
import { createEmailVerificationHtml } from "./js/email-verification-template.js";
import { createPasswordResetEmailHtml } from "./js/password-reset-email-template.js";
import { emailTemplateRegistry } from "./js/email-template-registry.js";
import { jobStatusTemplateRegistry } from "./js/job-status-template-registry.js";

const ORIGIN = "https://clickandfix.site";
const SESSION_SECONDS = 60 * 60 * 12;
const VERIFICATION_TOKEN_SECONDS = 60 * 60 * 24;
const RESET_TOKEN_SECONDS = 60 * 30;
const PBKDF2_ITERATIONS = 100000;
const WEB_CRYPTO_PBKDF2_MAX_ITERATIONS = 100000;
const OFFER_TYPES = new Set(["SPECIAL_DISCOUNT", "AMC", "WARRANTY_EXTENSION", "SERVICE_DISCOUNT", "PRODUCT_OFFER", "CUSTOM"]);
const OFFER_DISCOUNT_TYPES = new Set(["PERCENTAGE", "FIXED_AMOUNT", "SPECIAL_PRICE", "NONE"]);
const OFFER_STATUSES = new Set(["DRAFT", "ACTIVE", "DISABLED", "EXPIRED", "ARCHIVED"]);
const OFFER_ASSIGNMENT_STATUSES = new Set(["ASSIGNED", "VIEWED", "CLAIMED", "APPROVED", "REDEEMED", "CANCELLED", "EXPIRED"]);
const OFFER_CODE_STATUSES = new Set(["UNUSED", "REDEEMED", "EXPIRED", "CANCELLED"]);

let firestoreAccessToken = "";
let firestoreAccessTokenExpiresAt = 0;

function replaceEmailPlaceholders(template, values = {}) {
    return String(template || "").replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key) => {
        const value = values[key.toLowerCase()];
        return value === undefined || value === null ? match : String(value);
    });
}

async function resolveEmailTemplate(templateKey, values, env) {
    const definition = emailTemplateRegistry.find(template => template.key === templateKey);
    if (!definition) throw new Error("Email template is not registered.");

    return resolveTemplateDefinition(definition, values, env);
}

async function resolveTemplateDefinition(definition, values, env) {

    const override = await getFirestoreRestDocument(
        `system/emailTemplates/templates/${definition.key}`,
        env
    );

    if (override?.fields?.subject?.stringValue) {
        const editableFields = {
            headerTitle: override.fields.headerTitle?.stringValue,
            greeting: override.fields.greeting?.stringValue,
            body: override.fields.body?.stringValue || override.fields.message?.stringValue,
            buttonText: override.fields.buttonText?.stringValue,
            closing: override.fields.closing?.stringValue,
            footer: override.fields.footer?.stringValue
        };
        return {
            subject: replaceEmailPlaceholders(override.fields.subject.stringValue, values),
            html: definition.render({
                ...values,
                ...Object.fromEntries(Object.entries(editableFields).map(([key, value]) => [key, value === undefined ? undefined : replaceEmailPlaceholders(value, values)]))
            }),
            source: "firestore"
        };
    }

    return {
        subject: replaceEmailPlaceholders(definition.defaultSubject, values),
        html: definition.render(values),
        source: "built_in"
    };
}

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
    const requestUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/system/customerUsernames/entries/${documentPath}`;
    const response = await fetch(
        requestUrl,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (response.status === 404) return false;
    if (response.ok) return true;

    throw new Error(`Firestore username lookup failed (${response.status}).`);
}

function firestoreDocumentName(documentPath, env) {
    const encodedPath = String(documentPath)
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");

    return `projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${encodedPath}`;
}

function firestoreTimestampValue(date = new Date()) {
    return { timestampValue: date.toISOString() };
}

async function getFirestoreRestDocument(documentPath, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const response = await fetch(
        `https://firestore.googleapis.com/v1/${firestoreDocumentName(documentPath, env)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firestore document read failed (${response.status}).`);

    return response.json();
}

function firestoreRestValueToJavaScript(value) {
    if (Object.hasOwn(value, "stringValue")) return value.stringValue;
    if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
    if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
    if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
    if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
    if (Object.hasOwn(value, "nullValue")) return null;
    if (Object.hasOwn(value, "mapValue")) {

        return Object.fromEntries(Object.entries(value.mapValue.fields || {})
        .map(([key, nestedValue]) => [key, firestoreRestValueToJavaScript(nestedValue)]));

    }
    if (Object.hasOwn(value, "arrayValue")) {

        return (value.arrayValue.values || []).map(firestoreRestValueToJavaScript);

    }

    return null;
}

function firestoreRestDocumentToCustomer(document) {
    return {
        id: String(document.name || "").split("/").pop(),
        data: Object.fromEntries(Object.entries(document.fields || {})
        .map(([key, value]) => [key, firestoreRestValueToJavaScript(value)]))
    };
}

async function findCustomerByField(fieldName, fieldValue, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: "customers" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: fieldName },
                            op: "EQUAL",
                            value: { stringValue: String(fieldValue).trim() }
                        }
                    },
                    limit: 1
                }
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore customer query failed (${response.status}).`);

    const responseText = await response.text();
    console.info("Firestore REST JSON parsing started.", { field: "runQueryResponse" });
    const parsedResponse = JSON.parse(responseText);
    const results = Array.isArray(parsedResponse)
        ? parsedResponse
        : [parsedResponse];
    const match = results.find(result => result.document);

    return match ? firestoreRestDocumentToCustomer(match.document) : null;
}

async function findCustomerByUsername(username, env) {
    return findCustomerByField("username", username, env);
}

async function findJobsByCustomerId(customerId, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: "jobs" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "customerId" },
                            op: "EQUAL",
                            value: { stringValue: String(customerId) }
                        }
                    }
                }
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore jobs query failed (${response.status}).`);

    const parsedResponse = JSON.parse(await response.text());
    const results = Array.isArray(parsedResponse)
        ? parsedResponse
        : [parsedResponse];

    return results
    .filter(result => result.document)
    .map(result => firestoreRestDocumentToCustomer(result.document).data);
}

async function commitFirestoreWrites(writes, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const writeMetadata = writes.map(({ diagnosticLabel, ...write }) => ({
        diagnosticLabel,
        write
    }));
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:commit`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({ writes: writeMetadata.map(({ write }) => write) })
        }
    );

    if (!response.ok) {

        const responseBody = await response.text();
        let firestoreError;

        try {

            firestoreError = JSON.parse(responseBody);

        } catch {

            firestoreError = { raw: responseBody };

        }

        console.error("Firestore REST commit failed.", {
            status: response.status,
            statusText: response.statusText,
            firestoreError,
            writes: writeMetadata.map(({ diagnosticLabel, write }) => ({
                diagnosticLabel,
                currentDocument: write.currentDocument || null,
                document: write.update?.name || null
            }))
        });

        const error = new Error(`Firestore commit failed (${response.status}).`);
        error.status = response.status;
        error.firestoreError = firestoreError;
        throw error;

    }

    return response.json().catch(() => ({}));
}

async function patchFirestoreRestDocument(documentPath, fields, env, deletedFields = []) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const updateMask = [...new Set([...Object.keys(fields), ...deletedFields])]
    .map(field => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
    const response = await fetch(
        `https://firestore.googleapis.com/v1/${firestoreDocumentName(documentPath, env)}?${updateMask}`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                name: firestoreDocumentName(documentPath, env),
                fields
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore document update failed (${response.status}).`);
}

async function updateCustomerDocumentWithFirestoreRest(endpoint, documentPath, fields, env, options = {}) {
    console.info("Firestore REST update started.", { endpoint, path: documentPath });

    try {
        if (options.incrementSessionVersion) {
            const writes = [];

            if (Object.keys(fields).length || (options.deletedFields || []).length) {

                writes.push({
                    diagnosticLabel: `${endpoint}_customer_update`,
                    update: {
                        name: firestoreDocumentName(documentPath, env),
                        fields
                    },
                    updateMask: { fieldPaths: [...Object.keys(fields), ...(options.deletedFields || [])] }
                });

            }

            writes.push({
                diagnosticLabel: `${endpoint}_session_version_increment`,
                transform: {
                    document: firestoreDocumentName(documentPath, env),
                    fieldTransforms: [{
                        fieldPath: "sessionVersion",
                        increment: { integerValue: "1" }
                    }]
                }
            });
            await commitFirestoreWrites(writes, env);

        } else {

            await patchFirestoreRestDocument(
                documentPath,
                fields,
                env,
                options.deletedFields || []
            );

        }

        console.info("Firestore REST update succeeded.", { endpoint, path: documentPath });

    } catch (error) {

        console.error("Firestore REST update failed.", {
            endpoint,
            path: documentPath,
            message: error?.message
        });
        throw error;

    }
}

async function writeFirestoreRestAuditLog(eventType, adminUid, customerId, details, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const fields = {
        eventType: { stringValue: eventType },
        actorUid: { stringValue: adminUid },
        customerId: { stringValue: customerId },
        createdAt: firestoreTimestampValue()
    };

    Object.entries(details).forEach(([key, value]) => {
        fields[key] = typeof value === "boolean"
            ? { booleanValue: value }
            : { stringValue: String(value) };
    });

    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/auditLogs`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({ fields })
        }
    );

    if (!response.ok) throw new Error(`Firestore audit log write failed (${response.status}).`);
}

function offerError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function offerIdentifier(value, name) {
    const identifier = String(value || "").trim();

    if (!/^[A-Za-z0-9_-]{1,128}$/.test(identifier)) {
        throw offerError(`A valid ${name} is required.`);
    }

    return identifier;
}

function offerDate(value, name, required = false) {
    if (value === undefined || value === null || value === "") {
        if (required) throw offerError(`${name} is required.`);
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) throw offerError(`${name} is invalid.`);

    return date.toISOString();
}

function offerRandomId(prefix) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function offerCodeValue() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return `CF-OFR-${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("")}`;
}

function offerRedemptionReferenceValue() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    return `RED-${new Date().getFullYear()}-${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("")}`;
}

function firestoreRestValue(value) {
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number" && Number.isFinite(value)) return { doubleValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreRestValue) } };
    if (value && typeof value === "object") {
        return {
            mapValue: {
                fields: Object.fromEntries(
                    Object.entries(value)
                    .filter(([, nestedValue]) => nestedValue !== undefined)
                    .map(([key, nestedValue]) => [key, firestoreRestValue(nestedValue)])
                )
            }
        };
    }

    return { nullValue: null };
}

function offerFields(values) {
    return Object.fromEntries(
        Object.entries(values)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, firestoreRestValue(value)])
    );
}

function offerRecord(document) {
    return document
        ? { ...firestoreRestDocumentToCustomer(document), document }
        : null;
}

function offerIsActive(offer, now = Date.now()) {
    if (!offer || offer.status !== "ACTIVE") return false;

    const start = Date.parse(offer.startDate || "");
    const expiry = Date.parse(offer.expiryDate || "");

    return !Number.isNaN(start) && !Number.isNaN(expiry) && now >= start && now <= expiry;
}

function offerAssignmentIsVisible(assignment) {
    return assignment && assignment.status !== "CANCELLED";
}

function offerCodeIsActive(code, now = Date.now()) {
    return code && code.status === "UNUSED" && Number.isFinite(Date.parse(code.expiryDate || "")) && now <= Date.parse(code.expiryDate);
}

function offerCodeEffectiveStatus(code, now = Date.now()) {
    if (!code) return "INVALID";
    if (code.status !== "UNUSED") return code.status;
    return Number.isFinite(Date.parse(code.expiryDate || "")) && now > Date.parse(code.expiryDate)
        ? "EXPIRED"
        : "UNUSED";
}

async function findFirestoreRecordsByField(collectionId, fieldName, fieldValue, env, limit = 500) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: fieldName },
                            op: "EQUAL",
                            value: { stringValue: String(fieldValue) }
                        }
                    },
                    limit
                }
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore ${collectionId} query failed (${response.status}).`);

    const responseText = await response.text();
    const results = JSON.parse(responseText);

    return (Array.isArray(results) ? results : [results])
    .filter(result => result.document)
    .map(result => firestoreRestDocumentToCustomer(result.document));
}

async function listFirestoreRecords(collectionId, env, limit = 500) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId }],
                    limit
                }
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore ${collectionId} list failed (${response.status}).`);

    const results = JSON.parse(await response.text());

    return (Array.isArray(results) ? results : [results])
    .filter(result => result.document)
    .map(result => firestoreRestDocumentToCustomer(result.document));
}

function offerResponse(record) {
    const { id, data } = record;
    return { offerId: data.offerId || id, ...data };
}

async function writeOfferAuditLog(eventType, adminUid, customerId, details, env) {
    try {
        await writeFirestoreRestAuditLog(eventType, adminUid, customerId, details, env);
    } catch (error) {
        console.error("Offer audit log write failed.", { eventType, message: error?.message });
    }
}

async function createOfferClaimNotification(customer, assignment, offer, env) {
    const notificationId = offerRandomId("NTF");
    const createdAt = new Date().toISOString();
    const viewClaimUrl = new URL(
        "/admin/offers.html",
        env.COMPANY_WEBSITE || ORIGIN
    );
    viewClaimUrl.searchParams.set("tab", "claims");
    viewClaimUrl.searchParams.set("assignmentId", assignment.assignmentId);

    const notification = {
        notificationId,
        type: "OFFER_CLAIMED",
        title: "New Offer Claim",
        message: `${customer.name || "Customer"} claimed ${offer.title || "an offer"}.`,
        customerId: assignment.customerId,
        customerName: customer.name || "Customer",
        offerId: assignment.offerId,
        offerTitle: offer.title || "Offer",
        assignmentId: assignment.assignmentId,
        claimedAt: assignment.claimedAt,
        read: false,
        createdAt,
        link: viewClaimUrl.toString()
    };

    try {
        await commitFirestoreWrites([{
            update: {
                name: firestoreDocumentName(`adminNotifications/${notificationId}`, env),
                fields: offerFields(notification)
            },
            currentDocument: { exists: false }
        }], env);
    } catch (error) {
        console.error("Offer claim notification write failed.", { message: error?.message });
    }

    if (!env.ADMIN_NOTIFICATION_EMAIL || !env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.BREVO_SENDER_NAME) {
        console.warn("Offer claim admin email was not sent because notification email configuration is incomplete.");
        return;
    }

    const safe = value => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
    try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": env.BREVO_API_KEY,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
                to: [{ email: env.ADMIN_NOTIFICATION_EMAIL }],
                subject: `New Offer Claim: ${offer.title || "Offer"}`,
                htmlContent: `<!doctype html><html><body style="margin:0;background:#f5f8fc;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:620px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden"><div style="padding:24px;background:#0d6efd;color:#fff"><h2 style="margin:0;font-size:22px">New Offer Claim</h2></div><div style="padding:26px"><p>A customer has submitted an offer claim.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#6b7280">Customer</td><td style="padding:8px 0"><strong>${safe(customer.name)}</strong></td></tr><tr><td style="padding:8px 0;color:#6b7280">Customer ID</td><td style="padding:8px 0">${safe(assignment.customerId)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Offer</td><td style="padding:8px 0">${safe(offer.title)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Claimed</td><td style="padding:8px 0">${safe(assignment.claimedAt)}</td></tr><tr><td style="padding:8px 0;color:#6b7280">Status</td><td style="padding:8px 0">CLAIMED</td></tr></table><p style="margin:24px 0 0"><a href="${safe(viewClaimUrl.toString())}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0d6efd;color:#fff;text-decoration:none">View Claim</a></p></div></div></body></html>`
            })
        });

        if (!response.ok) {
            console.error("Offer claim admin email failed.", { status: response.status });
        }
    } catch (error) {
        console.error("Offer claim admin email transport failed.", { message: error?.message });
    }
}

function offerAssignmentResponse(record, offer = null) {
    const { id, data } = record;
    return {
        assignmentId: data.assignmentId || id,
        ...data,
        ...(offer ? { offer: offerResponse(offer) } : {})
    };
}

function normalizeOfferInput(input, existing = {}) {
    const title = String(input.title ?? existing.title ?? "").trim();
    const startDate = offerDate(input.startDate ?? existing.startDate, "startDate", true);
    const expiryDate = offerDate(input.expiryDate ?? existing.expiryDate, "expiryDate", true);
    const offerType = String(input.offerType ?? existing.offerType ?? "CUSTOM").trim();
    const discountType = String(input.discountType ?? existing.discountType ?? "NONE").trim();
    const status = String(input.status ?? existing.status ?? "DRAFT").trim();

    if (!title) throw offerError("title is required.");
    if (!OFFER_TYPES.has(offerType)) throw offerError("offerType is invalid.");
    if (!OFFER_DISCOUNT_TYPES.has(discountType)) throw offerError("discountType is invalid.");
    if (!OFFER_STATUSES.has(status)) throw offerError("status is invalid.");
    if (Date.parse(startDate) > Date.parse(expiryDate)) throw offerError("expiryDate must be after startDate.");

    const numeric = (value, field) => {
        if (value === undefined || value === null || value === "") return 0;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) throw offerError(`${field} must be a non-negative number.`);
        return number;
    };

    return {
        title,
        shortTitle: String(input.shortTitle ?? existing.shortTitle ?? title).trim(),
        description: String(input.description ?? existing.description ?? "").trim(),
        productOrService: String(input.productOrService ?? existing.productOrService ?? "").trim(),
        offerType,
        discountType,
        discountValue: numeric(input.discountValue ?? existing.discountValue, "discountValue"),
        originalPrice: numeric(input.originalPrice ?? existing.originalPrice, "originalPrice"),
        offerPrice: numeric(input.offerPrice ?? existing.offerPrice, "offerPrice"),
        termsAndConditions: String(input.termsAndConditions ?? existing.termsAndConditions ?? "").trim(),
        startDate,
        expiryDate,
        status,
        featured: Boolean(input.featured ?? existing.featured ?? false)
    };
}

async function handleAdminOffers(body, admin, env, origin) {
    const action = String(body.action || "list");

    if (action === "list") {
        const offers = await listFirestoreRecords("offers", env);
        const assignments = await listFirestoreRecords("offerAssignments", env);
        const countsByOffer = new Map();

        assignments.forEach(({ data }) => {
            const counts = countsByOffer.get(data.offerId) || {
                assignedCustomerCount: 0,
                viewedCount: 0,
                claimedCount: 0,
                approvedCount: 0,
                redeemedCount: 0,
                expiredCount: 0
            };

            if (data.status !== "CANCELLED") counts.assignedCustomerCount += 1;
            if (data.viewedAt) counts.viewedCount += 1;
            if (["CLAIMED", "APPROVED", "REDEEMED"].includes(data.status)) counts.claimedCount += 1;
            if (["APPROVED", "REDEEMED"].includes(data.status)) counts.approvedCount += 1;
            if (data.status === "REDEEMED") counts.redeemedCount += 1;
            if (data.status === "EXPIRED") counts.expiredCount += 1;
            countsByOffer.set(data.offerId, counts);
        });

        return json({
            success: true,
            offers: offers.map(record => ({
                ...offerResponse(record),
                ...(countsByOffer.get(record.data.offerId) || {
                    assignedCustomerCount: 0,
                    viewedCount: 0,
                    claimedCount: 0,
                    approvedCount: 0,
                    redeemedCount: 0,
                    expiredCount: 0
                })
            }))
        }, 200, origin);
    }

    if (action === "load") {
        const offerId = offerIdentifier(body.offerId, "offerId");
        const offer = offerRecord(await getFirestoreRestDocument(`offers/${offerId}`, env));
        if (!offer) return json({ success: false, error: "Offer not found." }, 404, origin);
        return json({ success: true, offer: offerResponse(offer) }, 200, origin);
    }

    if (action === "create") {
        const offerId = offerRandomId("OFR");
        const offer = normalizeOfferInput(body);
        const createdAt = new Date().toISOString();
        const offerData = {
            offerId,
            ...offer,
            createdAt,
            updatedAt: createdAt,
            createdBy: admin.uid,
            updatedBy: admin.uid
        };

        await commitFirestoreWrites([{
            update: {
                name: firestoreDocumentName(`offers/${offerId}`, env),
                fields: offerFields(offerData)
            },
            currentDocument: { exists: false }
        }], env);
        await writeOfferAuditLog("offer_created", admin.uid, "", { offerId }, env);
        return json({ success: true, offer: offerData }, 201, origin);
    }

    if (action === "update") {
        const offerId = offerIdentifier(body.offerId, "offerId");
        const existing = offerRecord(await getFirestoreRestDocument(`offers/${offerId}`, env));
        if (!existing) return json({ success: false, error: "Offer not found." }, 404, origin);
        const offer = normalizeOfferInput(body, existing.data);
        const updatedAt = new Date().toISOString();
        const fields = {
            ...offer,
            updatedAt,
            updatedBy: admin.uid
        };

        await commitFirestoreWrites([{
            update: {
                name: firestoreDocumentName(`offers/${offerId}`, env),
                fields: offerFields(fields)
            },
            updateMask: { fieldPaths: Object.keys(fields) },
            currentDocument: { updateTime: existing.document?.updateTime }
        }], env);
        await writeOfferAuditLog("offer_updated", admin.uid, "", { offerId }, env);
        return json({ success: true, offer: { ...existing.data, ...fields } }, 200, origin);
    }

    return json({ success: false, error: "Unknown offer action." }, 400, origin);
}

async function handleAdminOfferNotifications(body, env, origin) {
    const action = String(body.action || "list");

    if (action === "list") {
        const notifications = await findFirestoreRecordsByField(
            "adminNotifications",
            "type",
            "OFFER_CLAIMED",
            env,
            100
        );
        const items = notifications
        .map(record => ({ notificationId: record.id, ...record.data }))
        .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
        return json({ success: true, notifications: items }, 200, origin);
    }

    if (action === "mark-read") {
        const notificationId = offerIdentifier(body.notificationId, "notificationId");
        const notification = offerRecord(await getFirestoreRestDocument(`adminNotifications/${notificationId}`, env));
        if (!notification) return json({ success: false, error: "Notification not found." }, 404, origin);
        if (notification.data.read === true) return json({ success: true }, 200, origin);

        const readAt = new Date().toISOString();
        await commitFirestoreWrites([{
            update: {
                name: firestoreDocumentName(`adminNotifications/${notificationId}`, env),
                fields: offerFields({ read: true, readAt })
            },
            updateMask: { fieldPaths: ["read", "readAt"] },
            currentDocument: { updateTime: notification.document?.updateTime }
        }], env);
        return json({ success: true }, 200, origin);
    }

    return json({ success: false, error: "Unknown notification action." }, 400, origin);
}

async function handleAdminOfferAssignments(body, admin, env, origin) {
    const action = String(body.action || "list");

    if (action === "list") {
        const records = body.offerId
            ? await findFirestoreRecordsByField("offerAssignments", "offerId", offerIdentifier(body.offerId, "offerId"), env)
            : body.customerId
                ? await findFirestoreRecordsByField("offerAssignments", "customerId", offerIdentifier(body.customerId, "customerId"), env)
                : await listFirestoreRecords("offerAssignments", env);

        const assignments = [];

        for (const record of records) {
            const offer = offerRecord(await getFirestoreRestDocument(`offers/${record.data.offerId}`, env));
            const customer = offerRecord(await getFirestoreRestDocument(`customers/${record.data.customerId}`, env));
            assignments.push({
                ...offerAssignmentResponse(record, offer),
                customer: customer ? safeCustomer(customer.data) : null
            });
        }

        return json({ success: true, assignments }, 200, origin);
    }

    if (action === "load") {
        const assignmentId = offerIdentifier(body.assignmentId, "assignmentId");
        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));
        if (!assignment) return json({ success: false, error: "Offer assignment not found." }, 404, origin);
        const offer = offerRecord(await getFirestoreRestDocument(`offers/${assignment.data.offerId}`, env));
        const customer = offerRecord(await getFirestoreRestDocument(`customers/${assignment.data.customerId}`, env));
        return json({
            success: true,
            assignment: {
                ...offerAssignmentResponse(assignment, offer),
                customer: customer ? safeCustomer(customer.data) : null
            }
        }, 200, origin);
    }

    if (action === "assign") {
        const offerId = offerIdentifier(body.offerId, "offerId");
        const customerId = offerIdentifier(body.customerId, "customerId");
        const offer = offerRecord(await getFirestoreRestDocument(`offers/${offerId}`, env));
        const customer = offerRecord(await getFirestoreRestDocument(`customers/${customerId}`, env));

        if (!offer) return json({ success: false, error: "Offer not found." }, 404, origin);
        if (!customer) return json({ success: false, error: "Customer not found." }, 404, origin);

        const assignmentId = offerRandomId("ASN");
        const assignedAt = new Date().toISOString();
        const assignment = {
            assignmentId,
            offerId,
            customerId,
            status: "ASSIGNED",
            assignedAt,
            assignedBy: admin.uid,
            updatedAt: assignedAt
        };
        const indexPath = `system/offerAssignments/index/${offerId}__${customerId}`;

        try {
            await commitFirestoreWrites([
                {
                    update: {
                        name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                        fields: offerFields(assignment)
                    },
                    currentDocument: { exists: false }
                },
                {
                    update: {
                        name: firestoreDocumentName(indexPath, env),
                        fields: offerFields({ assignmentId, offerId, customerId, createdAt: assignedAt })
                    },
                    currentDocument: { exists: false }
                }
            ], env);
        } catch (error) {
            if (error.status === 409) return json({ success: false, error: "This offer is already assigned to this customer." }, 409, origin);
            throw error;
        }

        await writeOfferAuditLog("offer_assigned", admin.uid, customerId, { offerId, assignmentId }, env);
        return json({ success: true, assignment }, 201, origin);
    }

    if (action === "approve") {
        const assignmentId = offerIdentifier(body.assignmentId, "assignmentId");

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));
            if (!assignment) return json({ success: false, error: "Offer assignment not found." }, 404, origin);
            if (assignment.data.status !== "CLAIMED") return json({ success: false, error: "Only a claimed offer can be approved." }, 409, origin);

            const offer = offerRecord(await getFirestoreRestDocument(`offers/${assignment.data.offerId}`, env));
            if (!offer || !offerIsActive(offer.data)) return json({ success: false, error: "This offer is no longer active." }, 409, origin);

            const offerCode = offerCodeValue();
            const approvedAt = new Date().toISOString();
            const code = {
                offerCode,
                assignmentId,
                offerId: assignment.data.offerId,
                customerId: assignment.data.customerId,
                status: "UNUSED",
                generatedAt: approvedAt,
                approvedAt,
                expiryDate: offer.data.expiryDate
            };
            const assignmentFields = {
                status: "APPROVED",
                approvedAt,
                offerCode,
                updatedAt: approvedAt
            };

            try {
                await commitFirestoreWrites([
                    {
                        update: {
                            name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                            fields: offerFields(assignmentFields)
                        },
                        updateMask: { fieldPaths: Object.keys(assignmentFields) },
                        currentDocument: { updateTime: assignment.document?.updateTime }
                    },
                    {
                        update: {
                            name: firestoreDocumentName(`offerCodes/${offerCode}`, env),
                            fields: offerFields(code)
                        },
                        currentDocument: { exists: false }
                    }
                ], env);
            } catch (error) {
                if (error.status === 409) continue;
                throw error;
            }

            await writeOfferAuditLog("offer_claim_approved", admin.uid, code.customerId, { offerId: code.offerId, assignmentId, offerCode }, env);
            return json({ success: true, offerCode: code }, 201, origin);
        }

        return json({ success: false, error: "Offer approval conflicted. Please retry." }, 409, origin);
    }

    if (action === "cancel") {
        const assignmentId = offerIdentifier(body.assignmentId, "assignmentId");
        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));

        if (!assignment) return json({ success: false, error: "Offer assignment not found." }, 404, origin);
        if (!["ASSIGNED", "VIEWED", "CLAIMED", "APPROVED"].includes(assignment.data.status)) {
            return json({ success: false, error: "This offer assignment cannot be cancelled." }, 409, origin);
        }

        const updatedAt = new Date().toISOString();
        const fields = {
            status: "CANCELLED",
            cancelledAt: updatedAt,
            cancelledBy: admin.uid,
            updatedAt
        };
        const indexPath = `system/offerAssignments/index/${assignment.data.offerId}__${assignment.data.customerId}`;
        const writes = [{
            update: {
                name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                fields: offerFields(fields)
            },
            updateMask: { fieldPaths: Object.keys(fields) },
            currentDocument: { updateTime: assignment.document?.updateTime }
        }];

        if (assignment.data.status === "APPROVED") {
            const offerCode = offerIdentifier(assignment.data.offerCode, "offerCode");
            const code = offerRecord(await getFirestoreRestDocument(`offerCodes/${offerCode}`, env));

            if (!code || code.data.status !== "UNUSED") {
                return json({ success: false, error: "This approved offer code cannot be cancelled." }, 409, origin);
            }

            const codeFields = {
                status: "CANCELLED",
                cancelledAt: updatedAt,
                cancelledBy: admin.uid
            };
            writes.push({
                update: {
                    name: firestoreDocumentName(`offerCodes/${offerCode}`, env),
                    fields: offerFields(codeFields)
                },
                updateMask: { fieldPaths: Object.keys(codeFields) },
                currentDocument: { updateTime: code.document?.updateTime }
            });
        }

        writes.push({ delete: firestoreDocumentName(indexPath, env) });
        await commitFirestoreWrites(writes, env);

        await writeOfferAuditLog("offer_assignment_cancelled", admin.uid, assignment.data.customerId, { offerId: assignment.data.offerId, assignmentId }, env);
        return json({ success: true, assignment: { ...assignment.data, ...fields } }, 200, origin);
    }

    if (action === "verify-code") {
        const offerCode = offerIdentifier(body.offerCode, "offerCode");
        const code = offerRecord(await getFirestoreRestDocument(`offerCodes/${offerCode}`, env));

        if (!code) return json({ success: false, error: "Invalid offer code." }, 404, origin);

        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${code.data.assignmentId}`, env));
        const offer = offerRecord(await getFirestoreRestDocument(`offers/${code.data.offerId}`, env));
        const customer = offerRecord(await getFirestoreRestDocument(`customers/${code.data.customerId}`, env));
        const codeStatus = offerCodeEffectiveStatus(code.data);

        return json({
            success: true,
            code: {
                ...code.data,
                status: codeStatus,
                customer: customer ? safeCustomer(customer.data) : null,
                offer: offer ? offerResponse(offer) : null,
                assignment: assignment ? offerAssignmentResponse(assignment, offer) : null
            }
        }, 200, origin);
    }

    if (action === "redeem") {
        const offerCode = offerIdentifier(body.offerCode, "offerCode");
        const code = offerRecord(await getFirestoreRestDocument(`offerCodes/${offerCode}`, env));
        if (!code) return json({ success: false, error: "Offer code not found." }, 404, origin);

        const codeStatus = offerCodeEffectiveStatus(code.data);
        if (codeStatus !== "UNUSED") {
            const errorMessage = codeStatus === "REDEEMED"
                ? "Offer already redeemed."
                : codeStatus === "EXPIRED"
                    ? "Offer code has expired."
                    : "This offer code is cancelled.";
            return json({ success: false, error: errorMessage, codeStatus }, 409, origin);
        }

        const assignmentId = offerIdentifier(code.data.assignmentId, "assignmentId");
        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));
        if (!assignment || assignment.data.status !== "APPROVED" || assignment.data.offerCode !== offerCode) {
            return json({ success: false, error: "Offer assignment is not eligible for redemption." }, 409, origin);
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const redeemedAt = new Date().toISOString();
            const redemptionId = offerRandomId("RDM");
            const reference = offerRedemptionReferenceValue();
            const codeFields = {
                status: "REDEEMED",
                redeemedAt,
                redeemedBy: admin.uid,
                redemptionReference: reference
            };
            const assignmentFields = {
                status: "REDEEMED",
                redeemedAt,
                redeemedBy: admin.uid,
                updatedAt: redeemedAt
            };
            const redemption = {
                redemptionId,
                offerCode,
                offerId: code.data.offerId,
                assignmentId,
                customerId: code.data.customerId,
                redeemedAt,
                redeemedBy: admin.uid,
                adminUserId: admin.uid,
                redemptionReference: reference,
                previousStatus: "UNUSED",
                newStatus: "REDEEMED"
            };

            try {
                await commitFirestoreWrites([
                {
                    update: {
                        name: firestoreDocumentName(`offerCodes/${offerCode}`, env),
                        fields: offerFields(codeFields)
                    },
                    updateMask: { fieldPaths: Object.keys(codeFields) },
                    currentDocument: { updateTime: code.document?.updateTime }
                },
                {
                    update: {
                        name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                        fields: offerFields(assignmentFields)
                    },
                    updateMask: { fieldPaths: Object.keys(assignmentFields) },
                    currentDocument: { updateTime: assignment.document?.updateTime }
                },
                {
                    update: {
                        name: firestoreDocumentName(`offerRedemptions/${redemptionId}`, env),
                        fields: offerFields(redemption)
                    },
                    currentDocument: { exists: false }
                },
                {
                    update: {
                        name: firestoreDocumentName(`system/offerRedemptionReferences/entries/${reference}`, env),
                        fields: offerFields({ redemptionId, offerCode, createdAt: redeemedAt })
                    },
                    currentDocument: { exists: false }
                }
                ], env);
            } catch (error) {
                if (error.status === 409) {
                    const latestCode = offerRecord(await getFirestoreRestDocument(`offerCodes/${offerCode}`, env));
                    if (latestCode && offerCodeEffectiveStatus(latestCode.data) !== "UNUSED") {
                        return json({ success: false, error: "Offer already redeemed or changed.", codeStatus: offerCodeEffectiveStatus(latestCode.data) }, 409, origin);
                    }
                    continue;
                }
                throw error;
            }

            await writeOfferAuditLog("offer_redeemed", admin.uid, redemption.customerId, { offerId: redemption.offerId, assignmentId, offerCode, redemptionId, redemptionReference: reference }, env);
            return json({ success: true, redemption }, 200, origin);
        }

        return json({ success: false, error: "Redemption conflicted. Please retry." }, 409, origin);
    }

    return json({ success: false, error: "Unknown offer assignment action." }, 400, origin);
}

async function handleCustomerOffers(body, session, env, origin) {
    const action = String(body.action || "list");
    const customerId = String(session.customer.customerId || "");

    if (!customerId) throw offerError("Customer account is incomplete.", 403);

    if (action === "list") {
        const assignments = await findFirestoreRecordsByField("offerAssignments", "customerId", customerId, env);
        const visibleOffers = [];

        for (const assignment of assignments) {
            if (!offerAssignmentIsVisible(assignment.data)) continue;

            const offer = offerRecord(await getFirestoreRestDocument(`offers/${assignment.data.offerId}`, env));
            const isHistoricalAssignment = ["APPROVED", "REDEEMED"].includes(assignment.data.status);
            if (!isHistoricalAssignment && !offerIsActive(offer?.data)) continue;

            visibleOffers.push(offerAssignmentResponse(assignment, offer));
        }

        return json({ success: true, offers: visibleOffers }, 200, origin);
    }

    if (action === "claim") {
        const assignmentId = offerIdentifier(body.assignmentId, "assignmentId");
        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));

        if (!assignment || assignment.data.customerId !== customerId) {
            return json({ success: false, error: "Offer assignment not found." }, 404, origin);
        }

        if (!["ASSIGNED", "VIEWED"].includes(assignment.data.status)) {
            return json({ success: false, error: "This offer cannot be claimed." }, 409, origin);
        }

        const offer = offerRecord(await getFirestoreRestDocument(`offers/${assignment.data.offerId}`, env));
        if (!offerIsActive(offer?.data)) return json({ success: false, error: "This offer is no longer active." }, 409, origin);

        const claimedAt = new Date().toISOString();
        const preferredContact = String(body.preferredContact || "").trim().toUpperCase();
        const additionalNote = String(body.additionalNote || "").trim();

        if (preferredContact && !["CALL", "WHATSAPP"].includes(preferredContact)) {
            return json({ success: false, error: "Preferred contact is invalid." }, 400, origin);
        }

        if (additionalNote.length > 1000) {
            return json({ success: false, error: "Additional note is too long." }, 400, origin);
        }

        const fields = {
            status: "CLAIMED",
            claimedAt,
            preferredContact,
            additionalNote,
            updatedAt: claimedAt
        };

        try {
            await commitFirestoreWrites([{
                update: {
                    name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                    fields: offerFields(fields)
                },
                updateMask: { fieldPaths: Object.keys(fields) },
                currentDocument: { updateTime: assignment.document?.updateTime }
            }], env);
        } catch (error) {
            if (error.status === 409) return json({ success: false, error: "This offer has already been claimed or updated." }, 409, origin);
            throw error;
        }

        const claimedAssignment = { ...assignment.data, ...fields };
        await writeOfferAuditLog(
            "offer_claimed",
            `customer:${customerId}`,
            customerId,
            { offerId: assignment.data.offerId, assignmentId },
            env
        );
        await createOfferClaimNotification(
            session.customer,
            claimedAssignment,
            offer.data,
            env
        );

        return json({ success: true, assignment: claimedAssignment }, 200, origin);
    }

    if (action === "view") {
        const assignmentId = offerIdentifier(body.assignmentId, "assignmentId");
        const assignment = offerRecord(await getFirestoreRestDocument(`offerAssignments/${assignmentId}`, env));

        if (!assignment || assignment.data.customerId !== customerId) {
            return json({ success: false, error: "Offer assignment not found." }, 404, origin);
        }

        if (!offerAssignmentIsVisible(assignment.data)) {
            return json({ success: false, error: "This offer is not available." }, 409, origin);
        }

        const offer = offerRecord(await getFirestoreRestDocument(`offers/${assignment.data.offerId}`, env));
        if (!offerIsActive(offer?.data)) return json({ success: false, error: "This offer is no longer active." }, 409, origin);

        if (assignment.data.viewedAt) return json({ success: true, assignment: assignment.data }, 200, origin);

        const viewedAt = new Date().toISOString();
        const fields = {
            status: assignment.data.status === "ASSIGNED" ? "VIEWED" : assignment.data.status,
            viewedAt,
            updatedAt: viewedAt
        };

        try {
            await commitFirestoreWrites([{
                update: {
                    name: firestoreDocumentName(`offerAssignments/${assignmentId}`, env),
                    fields: offerFields(fields)
                },
                updateMask: { fieldPaths: Object.keys(fields) },
                currentDocument: { updateTime: assignment.document?.updateTime }
            }], env);
        } catch (error) {
            if (error.status === 409) return json({ success: true, assignment: assignment.data }, 200, origin);
            throw error;
        }

        return json({ success: true, assignment: { ...assignment.data, ...fields } }, 200, origin);
    }

    return json({ success: false, error: "Unknown customer offer action." }, 400, origin);
}

async function createCustomerWithFirestoreRest({ name, mobile, email, address, passwordHash, adminUid }, env, setDiagnosticStep) {
    const year = new Date().getFullYear();
    const counterPath = `system/customerCounters/years/${year}`;
    const usernamePath = `system/customerUsernames/entries/${mobile}`;
    const createdAt = firestoreTimestampValue();

    for (let attempt = 0; attempt < 5; attempt += 1) {
        setDiagnosticStep("customer_counter_read");
        const counter = await getFirestoreRestDocument(counterPath, env);
        let nextNumber = Number(counter?.fields?.nextNumber?.integerValue || 1);
        let customerId = "";
        let customerPath = "";

        while (!customerId) {
            const candidateId = `CF${year}-${String(nextNumber).padStart(3, "0")}`;
            const candidatePath = `customers/${candidateId}`;

            setDiagnosticStep("customer_id_availability_check");
            const existingCustomer = await getFirestoreRestDocument(candidatePath, env);

            if (!existingCustomer) {

                customerId = candidateId;
                customerPath = candidatePath;

            } else {

                nextNumber += 1;

            }
        }

        const customerData = {
            customerId,
            name: name.trim(),
            mobile,
            username: mobile,
            email: String(email).trim(),
            address: String(address).trim(),
            jobs: 0,
            joinDate: new Date().toLocaleDateString("en-GB"),
            passwordHash,
            sessionVersion: 0,
            emailVerified: false,
            createdAt: new Date(),
            createdBy: adminUid,
            passwordUpdatedAt: new Date()
        };
        const customerFields = {
            customerId: { stringValue: customerData.customerId },
            name: { stringValue: customerData.name },
            mobile: { stringValue: customerData.mobile },
            username: { stringValue: customerData.username },
            email: { stringValue: customerData.email },
            address: { stringValue: customerData.address },
            jobs: { integerValue: "0" },
            joinDate: { stringValue: customerData.joinDate },
            passwordHash: { stringValue: customerData.passwordHash },
            sessionVersion: { integerValue: "0" },
            emailVerified: { booleanValue: false },
            createdAt,
            createdBy: { stringValue: customerData.createdBy },
            passwordUpdatedAt: createdAt
        };
        const counterWrite = {
            update: {
                name: firestoreDocumentName(counterPath, env),
                fields: {
                    nextNumber: { integerValue: String(nextNumber + 1) },
                    updatedAt: createdAt
                }
            },
            currentDocument: counter
                ? { updateTime: counter.updateTime }
                : { exists: false }
        };

        try {
            setDiagnosticStep("firestore_transaction_commit");
            await commitFirestoreWrites([
                {
                    diagnosticLabel: "customer_document_create",
                    update: {
                        name: firestoreDocumentName(customerPath, env),
                        fields: customerFields
                    },
                    currentDocument: { exists: false }
                },
                {
                    diagnosticLabel: "username_reservation_create",
                    update: {
                        name: firestoreDocumentName(usernamePath, env),
                        fields: {
                            customerId: { stringValue: customerId },
                            createdAt
                        }
                    },
                    currentDocument: { exists: false }
                },
                {
                    diagnosticLabel: "customer_counter_update",
                    ...counterWrite
                }
            ], env);

            return { customerData, customerPath };

        } catch (error) {

            if (error.status === 409 && attempt < 4) {

                console.warn("Firestore REST commit conflict; retrying customer counter transaction.", {
                    attempt: attempt + 1,
                    firestoreError: error.firestoreError || null
                });
                continue;

            }
            throw error;

        }
    }

    throw new Error("Customer creation could not be completed due to concurrent updates.");
}

async function signJwt(payload, secret) {
    const encode = new TextEncoder();
    const header = base64Url(encode.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const content = base64Url(encode.encode(JSON.stringify(payload)));
    const key = await crypto.subtle.importKey("raw", encode.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encode.encode(`${header}.${content}`));
    return `${header}.${content}.${base64Url(signature)}`;
}

function sessionError(message) {
    const error = new Error(message);
    error.status = 401;
    error.code = "SESSION_INVALID";
    return error;
}

async function verifyJwt(token, secret) {
    if (!token || typeof token !== "string") throw sessionError("Session is required.");

    const parts = token.split(".");
    if (parts.length !== 3) throw sessionError("Invalid session.");

    const encode = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encode.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    let signature;
    let payload;

    try {
        signature = decodeBase64(parts[2]);
        payload = JSON.parse(new TextDecoder().decode(decodeBase64(parts[1])));
    } catch {
        throw sessionError("Invalid session.");
    }

    const valid = await crypto.subtle.verify("HMAC", key, signature, encode.encode(`${parts[0]}.${parts[1]}`));
    if (!valid) throw sessionError("Invalid session.");
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw sessionError("Session expired.");
    return payload;
}

async function passwordMatches(password, passwordHash) {
    const [algorithm, iterationText, saltText, hashText] = String(passwordHash || "").split("$");
    if (algorithm !== "pbkdf2_sha256") return false;
    const iterations = Number(iterationText);
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 500000) return false;
    const bits = await derivePbkdf2Sha256(
        new TextEncoder().encode(password),
        decodeBase64(saltText),
        iterations
    );
    const expected = decodeBase64(hashText);
    const actual = new Uint8Array(bits);
    if (expected.length !== actual.length) return false;
    let different = 0;
    expected.forEach((byte, index) => { different |= byte ^ actual[index]; });
    return different === 0;
}

function joinBytes(...parts) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach(part => { output.set(part, offset); offset += part.length; });
    return output;
}

function rotateRight(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
}

function sha256(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const totalLength = Math.ceil((source.length + 9) / 64) * 64;
    const padded = new Uint8Array(totalLength);
    padded.set(source);
    padded[source.length] = 0x80;
    const bitLength = source.length * 8;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(totalLength - 4, bitLength >>> 0);

    const hash = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    const constants = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    const schedule = new Uint32Array(64);

    for (let offset = 0; offset < totalLength; offset += 64) {
        for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(offset + (index * 4));
        for (let index = 16; index < 64; index += 1) {
            const s0 = rotateRight(schedule[index - 15], 7) ^ rotateRight(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
            const s1 = rotateRight(schedule[index - 2], 17) ^ rotateRight(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
            schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let index = 0; index < 64; index += 1) {
            const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const choose = (e & f) ^ (~e & g);
            const nextH = (h + s1 + choose + constants[index] + schedule[index]) >>> 0;
            const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            h = g; g = f; f = e; e = (d + nextH) >>> 0; d = c; c = b; b = a; a = (nextH + s0 + majority) >>> 0;
        }
        hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
    }

    const output = new Uint8Array(32);
    const outputView = new DataView(output.buffer);
    hash.forEach((value, index) => outputView.setUint32(index * 4, value));
    return output;
}

function hmacSha256(key, message) {
    let normalizedKey = key;
    if (normalizedKey.length > 64) normalizedKey = sha256(normalizedKey);
    const block = new Uint8Array(64);
    block.set(normalizedKey);
    const innerPad = new Uint8Array(64);
    const outerPad = new Uint8Array(64);
    for (let index = 0; index < 64; index += 1) {
        innerPad[index] = block[index] ^ 0x36;
        outerPad[index] = block[index] ^ 0x5c;
    }
    return sha256(joinBytes(outerPad, sha256(joinBytes(innerPad, message))));
}

function derivePbkdf2Sha256Fallback(passwordBytes, salt, iterations) {
    const counter = new Uint8Array([0, 0, 0, 1]);
    let current = hmacSha256(passwordBytes, joinBytes(salt, counter));
    const derived = new Uint8Array(current);
    for (let iteration = 1; iteration < iterations; iteration += 1) {
        current = hmacSha256(passwordBytes, current);
        for (let index = 0; index < derived.length; index += 1) derived[index] ^= current[index];
    }
    return derived;
}

async function derivePbkdf2Sha256(passwordBytes, salt, iterations) {
    if (iterations > WEB_CRYPTO_PBKDF2_MAX_ITERATIONS) {

        return derivePbkdf2Sha256Fallback(passwordBytes, salt, iterations);

    }

    const key = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        key,
        256
    ));
}

async function createPasswordHash(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bits = await derivePbkdf2Sha256(
        new TextEncoder().encode(password),
        salt,
        PBKDF2_ITERATIONS
    );
    const normalBase64 = bytes => btoa(String.fromCharCode(...bytes));
    return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${normalBase64(salt)}$${normalBase64(bits)}`;
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

async function sendVerificationEmail(customerPath, customer, env) {
    if (!customer.email) throw new Error("Customer email address is missing.");
    const token = randomToken();
    const expiresAt = Date.now() + (VERIFICATION_TOKEN_SECONDS * 1000);
    const verificationFields = {
        emailVerified: false,
        emailVerificationTokenHash: await hashToken(token),
        emailVerificationExpiresAt: expiresAt
    };

    await updateCustomerDocumentWithFirestoreRest(
        "resend-verification-email",
        customerPath,
        {
            emailVerified: { booleanValue: false },
            emailVerificationTokenHash: { stringValue: verificationFields.emailVerificationTokenHash },
            emailVerificationExpiresAt: { integerValue: String(verificationFields.emailVerificationExpiresAt) }
        },
        env
    );
    const verificationUrl = `${new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html").origin}${new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html").pathname}`;
    const workerUrl = new URL(env.WORKER_PUBLIC_URL || "https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev");
    const verifyLink = `${workerUrl.origin}/verify-email?customerId=${encodeURIComponent(customer.customerId)}&token=${encodeURIComponent(token)}`;
    const resolved = await resolveEmailTemplate("verification", { customer_name: customer.name, verification_link: verifyLink, company_name: env.APP_NAME || "Click & Fix Technologies", current_year: new Date().getFullYear(), customerName: customer.name, verificationUrl: verifyLink, companyName: env.APP_NAME || "Click & Fix Technologies", loginUrl: verificationUrl }, env);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ name: customer.name, email: customer.email }], subject: resolved.subject, htmlContent: resolved.html }) });
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

async function sendWelcomeEmail(customer, temporaryPassword, emailConfig, env) {

    const config = getWelcomeEmailConfig(emailConfig || {});

    config.companyName = env.APP_NAME || config.companyName;
    config.companyWebsite = env.COMPANY_WEBSITE || config.companyWebsite;

    const values = { customer_name: customer.name, customer_id: customer.customerId, username: customer.username, temporary_password: temporaryPassword, company_name: config.companyName, company_website: config.companyWebsite, login_url: env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html", current_year: new Date().getFullYear(), customerName: customer.name, customerId: customer.customerId, temporaryPassword, companyName: config.companyName, companyWebsite: config.companyWebsite, loginUrl: env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html" };
    const resolved = await resolveEmailTemplate("welcome", values, env);
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
                subject: resolved.subject,
                htmlContent: resolved.html
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

    if (!claims?.sub || !Number.isFinite(Number(claims.sv ?? 0))) {
        throw sessionError("Invalid session.");
    }

    const customerPath = `customers/${claims.sub}`;
    console.info("Firestore REST document read.", {
        purpose: "session_validation",
        path: customerPath
    });
    const document = await getFirestoreRestDocument(customerPath, env);
    const customerRecord = document
        ? firestoreRestDocumentToCustomer(document)
        : null;
    const jwtSessionVersion = Number(claims.sv ?? 0);
    const firestoreSessionVersion = Number(customerRecord?.data?.sessionVersion ?? 0);

    console.info("Customer session validation diagnostic", {
        customerDocumentId: claims.sub,
        jwtSessionVersion,
        firestoreSessionVersion,
        jwtExpiresAt: Number(claims.exp || 0),
        currentTimestamp: Math.floor(Date.now() / 1000),
        customerRecordFound: Boolean(customerRecord)
    });

    if (!customerRecord || firestoreSessionVersion !== jwtSessionVersion) {
        throw sessionError("Session expired.");
    }

    return {
        claims,
        customerPath,
        customer: customerRecord.data
    };
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
        const customerRecord = await findCustomerByField("customerId", customerId, env);
        if (!customerRecord) return Response.redirect(`${loginUrl}?verified=invalid`, 302);
        const customer = customerRecord.data;
        if (customer.emailVerified || !customer.emailVerificationExpiresAt || customer.emailVerificationExpiresAt < Date.now() || customer.emailVerificationTokenHash !== await hashToken(token)) return Response.redirect(`${loginUrl}?verified=invalid`, 302);
        await updateCustomerDocumentWithFirestoreRest("verify-email", `customers/${customerRecord.id}`, { emailVerified: { booleanValue: true } }, env, { deletedFields: ["emailVerificationTokenHash", "emailVerificationExpiresAt"] });
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

        const templateRegistry = path === "/admin/email-templates"
            ? emailTemplateRegistry
            : path === "/admin/job-status-templates"
                ? jobStatusTemplateRegistry
                : null;

        if (templateRegistry) {
            const admin = await requireAdmin(request, env);
            const action = String(body.action || "list");
            const template = templateRegistry.find(item => item.key === body.templateKey);

            if (action === "list") {
                const templates = await Promise.all(templateRegistry.map(async item => {
                    const override = await getFirestoreRestDocument(`system/emailTemplates/templates/${item.key}`, env);
                    return { key: item.key, name: item.name, subject: override?.fields?.subject?.stringValue || item.defaultSubject, hasOverride: Boolean(override), deliveryWorker: item.deliveryWorker || "auth" };
                }));
                return json({ success: true, templates }, 200, origin);
            }

            if (!template) return json({ success: false, error: "Unknown email template." }, 404, origin);
            const documentPath = `system/emailTemplates/templates/${template.key}`;

            if (action === "load") {
                const override = await getFirestoreRestDocument(documentPath, env);
                const readField = (field, fallback) => override?.fields?.[field]?.stringValue ?? fallback;
                const previewValues = {
                    customer_name: template.deliveryWorker === "job" ? "John Smith" : "Test Customer",
                    customer_id: "TEST-001",
                    username: "9999999999",
                    temporary_password: "TestPassword@1",
                    verification_link: "https://clickandfix.site/verify-email",
                    reset_link: "https://clickandfix.site/reset-password",
                    company_name: env.APP_NAME || "Click & Fix Technologies",
                    company_website: env.COMPANY_WEBSITE || "https://clickandfix.site",
                    login_url: env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html",
                    current_year: new Date().getFullYear(),
                    job_id: "JOB-1008",
                    device_name: "iPhone 13",
                    device_brand: "Apple",
                    device_model: "A2633",
                    current_status: "Repair in Progress",
                    estimated_time: "2–3 Hours",
                    delivery_date: "12 August 2026",
                    delivery_time: "5:30 PM",
                    portal_url: env.CUSTOMER_PORTAL_URL || "https://clickandfix.site/customer",
                    customerName: template.deliveryWorker === "job" ? "John Smith" : "Test Customer",
                    customerId: "TEST-001",
                    temporaryPassword: "TestPassword@1",
                    verificationUrl: "https://clickandfix.site/verify-email",
                    resetUrl: "https://clickandfix.site/reset-password",
                    companyName: env.APP_NAME || "Click & Fix Technologies",
                    companyWebsite: env.COMPANY_WEBSITE || "https://clickandfix.site",
                    loginUrl: env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html"
                };
                const resolved = await resolveTemplateDefinition(template, previewValues, env);
                return json({ success: true, template: { key: template.key, name: template.name, deliveryWorker: template.deliveryWorker || "auth", subject: readField("subject", template.defaultSubject), headerTitle: readField("headerTitle", template.defaults.headerTitle), greeting: readField("greeting", template.defaults.greeting), body: readField("body", template.defaults.body), buttonText: readField("buttonText", template.defaults.buttonText), closing: readField("closing", template.defaults.closing), footer: readField("footer", template.defaults.footer), html: resolved.html, hasOverride: Boolean(override) } }, 200, origin);
            }

            if (action === "save") {
                if (!String(body.subject || "").trim() || !String(body.body || "").trim()) return json({ success: false, error: "Subject and body are required." }, 400, origin);
                await patchFirestoreRestDocument(documentPath, { subject: { stringValue: String(body.subject) }, headerTitle: { stringValue: String(body.headerTitle || "") }, greeting: { stringValue: String(body.greeting || "") }, body: { stringValue: String(body.body) }, buttonText: { stringValue: String(body.buttonText || "") }, closing: { stringValue: String(body.closing || "") }, footer: { stringValue: String(body.footer || "") }, updatedBy: { stringValue: admin.uid }, updatedAt: firestoreTimestampValue(), version: { integerValue: String(Number(body.version || 0) + 1) } }, env);
                return json({ success: true, message: "Email template saved successfully." }, 200, origin);
            }

            if (action === "reset") {
                const accessToken = await getFirestoreRestAccessToken(env);
                const response = await fetch(`https://firestore.googleapis.com/v1/${firestoreDocumentName(documentPath, env)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
                if (!response.ok && response.status !== 404) throw new Error(`Email template reset failed (${response.status}).`);
                return json({ success: true, message: "Built-in email template restored." }, 200, origin);
            }

            if (action === "send-test") {
                if (!body.email) return json({ success: false, error: "Test email address is required." }, 400, origin);
                if (template.deliveryWorker === "job") return json({ success: false, error: "Job template test emails are sent through the Job Email Worker." }, 400, origin);
                const resolved = await resolveEmailTemplate(template.key, { customer_name: "John Doe", customer_id: "TEST-001", username: "9999999999", temporary_password: "TestPassword@1", verification_link: "https://clickandfix.site", reset_link: "https://clickandfix.site", company_name: env.APP_NAME || "Click & Fix Technologies", current_year: new Date().getFullYear(), job_id: "JOB-1001", device_name: "iPhone 13", device_brand: "Apple", device_model: "A2633", current_status: "Diagnosis", estimated_time: "2–3 Hours", delivery_date: "15 Aug 2026", delivery_time: "4:30 PM", portal_url: env.CUSTOMER_PORTAL_URL || "https://clickandfix.site/admin/customer-dashboard.html" }, env);
                const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ email: String(body.email) }], subject: resolved.subject, htmlContent: resolved.html }) });
                if (!response.ok) throw new Error("Test email delivery failed.");
                return json({ success: true, message: "Test email sent successfully." }, 200, origin);
            }
        }

        if (path === "/admin/offers") {
            const admin = await requireAdmin(request, env);
            return handleAdminOffers(body, admin, env, origin);
        }

        if (path === "/admin/offer-assignments") {
            const admin = await requireAdmin(request, env);
            return handleAdminOfferAssignments(body, admin, env, origin);
        }

        if (path === "/admin/offer-notifications") {
            await requireAdmin(request, env);
            return handleAdminOfferNotifications(body, env, origin);
        }

        const adminPasswordMatch = path.match(
            /^\/admin\/customers\/([^/]+)\/password$/
        );

        const adminJobCancelMatch = path.match(
            /^\/admin\/jobs\/([^/]+)\/cancel$/
        );

        const adminCustomerDeleteMatch = path.match(/^\/admin\/customers\/([^/]+)$/);

        if (adminJobCancelMatch) {
            const admin = await requireAdmin(request, env);
            const jobId = decodeURIComponent(adminJobCancelMatch[1]);
            const jobPath = `jobs/${jobId}`;
            const jobDocument = await getFirestoreRestDocument(jobPath, env);

            if (!jobDocument) {
                return json({ success: false, error: "Job not found." }, 404, origin);
            }

            const job = firestoreRestDocumentToCustomer(jobDocument).data;

            if (job.status === "Cancelled") {
                return json({ success: false, error: "This job is already cancelled." }, 409, origin);
            }

if (job.status === "Delivered") {
    return json({ success: false, error: "Delivered jobs cannot be cancelled." }, 409, origin);
}

            const cancelledAt = new Date().toISOString();
            const timeline = Array.isArray(job.timeline) ? [...job.timeline] : [];
            const lastTimelineItem = timeline.at(-1);

            if (!lastTimelineItem || lastTimelineItem.status !== "Cancelled") {
                timeline.push({
                    status: "Cancelled",
                    date: new Date().toLocaleString("en-GB")
                });
            }

            const timelineValue = {
                arrayValue: {
                    values: timeline.map(item => ({
                        mapValue: {
                            fields: {
                                status: { stringValue: String(item.status || "") },
                                date: { stringValue: String(item.date || "") }
                            }
                        }
                    }))
                }
            };

            await commitFirestoreWrites([{
                update: {
                    name: firestoreDocumentName(jobPath, env),
                    fields: {
                        status: { stringValue: "Cancelled" },
                        cancelledAt: { timestampValue: cancelledAt },
                        timeline: timelineValue
                    }
                },
                updateMask: {
                    fieldPaths: ["status", "cancelledAt", "timeline"]
                },
                currentDocument: {
                    updateTime: jobDocument.updateTime
                }
            }], env);

            try {
                await writeFirestoreRestAuditLog(
                    "job_cancelled",
                    admin.uid,
                    String(job.customerId || ""),
                    { jobId },
                    env
                );
            } catch (auditError) {
                console.error("Job cancellation audit log failed.", auditError);
            }

            return json({
                success: true,
                message: "Job cancelled successfully.",
                job: {
                    jobId,
                    status: "Cancelled",
                    cancelledAt,
                    timeline
                }
            }, 200, origin);
        }

        if (adminCustomerDeleteMatch) {
            const admin = await requireAdmin(request, env);
            const customerId = decodeURIComponent(adminCustomerDeleteMatch[1]);
            const customerPath = `customers/${customerId}`;
            const customerDocument = await getFirestoreRestDocument(customerPath, env);

            if (!customerDocument) {
                return json({ success: false, error: "Customer not found." }, 404, origin);
            }

            const customer = firestoreRestDocumentToCustomer(customerDocument).data;
            const writes = [{ delete: firestoreDocumentName(customerPath, env) }];
            const normalizedMobile = String(customer.mobile || "").trim();
            const reservationPath = `system/customerUsernames/entries/${normalizedMobile}`;
            if (customer.mobile) {
                writes.push({
                    delete: firestoreDocumentName(
                        reservationPath,
                        env
                    )
                });
            }
            await commitFirestoreWrites(writes, env);
            await writeFirestoreRestAuditLog("customer_deleted", admin.uid, customerId, {}, env);
            return json({ success: true, message: "Customer deleted successfully." }, 200, origin);
        }

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

            const customerDocument = await getFirestoreRestDocument(`customers/${customerId}`, env);

            if (!customerDocument) {

                return json({
                    success: false,
                    error: "Customer not found."
                }, 404, origin);

            }

            await updateCustomerDocumentWithFirestoreRest("admin-customer-password", `customers/${customerId}`, { passwordHash: { stringValue: await createPasswordHash(newPassword) }, passwordUpdatedAt: firestoreTimestampValue() }, env, { incrementSessionVersion: true });

            await writeFirestoreRestAuditLog(
                "customer_password_reset",
                admin.uid,
                customerId,
                {},
                env
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
            let duplicateExists = await usernameReservationExists(normalizedMobile, env);
            if (duplicateExists) {
                const reservationPath = `system/customerUsernames/entries/${normalizedMobile}`;
                const reservationDocument = await getFirestoreRestDocument(reservationPath, env);
                const reservation = reservationDocument
                    ? firestoreRestDocumentToCustomer(reservationDocument).data
                    : null;
                const reservedCustomerId = String(reservation?.customerId || "");
                const reservedCustomer = reservedCustomerId
                    ? await getFirestoreRestDocument(`customers/${reservedCustomerId}`, env)
                    : null;

                if (!reservedCustomer) {
                    await commitFirestoreWrites([{
                        delete: firestoreDocumentName(reservationPath, env)
                    }], env);
                    console.info("Removed orphan username reservation", {
                        reservationPath,
                        customerId: reservedCustomerId || null
                    });
                    duplicateExists = false;
                }
            }

            if (duplicateExists) {

                return json({
                    success: false,
                    error: "A customer with this mobile number already exists."
                }, 409, origin);

            }

            diagnosticStep = "temporary_password_generation";
            const temporaryPassword = generateTemporaryPassword();
            diagnosticStep = "pbkdf2_hash_generation";
            const passwordHash = await createPasswordHash(temporaryPassword);
            const customer = await createCustomerWithFirestoreRest({
                name,
                mobile: normalizedMobile,
                email,
                address,
                passwordHash,
                adminUid: admin.uid
            }, env, step => { diagnosticStep = step; });

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
                    customer.customerPath,
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
            await writeFirestoreRestAuditLog(
                "customer_created",
                admin.uid,
                customer.customerData.customerId,
                { welcomeEmailSent, verificationEmailSent },
                env
            );

            diagnosticStep = "audit_log_welcome_email";
            await writeFirestoreRestAuditLog(
                welcomeEmailSent
                    ? "welcome_email_sent"
                    : "email_delivery_failed",
                admin.uid,
                customer.customerData.customerId,
                { emailType: "welcome" },
                env
            );

            diagnosticStep = "audit_log_verification_email";
            await writeFirestoreRestAuditLog(
                verificationEmailSent
                    ? "verification_email_sent"
                    : "email_delivery_failed",
                admin.uid,
                customer.customerData.customerId,
                { emailType: "verification" },
                env
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
            const customerRecord = await findCustomerByField("email", String(body.email).trim(), env);
            if (customerRecord && env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.BREVO_SENDER_NAME) {
                const customer = customerRecord.data, token = randomToken();
                await updateCustomerDocumentWithFirestoreRest("forgot-password", `customers/${customerRecord.id}`, { passwordResetTokenHash: { stringValue: await hashToken(token) }, passwordResetExpiresAt: { integerValue: String(Date.now() + (RESET_TOKEN_SECONDS * 1000)) } }, env);
                const base = new URL(env.LOGIN_URL || "https://clickandfix.site/admin/customer-login.html");
                const resetUrl = `${base.origin}/admin/reset-password.html?customerId=${encodeURIComponent(customer.customerId)}&token=${encodeURIComponent(token)}`;
                const resolved = await resolveEmailTemplate("passwordReset", { customer_name: customer.name, reset_link: resetUrl, company_name: env.APP_NAME || "Click & Fix Technologies", current_year: new Date().getFullYear(), customerName: customer.name, resetUrl, companyName: env.APP_NAME || "Click & Fix Technologies" }, env);
                await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL }, to: [{ name: customer.name, email: customer.email }], subject: resolved.subject, htmlContent: resolved.html }) });
            }
            return json({ success: true, message: "If an account exists, a reset link has been sent." }, 200, origin);
        }
        if (path === "/reset-password") {
            if (!body.customerId || !body.token || !body.newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(body.newPassword)) return json({ success: false, error: "Invalid reset request or password." }, 400, origin);
            const customerRecord = await findCustomerByField("customerId", String(body.customerId), env);
            if (!customerRecord) return json({ success: false, error: "This reset link is invalid or expired." }, 400, origin);
            const customer = customerRecord.data;
            if (!customer.passwordResetExpiresAt || customer.passwordResetExpiresAt < Date.now() || customer.passwordResetTokenHash !== await hashToken(body.token)) return json({ success: false, error: "This reset link is invalid or expired." }, 400, origin);
            await updateCustomerDocumentWithFirestoreRest("reset-password", `customers/${customerRecord.id}`, { passwordHash: { stringValue: await createPasswordHash(body.newPassword) } }, env, { deletedFields: ["passwordResetTokenHash", "passwordResetExpiresAt"], incrementSessionVersion: true });
            return json({ success: true, message: "Password reset successfully." }, 200, origin);
        }
        if (path === "/login") {
            diagnosticStep = "turnstile_verification";
            if (!await verifyTurnstile(body.turnstileToken, request, env)) return json({ success: false, error: "Verification failed." }, 401, origin);
            if (!body.username || !body.password) return json({ success: false, error: "Username and password are required." }, 400, origin);
            diagnosticStep = "login_username_lookup";
            const customerRecord = await findCustomerByUsername(body.username, env);
            console.info("Customer login username lookup completed.", { found: Boolean(customerRecord) });
            if (!customerRecord) {

                console.info("Customer login failed.", { stage: "username_not_found" });
                return json({ success: false, error: "Invalid username or password." }, 401, origin);

            }
            const doc = { id: customerRecord.id }, customer = customerRecord.data;
            const [hashAlgorithm, hashIterations] = String(customer.passwordHash || "").split("$");
            console.info("Customer login credential record loaded.", {
                customerDocumentId: doc.id,
                passwordHashExists: Boolean(customer.passwordHash),
                hashAlgorithm: hashAlgorithm || null,
                hashIterations: hashIterations || null
            });
            if (!customer.passwordHash) {

                console.info("Customer login failed.", { stage: "password_hash_missing", customerDocumentId: doc.id });
                return json({ success: false, error: "Invalid username or password." }, 401, origin);

            }
            diagnosticStep = "password_hash_verification";
            const passwordVerified = await passwordMatches(body.password, customer.passwordHash);
            console.info("Customer login password verification completed.", {
                customerDocumentId: doc.id,
                passwordVerified
            });
            if (!passwordVerified) return json({ success: false, error: "Invalid username or password." }, 401, origin);
            diagnosticStep = "jwt_session_creation";
            const session = await signJwt({ sub: doc.id, sv: Number(customer.sessionVersion || 0), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, env.JWT_SECRET);
            return json({ success: true, session }, 200, origin);
        }
        diagnosticStep = "session_validation";
        const session = await requireSession(request, env);
        if (path === "/offers") {
            return handleCustomerOffers(body, session, env, origin);
        }
        if (path === "/resend-verification-email") {
            if (session.customer.emailVerified) return json({ success: true, message: "Email is already verified." }, 200, origin);
            await sendVerificationEmail(session.customerPath, session.customer, env);
            return json({ success: true, message: "Verification email sent successfully." }, 200, origin);
        }
        if (path === "/session") return json({ success: true, customer: safeCustomer(session.customer) }, 200, origin);
        if (path === "/customer-dashboard") {
            diagnosticStep = "customer_dashboard_jobs_query";
            const jobs = await findJobsByCustomerId(session.customer.customerId, env);
            return json({ success: true, customer: safeCustomer(session.customer), jobs }, 200, origin);
        }
        if (path === "/change-password") {
            if (!body.currentPassword || !body.newPassword) return json({ success: false, error: "Current and new passwords are required." }, 400, origin);
            if (!await passwordMatches(body.currentPassword, session.customer.passwordHash)) return json({ success: false, error: "Current password is incorrect." }, 401, origin);
            if (body.currentPassword === body.newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%&*!?]).{8,}$/.test(body.newPassword)) return json({ success: false, error: "New password does not meet the security requirements." }, 400, origin);
            const nextSessionVersion = Number(session.customer.sessionVersion || 0) + 1;
            await updateCustomerDocumentWithFirestoreRest("change-password", session.customerPath, { passwordHash: { stringValue: await createPasswordHash(body.newPassword) } }, env, { incrementSessionVersion: true });
            const nextSession = await signJwt({ sub: session.claims.sub, sv: nextSessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }, env.JWT_SECRET);
            return json({ success: true, message: "Password updated successfully.", session: nextSession }, 200, origin);
        }
        if (path === "/logout") { await updateCustomerDocumentWithFirestoreRest("logout", session.customerPath, {}, env, { incrementSessionVersion: true }); return json({ success: true }, 200, origin); }
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
                : "Request could not be completed.",
            ...(error.code ? { code: error.code } : {})
        }, error.status || 500, origin);
    }
} };
