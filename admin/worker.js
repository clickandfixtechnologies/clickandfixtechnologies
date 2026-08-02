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
const PBKDF2_ITERATIONS = 100000;
const WEB_CRYPTO_PBKDF2_MAX_ITERATIONS = 100000;

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

async function findCustomerByUsername(username, env) {
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
                            field: { fieldPath: "username" },
                            op: "EQUAL",
                            value: { stringValue: String(username).trim() }
                        }
                    },
                    limit: 1
                }
            })
        }
    );

    if (!response.ok) throw new Error(`Firestore username query failed (${response.status}).`);

    const responseText = await response.text();
    console.info("Firestore REST JSON parsing started.", { field: "runQueryResponse" });
    const parsedResponse = JSON.parse(responseText);
    const results = Array.isArray(parsedResponse)
        ? parsedResponse
        : [parsedResponse];
    const match = results.find(result => result.document);

    return match ? firestoreRestDocumentToCustomer(match.document) : null;
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
}

async function patchFirestoreRestDocument(documentPath, fields, env) {
    const accessToken = await getFirestoreRestAccessToken(env);
    const updateMask = Object.keys(fields)
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
    const verificationFields = {
        emailVerified: false,
        emailVerificationTokenHash: await hashToken(token),
        emailVerificationExpiresAt: expiresAt
    };

    if (typeof customerRef === "string") {

        await patchFirestoreRestDocument(customerRef, {
            emailVerified: { booleanValue: false },
            emailVerificationTokenHash: { stringValue: verificationFields.emailVerificationTokenHash },
            emailVerificationExpiresAt: { integerValue: String(verificationFields.emailVerificationExpiresAt) }
        }, env);

    } else {

        await customerRef.update(verificationFields);

    }
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
    const customerPath = `customers/${claims.sub}`;
    console.info("Firestore REST document read.", {
        purpose: "session_validation",
        path: customerPath
    });
    const document = await getFirestoreRestDocument(customerPath, env);
    const customerRecord = document
        ? firestoreRestDocumentToCustomer(document)
        : null;

    if (!customerRecord || Number(customerRecord.data.sessionVersion || 0) !== Number(claims.sv || 0)) {

        throw new Error("Session expired.");

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
        if (path === "/resend-verification-email") {
            if (session.customer.emailVerified) return json({ success: true, message: "Email is already verified." }, 200, origin);
            await sendVerificationEmail(session.ref, session.customer, env);
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
