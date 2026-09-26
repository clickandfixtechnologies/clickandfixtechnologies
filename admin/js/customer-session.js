const AUTH_WORKER_URL =
    "https://jolly-thunder-4929cf-auth-worker.clicknfixtechnologies.workers.dev";

const CUSTOMER_SESSION_KEY = "customerSession";

function getCustomerSession() {
    return localStorage.getItem(CUSTOMER_SESSION_KEY) || "";
}

function saveCustomerSession(session) {
    if (!session || typeof session !== "string") {
        throw new Error("Invalid customer session.");
    }

    localStorage.setItem(CUSTOMER_SESSION_KEY, session);
}

function clearCustomerSession() {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    localStorage.removeItem("customerLogin");
    localStorage.removeItem("customerData");
}

function decodeBase64Url(value) {
    const normalized = String(value || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padding = normalized.length % 4;

    const padded =
        padding === 0
            ? normalized
            : normalized + "=".repeat(4 - padding);

    return atob(padded);
}

function getSessionPayload() {
    const session = getCustomerSession();

    if (!session) {
        return null;
    }

    try {
        const parts = session.split(".");

        if (parts.length !== 3) {
            return null;
        }

        const payload = decodeBase64Url(parts[1]);

        return JSON.parse(payload);
    }
    catch (error) {
        console.error("Customer session payload decode failed.", error);
        return null;
    }
}

function isSessionExpired() {
    const payload = getSessionPayload();

    if (!payload) {
        return true;
    }

    if (!payload.exp) {
        return true;
    }

    return Number(payload.exp) <= Math.floor(Date.now() / 1000);
}

async function workerRequest(path, body = {}) {
    const session = getCustomerSession();

    const response = await fetch(
        `${AUTH_WORKER_URL}${path}`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",

                ...(session
                    ? {
                        "Authorization": `Bearer ${session}`
                    }
                    : {})
            },

            body: JSON.stringify(body)
        }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
        throw new Error(
            result.error ||
            `Request failed (${response.status}).`
        );
    }

    return result;
}

async function validateCustomerSession() {
    const session = getCustomerSession();

    if (!session) {
        return null;
    }

    if (isSessionExpired()) {
        console.warn("Customer session is expired.");
        clearCustomerSession();
        return null;
    }

    try {
        const result = await workerRequest("/session");

        if (!result?.customer) {
            throw new Error("Customer session validation returned no customer.");
        }

        return result.customer;
    }
    catch (error) {
        console.error(
            "Customer session validation failed:",
            error
        );

        clearCustomerSession();

        return null;
    }
}

function startSessionExpiryTimer(onExpired) {
    const payload = getSessionPayload();

    if (!payload?.exp) {
        return;
    }

    const expiresAt = Number(payload.exp) * 1000;
    const delay = Math.max(
        0,
        expiresAt - Date.now()
    );

    window.setTimeout(() => {
        clearCustomerSession();

        if (typeof onExpired === "function") {
            onExpired();
        }
    }, delay);
}

export {
    clearCustomerSession,
    getCustomerSession,
    isSessionExpired,
    saveCustomerSession,
    startSessionExpiryTimer,
    validateCustomerSession,
    workerRequest
};